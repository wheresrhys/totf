SET check_function_bodies = false;
DROP FUNCTION public.aggregate_stats(species_name_filter text, from_date date, to_date date, ringing_group_filter bigint, group_by_species boolean, group_by_time_period text);
DROP FUNCTION public.public_aggregate_stats(species_name_filter text, from_date date, to_date date, ringing_group_filter bigint, group_by_species boolean, group_by_time_period text);
DROP TYPE public.aggregate_stats_result;
CREATE OR REPLACE FUNCTION public.core_stats(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text)
 RETURNS SETOF public.core_stats_result
 LANGUAGE plpgsql
AS $function$
  BEGIN
  RETURN QUERY
  -- The final projection below is wrapped in jsonb_populate_record rather than
  -- returned as a bare positional SELECT, so it binds to core_stats_result's
  -- columns by NAME instead of ordinal attribute position — see CLAUDE.md's
  -- "Composite-type RETURN QUERY binds by position, not name" section for why
  -- (confirmed empirically while building population_stats: two db:schema:apply
  -- runs on identical schema files produced two different physical attribute
  -- orders for the same composite type).
  SELECT (jsonb_populate_record(NULL::public.core_stats_result, to_jsonb(agg))).*
  FROM (
  -- Base windowed row source and grouping-cell spine, delegated to the shared
  -- stats_raw_encounters / stats_spine utility RPCs (#800) so this logic isn't
  -- duplicated between core_stats and population_stats. Each utility RPC is
  -- called exactly once here and materialized into a local CTE (reused by every
  -- downstream reference below), so the base tables aren't rescanned per use.
  WITH raw_encounters AS (
    SELECT * FROM public.stats_raw_encounters(species_name_filter, from_date, to_date, ringing_group_filter)
  ), spine AS (
    SELECT * FROM public.stats_spine(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ),
  stats_per_bird_month AS (
    -- Calculate per-bird statistics once
    SELECT
      re.species_id,
      re.bird_id,
      re.session_day,
      re.session_month,
      re.session_year,
      COUNT(*) AS encounter_count,
      MIN(re.visit_date) AS first_visit,
      MAX(re.visit_date) AS last_visit,
      MIN(re.max_hatch_year) AS min_max_hatch_year,
      EXTRACT(EPOCH FROM (MAX(re.visit_date)::timestamp - MIN(re.visit_date)::timestamp)) / 86400.0 AS time_span_days
    FROM raw_encounters re
    WHERE re.encounter_id IS NOT NULL
    GROUP BY re.species_id, re.bird_id, re.session_day, re.session_month, re.session_year
  ),
  -- Canonical per-encounter age classification and its bird-level bucket
  -- resolution, delegated to the shared stats_encounter_age_classification /
  -- stats_bird_age_bucket utility RPCs (#800) — see those files for the bucket
  -- definitions and bird-level precedence rules (pullus always wins; otherwise
  -- juv wins over postjuv), which mirror the single-encounter age classes
  -- defined in TypeScript by getAgeClass() (app/models/encounter.ts, #527) — keep
  -- the two in sync by hand.
  encounter_age_classification AS (
    SELECT * FROM public.stats_encounter_age_classification(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ),
  bird_age_bucket AS (
    SELECT * FROM public.stats_bird_age_bucket(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ),
  age_bucket_counts AS (
    SELECT
      bab.species_id,
      bab.time_period,
      COUNT(*) FILTER (WHERE bab.age_bucket = 'pullus') AS pullus_count,
      COUNT(*) FILTER (WHERE bab.age_bucket = 'juv') AS juv_count,
      COUNT(*) FILTER (WHERE bab.age_bucket = 'postjuv') AS postjuv_count,
      COUNT(*) FILTER (WHERE bab.age_bucket = 'adult') AS adult_count,
      COUNT(*) FILTER (WHERE bab.age_bucket = 'unknown') AS unknown_age_count
    FROM bird_age_bucket bab
    GROUP BY bab.species_id, bab.time_period
  ),
  -- Per-encounter age-bucket counts — the encounter-level cut, reading the canonical
  -- encounter_age_classification directly with no bird-level dedup or precedence. A
  -- retrapped-then-recaught bird whose encounters span different ages is counted once in
  -- each encounter's bucket here, unlike the bird-level buckets (age_bucket_counts) which
  -- resolve it to a single bucket.
  encounter_age_bucket_counts AS (
    SELECT
      eac.species_id,
      eac.time_period,
      COUNT(*) FILTER (WHERE eac.age_bucket = 'pullus') AS pullus_enc_count,
      COUNT(*) FILTER (WHERE eac.age_bucket = 'juv') AS juv_enc_count,
      COUNT(*) FILTER (WHERE eac.age_bucket = 'postjuv') AS postjuv_enc_count,
      COUNT(*) FILTER (WHERE eac.age_bucket = 'adult') AS adult_enc_count,
      COUNT(*) FILTER (WHERE eac.age_bucket = 'unknown') AS unknown_age_enc_count
    FROM encounter_age_classification eac
    GROUP BY eac.species_id, eac.time_period
  ),
  stats_per_species_period AS (
    -- Aggregate bird-level stats to species level
    SELECT
      CASE WHEN group_by_species THEN spbm.species_id ELSE NULL::bigint END AS species_id,
      CASE
        WHEN group_by_time_period = 'day' THEN spbm.session_day
        WHEN group_by_time_period = 'month' THEN spbm.session_month
        WHEN group_by_time_period = 'year' THEN spbm.session_year
        ELSE NULL::date
      END AS time_period,
      MAX(spbm.encounter_count) AS max_encounter_count,
      MAX(spbm.time_span_days) AS max_time_span_days,
      MAX(EXTRACT(YEAR FROM spbm.last_visit) - spbm.min_max_hatch_year) AS max_proven_age
    FROM stats_per_bird_month spbm
    GROUP BY CASE
      WHEN group_by_species THEN spbm.species_id
      ELSE NULL::bigint
    END, CASE
      WHEN group_by_time_period = 'day' THEN spbm.session_day
      WHEN group_by_time_period = 'month' THEN spbm.session_month
      WHEN group_by_time_period = 'year' THEN spbm.session_year
      ELSE NULL::date
    END
  ),
  session_counts AS (
    -- Count encounters per session per species
    SELECT
      re.species_id,
      re.session_id,
      date_trunc('day', re.visit_date)::DATE AS session_day,
      date_trunc('month', re.visit_date)::DATE AS session_month,
      date_trunc('year', re.visit_date)::DATE AS session_year,
      COUNT(*) AS encounter_count,
      COUNT(CASE WHEN re.record_type = 'N' THEN 1 END) AS new_encounter_count
    FROM raw_encounters re
    WHERE re.session_id IS NOT NULL
      AND re.session_type = 'FULL_GROWN'
    GROUP BY re.species_id, re.session_id, date_trunc('day', re.visit_date)::DATE, date_trunc('month', re.visit_date)::DATE, date_trunc('year', re.visit_date)::DATE
  ),
  aggregated_session_counts AS (
    -- Get max encounters per session per species
    SELECT
      CASE WHEN group_by_species THEN sc.species_id ELSE NULL::bigint END AS species_id,
      CASE
        WHEN group_by_time_period = 'day' THEN sc.session_day
        WHEN group_by_time_period = 'month' THEN sc.session_month
        WHEN group_by_time_period = 'year' THEN sc.session_year
        ELSE NULL::date
      END AS time_period,
      MAX(sc.encounter_count) AS max_per_session,
      MAX(sc.new_encounter_count) AS max_new_per_session,
      AVG(sc.encounter_count) AS avg_encounters_per_session
    FROM session_counts sc
    GROUP BY CASE
      WHEN group_by_species THEN sc.species_id
      ELSE NULL::bigint
    END, CASE
      WHEN group_by_time_period = 'day' THEN sc.session_day
      WHEN group_by_time_period = 'month' THEN sc.session_month
      WHEN group_by_time_period = 'year' THEN sc.session_year
      ELSE NULL::date
    END
  ), session_effort AS (
    SELECT
      re.session_id,
      -- realistically the minimum effort per session is 2 hours
      GREATEST(MAX(re.capture_time) - MIN(re.capture_time), '02:00:00'::interval) AS total_effort
    FROM raw_encounters re
    WHERE re.session_type = 'FULL_GROWN'
    GROUP BY re.session_id
  ), effort_per_period AS (
    SELECT
      CASE
        WHEN group_by_time_period = 'day' THEN re.session_day
        WHEN group_by_time_period = 'month' THEN re.session_month
        WHEN group_by_time_period = 'year' THEN re.session_year
        ELSE NULL::date
      END AS time_period,
      SUM(sess_effort.total_effort) AS total_effort,
      SUM(sess_effort.total_effort) / COUNT(DISTINCT re.session_id) AS effort_per_session
    FROM (
      SELECT DISTINCT re.session_id,
            date_trunc('day', re.visit_date)::DATE AS session_day,
            date_trunc('month', re.visit_date)::DATE AS session_month,
            date_trunc('year', re.visit_date)::DATE AS session_year
      FROM raw_encounters as re
    ) re
    JOIN session_effort sess_effort ON re.session_id = sess_effort.session_id
    GROUP BY
      CASE
        WHEN group_by_time_period = 'day' THEN re.session_day
        WHEN group_by_time_period = 'month' THEN re.session_month
        WHEN group_by_time_period = 'year' THEN re.session_year
        ELSE NULL::date
      END
  )
  SELECT

	  CASE WHEN group_by_species THEN spine.species_name ELSE NULL::text END AS "species_name",
    CASE
      WHEN group_by_time_period = 'day' THEN spine.time_period
      WHEN group_by_time_period = 'month' THEN spine.time_period
      WHEN group_by_time_period = 'year' THEN spine.time_period
    ELSE NULL::date END AS "time_period",

    COALESCE(COUNT(DISTINCT CASE WHEN raw_enc.session_type = 'FULL_GROWN' THEN raw_enc.visit_date END), 0) AS "session_count",
    COALESCE(effort.total_effort, '00:00:00'::interval) AS "total_effort",
    COALESCE(effort.effort_per_session, '00:00:00'::interval) AS "effort_per_session",
    COALESCE(effort.total_effort / NULLIF(COUNT(DISTINCT raw_enc.encounter_id), 0), '00:00:00'::interval) AS "effort_per_encounter",
    COALESCE(agg_sess.avg_encounters_per_session, 0) AS "avg_encounters_per_session",
    COALESCE(agg_sess.max_per_session, 0) AS "max_per_session",

    COALESCE(COUNT(DISTINCT raw_enc.species_id), 0) AS "species_count",
    COALESCE(COUNT(DISTINCT raw_enc.bird_id), 0) AS "bird_count",
    COALESCE(COUNT(DISTINCT raw_enc.encounter_id), 0) AS "encounter_count",

    COALESCE(COUNT(DISTINCT CASE WHEN raw_enc.record_type = 'N' THEN raw_enc.bird_id END), 0) AS "new_bird_count",

    -- Corrected bird-level age buckets (see bird_age_flags / bird_age_bucket above).
    -- pullus + juv + postjuv + adult + unknown_age = bird_count for every row. new_bird_count
    -- already carries an unambiguous suffix, so it gets no *_bird_count duplicate here.
    COALESCE(abc.pullus_count, 0) AS "pullus_bird_count",
    COALESCE(abc.juv_count, 0) AS "juv_bird_count",
    COALESCE(abc.postjuv_count, 0) AS "postjuv_bird_count",
    COALESCE(abc.adult_count, 0) AS "adult_bird_count",
    COALESCE(abc.unknown_age_count, 0) AS "unknown_age_bird_count",

    -- Per-encounter age buckets (see encounter_age_classification above). No new_enc_count /
    -- new_young_enc_count: record_type 'N' occurs at most once per bird, so the New (and
    -- New-young) encounter-level and bird-level views coincide by construction.
    COALESCE(eabc.pullus_enc_count, 0) AS "pullus_enc_count",
    COALESCE(eabc.juv_enc_count, 0) AS "juv_enc_count",
    COALESCE(eabc.postjuv_enc_count, 0) AS "postjuv_enc_count",
    COALESCE(eabc.adult_enc_count, 0) AS "adult_enc_count",
    COALESCE(eabc.unknown_age_enc_count, 0) AS "unknown_age_enc_count",

    COALESCE(agg_sess.max_new_per_session, 0) AS "max_new_per_session"

    -- agg_sta.max_encounter_count AS "max_encountered_bird",
    -- ROUND(
    --   100 * COUNT(DISTINCT CASE WHEN bm_stats.encounter_count > 1 THEN raw_enc.bird_id END)::numeric /
    --   NULLIF(COUNT(DISTINCT raw_enc.bird_id), 0)::numeric,
    --   0
    -- ) AS "pct_retrapped",
    -- ROUND(agg_sta.max_time_span_days, 0) AS "max_time_span_days",
    -- agg_sta.max_proven_age AS "max_proven_age"



  FROM spine
  LEFT JOIN raw_encounters raw_enc ON
  (NOT group_by_species OR spine.species_id = raw_enc.species_id)
  AND (
    (group_by_time_period = 'day' AND spine.time_period = raw_enc.session_day)
    OR (group_by_time_period = 'month' AND spine.time_period = raw_enc.session_month)
    OR (group_by_time_period = 'year' AND spine.time_period = raw_enc.session_year)
    OR (group_by_time_period IS NULL OR group_by_time_period NOT IN ('month', 'year', 'day'))
  )
  -- LEFT JOIN stats_per_bird_month bm_stats ON raw_enc.bird_id = bm_stats.bird_id
  LEFT JOIN effort_per_period effort ON
  CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = effort.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = effort.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = effort.time_period
    ELSE true
  END
  LEFT JOIN stats_per_species_period agg_sta ON CASE WHEN group_by_species THEN spine.species_id = agg_sta.species_id ELSE true END
  AND
  CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = agg_sta.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = agg_sta.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = agg_sta.time_period
    ELSE true
  END
  LEFT JOIN aggregated_session_counts agg_sess ON CASE WHEN group_by_species THEN spine.species_id = agg_sess.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = agg_sess.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = agg_sess.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = agg_sess.time_period
    ELSE true
  END
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
  GROUP BY CASE
    WHEN group_by_species THEN spine.species_id
    ELSE NULL::bigint
  END, CASE
    WHEN group_by_species THEN spine.species_name
    ELSE NULL::text
  END,CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period
    ELSE NULL::date
  END, agg_sta.max_encounter_count, agg_sess.max_per_session,
  -- agg_sta.max_proven_age, agg_sta.max_time_span_days,
  agg_sess.max_new_per_session, effort.total_effort, effort.effort_per_session, agg_sess.avg_encounters_per_session,
  abc.pullus_count, abc.juv_count, abc.postjuv_count, abc.adult_count, abc.unknown_age_count,
  eabc.pullus_enc_count, eabc.juv_enc_count, eabc.postjuv_enc_count, eabc.adult_enc_count, eabc.unknown_age_enc_count
  ) AS agg
  ORDER BY agg.species_name ASC, agg.time_period ASC;

END;
$function$;
CREATE OR REPLACE FUNCTION public.demographics_stats(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text)
 RETURNS SETOF public.demographics_stats_result
 LANGUAGE plpgsql
AS $function$
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
  -- Mirrors core_stats' age_bucket_counts, restricted to the columns this RPC
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
      -- derivation to core_stats.new_young_bird_count.
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
CREATE OR REPLACE FUNCTION public.population_stats(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text)
 RETURNS SETOF public.population_stats_result
 LANGUAGE plpgsql
AS $function$
  BEGIN
  RETURN QUERY
  SELECT (jsonb_populate_record(NULL::public.population_stats_result, to_jsonb(agg))).*
  FROM (
  WITH spine AS (
    SELECT * FROM public.stats_spine(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ), encounter_age_classification AS (
    SELECT * FROM public.stats_encounter_age_classification(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ), bird_age_bucket AS (
    SELECT * FROM public.stats_bird_age_bucket(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ),
  -- Bird-level bucket counts (context columns + the new_young_bird_count copy).
  -- Mirrors core_stats' age_bucket_counts, restricted to the columns this RPC
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
      -- derivation to core_stats.new_young_bird_count.
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
