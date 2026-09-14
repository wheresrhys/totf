SET check_function_bodies = false;
DROP FUNCTION public.agg_bird_age_bucket(IN species_name_filter text, IN from_date date, IN to_date date, IN ringing_group_filter bigint, IN group_by_species boolean, IN group_by_time_period text);
DROP FUNCTION public.agg_encounter_age_classification(IN species_name_filter text, IN from_date date, IN to_date date, IN ringing_group_filter bigint, IN group_by_species boolean, IN group_by_time_period text);
DROP FUNCTION public.agg_raw_encounters(IN species_name_filter text, IN from_date date, IN to_date date, IN ringing_group_filter bigint);
DROP FUNCTION public.agg_spine(IN species_name_filter text, IN from_date date, IN to_date date, IN ringing_group_filter bigint, IN group_by_species boolean, IN group_by_time_period text);
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
CREATE FUNCTION public.stats_bird_age_bucket(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text)
 RETURNS TABLE(bird_id bigint, species_id bigint, time_period date, has_new boolean, age_bucket text)
 LANGUAGE sql
 STABLE
AS $function$
  WITH encounter_age_classification AS (
    SELECT * FROM public.stats_encounter_age_classification(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ), bird_age_flags AS (
    SELECT
      eac.bird_id,
      eac.species_id,
      eac.time_period,
      COALESCE(bool_or(eac.age_bucket = 'pullus'), FALSE) AS has_pullus,
      COALESCE(bool_or(eac.age_bucket = 'juv'), FALSE) AS has_juv,
      COALESCE(bool_or(eac.age_bucket = 'postjuv'), FALSE) AS has_postjuv,
      COALESCE(bool_or(eac.age_bucket = 'adult'), FALSE) AS has_adult,
      COALESCE(bool_or(eac.record_type = 'N'), FALSE) AS has_new
    FROM encounter_age_classification eac
    GROUP BY eac.bird_id, eac.species_id, eac.time_period
  )
  SELECT
    baf.bird_id,
    baf.species_id,
    baf.time_period,
    baf.has_new,
    CASE
      WHEN baf.has_pullus THEN 'pullus'
      WHEN baf.has_juv AND NOT baf.has_adult THEN 'juv'
      WHEN baf.has_postjuv AND NOT baf.has_juv AND NOT baf.has_adult THEN 'postjuv'
      WHEN baf.has_adult AND NOT baf.has_juv AND NOT baf.has_postjuv THEN 'adult'
      ELSE 'unknown'
    END AS age_bucket
  FROM bird_age_flags baf;
$function$;
GRANT ALL ON FUNCTION public.stats_bird_age_bucket(text, date, date, bigint, boolean, text) TO anon;
GRANT ALL ON FUNCTION public.stats_bird_age_bucket(text, date, date, bigint, boolean, text) TO authenticated;
GRANT ALL ON FUNCTION public.stats_bird_age_bucket(text, date, date, bigint, boolean, text) TO service_role;
CREATE FUNCTION public.stats_encounter_age_classification(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text)
 RETURNS TABLE(encounter_id bigint, bird_id bigint, record_type text, age_code smallint, is_juv boolean, visit_date date, species_id bigint, time_period date, age_bucket text)
 LANGUAGE sql
 STABLE
AS $function$
  WITH raw_encounters AS (
    SELECT * FROM public.stats_raw_encounters(species_name_filter, from_date, to_date, ringing_group_filter)
  )
  SELECT
    re.encounter_id,
    re.bird_id,
    re.record_type,
    re.age_code,
    re.is_juv,
    re.visit_date,
    CASE WHEN group_by_species THEN re.species_id ELSE NULL::bigint END AS species_id,
    CASE
      WHEN group_by_time_period = 'day' THEN re.session_day
      WHEN group_by_time_period = 'month' THEN re.session_month
      WHEN group_by_time_period = 'year' THEN re.session_year
      ELSE NULL::date
    END AS time_period,
    CASE
      WHEN re.age_code = 1 AND NOT re.is_juv THEN 'pullus'
      WHEN re.is_juv AND re.age_code IN (1, 3) THEN 'juv'
      WHEN re.age_code = 3 AND NOT re.is_juv THEN 'postjuv'
      WHEN re.age_code > 3 THEN 'adult'
      ELSE 'unknown'
    END AS age_bucket
  FROM raw_encounters re
  WHERE re.encounter_id IS NOT NULL;
$function$;
GRANT ALL ON FUNCTION public.stats_encounter_age_classification(text, date, date, bigint, boolean, text) TO anon;
GRANT ALL ON FUNCTION public.stats_encounter_age_classification(text, date, date, bigint, boolean, text) TO authenticated;
GRANT ALL ON FUNCTION public.stats_encounter_age_classification(text, date, date, bigint, boolean, text) TO service_role;
CREATE FUNCTION public.stats_raw_encounters(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint)
 RETURNS TABLE(species_id bigint, species_name text, bird_id bigint, ring_no text, encounter_id bigint, weight real, wing_length smallint, record_type text, age_code smallint, is_juv boolean, session_id bigint, visit_date date, session_type text, max_hatch_year smallint, capture_time time without time zone, session_day date, session_month date, session_year date)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    sp.id AS species_id,
    sp.species_name,
    b.id AS bird_id,
    b.ring_no,
    e.id AS encounter_id,
    e.weight,
    e.wing_length,
    e.record_type,
    e.age_code,
    e.is_juv,
    sess.id AS session_id,
    sess.visit_date,
    sess.session_type,
    e.max_hatch_year,
    e.capture_time,
    date_trunc('day', sess.visit_date)::DATE AS session_day,
    date_trunc('month', sess.visit_date)::DATE AS session_month,
    date_trunc('year', sess.visit_date)::DATE AS session_year
  FROM public."Species" sp
  JOIN public."Birds" b ON sp.id = b.species_id
  LEFT JOIN public."Encounters" e ON b.id = e.bird_id
  LEFT JOIN public."Sessions" sess ON e.session_id = sess.id
  WHERE (from_date IS NULL OR sess.visit_date >= from_date)
   AND (to_date IS NULL OR sess.visit_date <= to_date)
   AND (species_name_filter IS NULL OR sp.species_name = species_name_filter)
   AND (ringing_group_filter IS NULL OR sess.ringing_group_id = ringing_group_filter);
$function$;
GRANT ALL ON FUNCTION public.stats_raw_encounters(text, date, date, bigint) TO anon;
GRANT ALL ON FUNCTION public.stats_raw_encounters(text, date, date, bigint) TO authenticated;
GRANT ALL ON FUNCTION public.stats_raw_encounters(text, date, date, bigint) TO service_role;
CREATE FUNCTION public.stats_spine(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text)
 RETURNS TABLE(species_id bigint, species_name text, time_period date)
 LANGUAGE sql
 STABLE
AS $function$
  WITH raw_encounters AS (
    SELECT * FROM public.stats_raw_encounters(species_name_filter, from_date, to_date, ringing_group_filter)
  ), species_spine AS (
    SELECT
      DISTINCT re.species_id, re.species_name
    FROM raw_encounters as re
    WHERE (species_name_filter IS NULL OR re.species_name = species_name_filter)
    AND group_by_species

    UNION ALL

    SELECT NULL::bigint, NULL::text
    WHERE NOT group_by_species
  ), session_date_range AS (
    SELECT
      MIN(sess.visit_date) AS min_date,
      MAX(sess.visit_date) AS max_date
    FROM public."Sessions" as sess
    WHERE (from_date IS NULL OR sess.visit_date >= from_date)
      AND (to_date IS NULL OR sess.visit_date <= to_date)
  ), period_spine AS (
    SELECT date_trunc('month', d)::date AS time_period
    FROM session_date_range sdr,
    LATERAL generate_series(
      date_trunc('month', COALESCE(sdr.min_date, from_date, CURRENT_DATE))::timestamp,
      date_trunc('month', COALESCE(sdr.max_date, to_date, CURRENT_DATE))::timestamp,
      '1 month'::interval
    ) d
    WHERE group_by_time_period = 'month'
      AND sdr.min_date IS NOT NULL
      AND sdr.max_date IS NOT NULL

    UNION ALL

    SELECT date_trunc('year', d)::date AS time_period
    FROM session_date_range sdr,
    LATERAL generate_series(
      date_trunc('year', COALESCE(sdr.min_date, from_date, CURRENT_DATE))::timestamp,
      date_trunc('year', COALESCE(sdr.max_date, to_date, CURRENT_DATE))::timestamp,
      '1 year'::interval
    ) d
    WHERE group_by_time_period = 'year'
      AND sdr.min_date IS NOT NULL
      AND sdr.max_date IS NOT NULL

    UNION ALL

    -- The 'day' spine is sparse: one row per distinct session date actually present
    -- in the filtered data, unlike the dense month/year spines (which span every
    -- period in the min..max range, including empty ones). A dense day spine would
    -- emit a row for every calendar day in range — thousands of mostly-empty rows —
    -- so we key off the encounter data instead, and days with no session never appear.
    SELECT DISTINCT re.session_day AS time_period
    FROM raw_encounters re
    WHERE group_by_time_period = 'day'
      AND re.session_day IS NOT NULL

    UNION ALL

    SELECT NULL::date
    WHERE group_by_time_period IS NULL OR group_by_time_period NOT IN ('month', 'year', 'day')
  )
  SELECT s.species_id, s.species_name, p.time_period
  FROM species_spine s
  CROSS JOIN period_spine p;
$function$;
GRANT ALL ON FUNCTION public.stats_spine(text, date, date, bigint, boolean, text) TO anon;
GRANT ALL ON FUNCTION public.stats_spine(text, date, date, bigint, boolean, text) TO authenticated;
GRANT ALL ON FUNCTION public.stats_spine(text, date, date, bigint, boolean, text) TO service_role;
