-- Age-split (new_adult/first_summer/old_timers) and young-trends
-- (postjuv_juv/new_postjuv_juv/new_postjuv) derivations for the planned Age-split
-- and Young-trends species-page charts (#800). Split out of aggregate_stats into
-- its own RPC rather than folded into that already-large single query, both to
-- keep each query's plan simpler and to leave aggregate_stats' existing
-- columns/performance untouched. Shares aggregate_stats' input signature and
-- reuses its underlying plumbing via the stats_raw_encounters / stats_spine /
-- stats_encounter_age_classification / stats_bird_age_bucket utility RPCs (each
-- mirrors, and must be kept in sync by hand with, the equivalent inline CTE still
-- living in aggregate_stats.sql).
--
-- The final projection below is wrapped in jsonb_populate_record rather than
-- returned as a bare positional SELECT. A bare `RETURN QUERY SELECT ...` binds to
-- demographics_stats_result's columns by ORDINAL POSITION, not by the "AS" alias
-- names below — and that position is only as stable as whatever DDL a given
-- environment's schema-diff run happens to emit for the composite type's
-- attributes (`ALTER TYPE ... ADD ATTRIBUTE` order is not guaranteed to match this
-- file's declared column order — confirmed while building this RPC: two
-- `db:schema:apply` runs on the same source files produced two different physical
-- attribute orders, silently scrambling values into the wrong named columns with
-- no error). Routing through to_jsonb(...)/jsonb_populate_record binds every
-- column by NAME instead, so the result is correct regardless of the composite
-- type's physical attribute order in any given environment.
CREATE FUNCTION public.demographics_stats (
	species_name_filter text DEFAULT NULL::text,
	from_date date DEFAULT NULL::date,
	to_date date DEFAULT NULL::date,
	ringing_group_filter bigint DEFAULT NULL::bigint,
	group_by_species boolean DEFAULT FALSE,
	group_by_time_period text DEFAULT NULL::text
) RETURNS SETOF public.demographics_stats_result LANGUAGE plpgsql AS $function$
  BEGIN
  RETURN QUERY
  SELECT (jsonb_populate_record(NULL::public.demographics_stats_result, to_jsonb(agg))).*
  FROM (
  WITH spine AS (
    SELECT * FROM public.stats_spine(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ), encounter_age_classification AS (
    SELECT * FROM public.stats_encounter_age_classification(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ), bird_age_bucket AS (
    SELECT * FROM public.stats_bird_age_bucket(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ),
  -- Bird-level bucket counts (context columns + the new_young_bird_count copy).
  -- Mirrors aggregate_stats' age_bucket_counts, restricted to the columns this RPC
  -- exposes.
  age_bucket_counts AS (
    SELECT
      bab.species_id,
      bab.time_period,
      COUNT(*) FILTER (WHERE bab.age_bucket = 'juv') AS juv_count,
      COUNT(*) FILTER (WHERE bab.age_bucket = 'adult') AS adult_count,
      -- New young bird: in a young bucket (pullus/juv/postjuv) AND has any New ('N')
      -- encounter in the cell. Bucket membership and New membership are checked
      -- independently — not required to be the same encounter row. Identical
      -- derivation to aggregate_stats.new_young_bird_count.
      COUNT(*) FILTER (
        WHERE bab.age_bucket IN ('pullus', 'juv', 'postjuv') AND bab.has_new
      ) AS new_young_count
    FROM bird_age_bucket bab
    GROUP BY bab.species_id, bab.time_period
  ),
  -- Per-encounter counts: the young-trends columns plus the juv_enc_count /
  -- postjuv_enc_count context columns. juv_enc_count combines 1J and 3J;
  -- postjuv_juv_enc_count/new_postjuv_juv_enc_count break out the 3J-only slice
  -- (age_code = 3 AND is_juv) plus New-record variants. new_postjuv_enc_count is
  -- the non-juv sibling: bare age-3 New records.
  encounter_age_bucket_counts AS (
    SELECT
      eac.species_id,
      eac.time_period,
      COUNT(*) FILTER (WHERE eac.age_bucket = 'juv') AS juv_enc_count,
      COUNT(*) FILTER (WHERE eac.age_bucket = 'postjuv') AS postjuv_enc_count,
      COUNT(*) FILTER (WHERE eac.age_code = 3 AND eac.is_juv) AS postjuv_juv_enc_count,
      COUNT(*) FILTER (WHERE eac.age_code = 3 AND eac.is_juv AND eac.record_type = 'N') AS new_postjuv_juv_enc_count,
      COUNT(*) FILTER (WHERE eac.age_code = 3 AND NOT eac.is_juv AND eac.record_type = 'N') AS new_postjuv_enc_count
    FROM encounter_age_classification eac
    GROUP BY eac.species_id, eac.time_period
  ),
  -- Unwindowed lifetime history for every bird in this query's spine, scoped to
  -- ringing_group_filter but IGNORING from_date/to_date. This is the only data
  -- source in this RPC that is NOT limited to the query window — the age-split
  -- columns need a bird's full history with this group ("first-ever with this
  -- group", "what age was it recorded the year before"), which a windowed source
  -- can't answer. Group scoping mirrors stats_raw_encounters' pattern so a bird's
  -- history under a DIFFERENT group never counts as history with this one.
  lifetime_encounters AS (
    SELECT
      e.bird_id,
      e.age_code,
      e.is_juv,
      EXTRACT(YEAR FROM sess.visit_date)::int AS enc_year
    FROM public."Encounters" e
    JOIN public."Sessions" sess ON e.session_id = sess.id
    WHERE (ringing_group_filter IS NULL OR sess.ringing_group_id = ringing_group_filter)
      AND e.bird_id IN (SELECT DISTINCT bab.bird_id FROM bird_age_bucket bab WHERE bab.bird_id IS NOT NULL)
  ),
  -- First calendar year each bird was ever encountered by this group (unwindowed).
  bird_first_year AS (
    SELECT le.bird_id, MIN(le.enc_year) AS first_year
    FROM lifetime_encounters le
    GROUP BY le.bird_id
  ),
  -- Per (bird, calendar year) tally of how many of that year's encounters were
  -- recorded at age_code IN (1, 3) (i.e. a "young" age reading — 1, 1J, 3 or 3J;
  -- is_juv is irrelevant here, only age_code ∈ {1,3}) vs the year's total. Consumed
  -- by the first_summer vs old_timers majority vote for year (period_year − 1).
  bird_year_age_stats AS (
    SELECT
      le.bird_id,
      le.enc_year,
      COUNT(*) FILTER (WHERE le.age_code IN (1, 3)) AS young_age_count,
      COUNT(*) AS total_count
    FROM lifetime_encounters le
    GROUP BY le.bird_id, le.enc_year
  ),
  -- Resolve the calendar year each (species, time_period) cell represents, for the
  -- adult age-split classification. period_year resolution rule: use the cell's
  -- own time_period when the query is grouped by day/month/year (EXTRACT(YEAR) of
  -- the truncated date is the calendar year); when ungrouped (time_period IS
  -- NULL), fall back to the latest visit date actually present in the cell. These
  -- columns are primarily meaningful under group_by_time_period='year' (the mode
  -- the Age-split chart uses); the fallback merely keeps them well-defined and
  -- non-throwing in every other grouping mode rather than special-casing.
  cell_period_year AS (
    SELECT
      eac.species_id,
      eac.time_period,
      EXTRACT(YEAR FROM COALESCE(eac.time_period, MAX(eac.visit_date)))::int AS period_year
    FROM encounter_age_classification eac
    GROUP BY eac.species_id, eac.time_period
  ),
  -- Classify each adult-bucketed bird (per cell) into exactly one of the three
  -- age-split kinds. new_adult: first-ever-with-group year equals this cell's
  -- period_year. first_summer: first year is earlier AND a strict majority of the
  -- bird's encounters with this group in year (period_year − 1) were age_code IN (1,3).
  -- old_timers: everything else (majority not-young, a tie, or no encounters that prior
  -- year). Only bab.age_bucket = 'adult' birds are considered, so the three counts sum
  -- to adult_bird_count. IS NOT DISTINCT FROM makes the cell join NULL-safe for the
  -- ungrouped case (species_id / time_period are NULL). LEFT JOINs keep every adult
  -- bird represented exactly once even in the (data-impossible) event a lifetime row
  -- is missing — the ELSE 'old_timers' branch is total.
  adult_age_split AS (
    SELECT
      bab.species_id,
      bab.time_period,
      CASE
        WHEN bfy.first_year = py.period_year THEN 'new_adult'
        WHEN COALESCE(prev.young_age_count, 0) * 2 > COALESCE(prev.total_count, 0) THEN 'first_summer'
        ELSE 'old_timers'
      END AS split
    FROM bird_age_bucket bab
    JOIN cell_period_year py
      ON py.species_id IS NOT DISTINCT FROM bab.species_id
     AND py.time_period IS NOT DISTINCT FROM bab.time_period
    LEFT JOIN bird_first_year bfy ON bfy.bird_id = bab.bird_id
    LEFT JOIN bird_year_age_stats prev
      ON prev.bird_id = bab.bird_id AND prev.enc_year = py.period_year - 1
    WHERE bab.age_bucket = 'adult'
  ),
  adult_split_counts AS (
    SELECT
      aas.species_id,
      aas.time_period,
      COUNT(*) FILTER (WHERE aas.split = 'new_adult') AS new_adult_bird_count,
      COUNT(*) FILTER (WHERE aas.split = 'first_summer') AS first_summer_bird_count,
      COUNT(*) FILTER (WHERE aas.split = 'old_timers') AS old_timers_bird_count
    FROM adult_age_split aas
    GROUP BY aas.species_id, aas.time_period
  )
  SELECT
    CASE WHEN group_by_species THEN spine.species_name ELSE NULL::text END AS "species_name",
    CASE
      WHEN group_by_time_period = 'day' THEN spine.time_period
      WHEN group_by_time_period = 'month' THEN spine.time_period
      WHEN group_by_time_period = 'year' THEN spine.time_period
      ELSE NULL::date
    END AS "time_period",

    COALESCE(abc.adult_count, 0) AS "adult_bird_count",
    COALESCE(abc.juv_count, 0) AS "juv_bird_count",
    COALESCE(eabc.juv_enc_count, 0) AS "juv_enc_count",
    COALESCE(eabc.postjuv_enc_count, 0) AS "postjuv_enc_count",

    COALESCE(abc.new_young_count, 0) AS "new_young_bird_count",

    -- Age-split subsets of adult_bird_count; sum to adult_bird_count per row.
    COALESCE(asc2.new_adult_bird_count, 0) AS "new_adult_bird_count",
    COALESCE(asc2.first_summer_bird_count, 0) AS "first_summer_bird_count",
    COALESCE(asc2.old_timers_bird_count, 0) AS "old_timers_bird_count",

    -- Young-trends encounter-level counts; 3J-only slice of juv_enc_count + New variants.
    COALESCE(eabc.postjuv_juv_enc_count, 0) AS "postjuv_juv_enc_count",
    COALESCE(eabc.new_postjuv_juv_enc_count, 0) AS "new_postjuv_juv_enc_count",
    COALESCE(eabc.new_postjuv_enc_count, 0) AS "new_postjuv_enc_count"

  FROM spine
  LEFT JOIN age_bucket_counts abc ON CASE WHEN group_by_species THEN spine.species_id = abc.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = abc.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = abc.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = abc.time_period
    ELSE true
  END
  LEFT JOIN encounter_age_bucket_counts eabc ON CASE WHEN group_by_species THEN spine.species_id = eabc.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = eabc.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = eabc.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = eabc.time_period
    ELSE true
  END
  LEFT JOIN adult_split_counts asc2 ON CASE WHEN group_by_species THEN spine.species_id = asc2.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = asc2.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = asc2.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = asc2.time_period
    ELSE true
  END
  ) AS agg
  ORDER BY agg.species_name ASC, agg.time_period ASC;

END;
$function$;

GRANT ALL ON FUNCTION public.demographics_stats (text, date, date, bigint, boolean, text) TO anon;

GRANT ALL ON FUNCTION public.demographics_stats (text, date, date, bigint, boolean, text) TO authenticated;

GRANT ALL ON FUNCTION public.demographics_stats (text, date, date, bigint, boolean, text) TO service_role;
