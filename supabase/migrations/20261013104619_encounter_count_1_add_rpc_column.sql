SET check_function_bodies = false;
ALTER TYPE public.biometrics_stats_result ADD ATTRIBUTE encounter_count bigint;
ALTER TYPE public.demographics_stats_result ADD ATTRIBUTE encounter_count bigint;
CREATE OR REPLACE FUNCTION public.biometrics_stats(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text, year_filter smallint DEFAULT NULL::smallint, month_filter smallint DEFAULT NULL::smallint)
 RETURNS SETOF public.biometrics_stats_result
 LANGUAGE plpgsql
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
  BEGIN
  RETURN QUERY
  -- jsonb_populate_record is evaluated via CROSS JOIN LATERAL (once per outer
  -- row) rather than as a bare `(...).* ` projection: Postgres does not
  -- common-subexpression-eliminate a repeated function call across SELECT
  -- target-list entries, so `(jsonb_populate_record(...)).* ` gets expanded at
  -- parse time into one independent call PER output column — each re-running
  -- to_jsonb(agg) and jsonb_populate_record from scratch just to extract one
  -- field, multiplying cost by column count for no benefit (see core_stats.sql,
  -- where this was measured at ~90% of total runtime). The LATERAL form still
  -- binds by NAME (see above) but computes the populated record exactly once
  -- per row.
  SELECT r.*
  FROM (
  WITH raw_encounters AS (
    SELECT * FROM public.stats_raw_encounters(species_name_filter, from_date, to_date, ringing_group_filter, year_filter, month_filter)
  ), spine AS (
    SELECT * FROM public.stats_spine(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
  )
  SELECT
    CASE WHEN group_by_species THEN spine.species_name ELSE NULL::text END AS "species_name",
    CASE
      WHEN group_by_time_period = 'day' THEN spine.time_period
      WHEN group_by_time_period = 'month' THEN spine.time_period
      WHEN group_by_time_period = 'year' THEN spine.time_period
      WHEN group_by_time_period = 'month-squashed' THEN spine.time_period
      ELSE NULL::date
    END AS "time_period",

    COALESCE(COUNT(DISTINCT raw_enc.encounter_id), 0) AS "encounter_count",

    MAX(raw_enc.weight) AS "max_weight",
    ROUND(AVG(raw_enc.weight)::numeric, 1) AS "avg_weight",
    MIN(raw_enc.weight) AS "min_weight",
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY raw_enc.weight)::numeric, 1) AS "median_weight",

    MAX(raw_enc.wing_length) AS "max_wing",
    ROUND(AVG(raw_enc.wing_length)::numeric, 1) AS "avg_wing",
    MIN(raw_enc.wing_length) AS "min_wing",
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY raw_enc.wing_length)::numeric, 0) AS "median_wing"

  FROM spine
  LEFT JOIN raw_encounters raw_enc ON
  (NOT group_by_species OR spine.species_id = raw_enc.species_id)
  AND (
    (group_by_time_period = 'day' AND spine.time_period = raw_enc.session_day)
    OR (group_by_time_period = 'month' AND spine.time_period = raw_enc.session_month)
    OR (group_by_time_period = 'year' AND spine.time_period = raw_enc.session_year)
    OR (group_by_time_period = 'month-squashed' AND spine.time_period = raw_enc.session_month_squashed)
    OR (group_by_time_period IS NULL OR group_by_time_period NOT IN ('month', 'year', 'day', 'month-squashed'))
  )
  GROUP BY CASE
    WHEN group_by_species THEN spine.species_id
    ELSE NULL::bigint
  END, CASE
    WHEN group_by_species THEN spine.species_name
    ELSE NULL::text
  END, CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period
    WHEN group_by_time_period = 'month-squashed' THEN spine.time_period
    ELSE NULL::date
  END
  ) AS agg
  CROSS JOIN LATERAL jsonb_populate_record(NULL::public.biometrics_stats_result, to_jsonb(agg)) AS r
  ORDER BY r.species_name ASC, r.time_period ASC;

END;
$function$;
CREATE OR REPLACE FUNCTION public.demographics_stats(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text, year_filter smallint DEFAULT NULL::smallint, month_filter smallint DEFAULT NULL::smallint)
 RETURNS SETOF public.demographics_stats_result
 LANGUAGE plpgsql
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
  BEGIN
  RETURN QUERY
  -- jsonb_populate_record is evaluated via CROSS JOIN LATERAL (once per outer
  -- row) rather than as a bare `(...).* ` projection: Postgres does not
  -- common-subexpression-eliminate a repeated function call across SELECT
  -- target-list entries, so `(jsonb_populate_record(...)).* ` gets expanded at
  -- parse time into one independent call PER output column — each re-running
  -- to_jsonb(agg) and jsonb_populate_record from scratch just to extract one
  -- field, multiplying cost by column count for no benefit (see core_stats.sql,
  -- where this was measured at ~90% of total runtime). The LATERAL form still
  -- binds by NAME (see above) but computes the populated record exactly once
  -- per row.
  SELECT r.*
  FROM (
  WITH spine AS (
    SELECT * FROM public.stats_spine(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
  ), encounter_age_classification AS (
    SELECT * FROM public.stats_encounter_age_classification(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
  ), bird_age_bucket AS (
    SELECT * FROM public.stats_bird_age_bucket(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
  ), bird_returning_age_bucket AS (
    SELECT * FROM public.stats_bird_returning_age_bucket(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
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
      COUNT(*) AS encounter_count,
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
  -- source in this RPC that is NOT limited to the query window —
  -- new_adult_bird_count needs a bird's full history with this group ("is this
  -- cell's year the bird's first-ever year with the group?"), which a windowed
  -- source can't answer. Group scoping mirrors stats_raw_encounters' pattern so a
  -- bird's history under a DIFFERENT group never counts as history with this one.
  lifetime_encounters AS (
    SELECT
      e.bird_id,
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
  -- Resolve the calendar year each (species, time_period) cell represents, for the
  -- new-adult classification. period_year resolution rule: use the cell's
  -- own time_period when the query is grouped by day/month/year (EXTRACT(YEAR) of
  -- the truncated date is the calendar year); when ungrouped (time_period IS
  -- NULL), fall back to the latest visit date actually present in the cell. This
  -- column is primarily meaningful under a time-period grouping; the fallback
  -- merely keeps it well-defined and non-throwing in the ungrouped mode rather
  -- than special-casing.
  cell_period_year AS (
    SELECT
      eac.species_id,
      eac.time_period,
      EXTRACT(YEAR FROM COALESCE(eac.time_period, MAX(eac.visit_date)))::int AS period_year
    FROM encounter_age_classification eac
    GROUP BY eac.species_id, eac.time_period
  ),
  -- Flag each adult-bucketed bird (per cell) as a new adult or not: new_adult iff
  -- the bird's first-ever-with-group year equals this cell's period_year. Only
  -- bab.age_bucket = 'adult' birds are considered, so new_adult_bird_count is a
  -- subset of adult_bird_count (the rest of the adult cohort is simply unlabelled
  -- — #856 removed the first_summer/old_timers arms that used to name it). IS NOT
  -- DISTINCT FROM makes the cell join NULL-safe for the ungrouped case
  -- (species_id / time_period are NULL). The LEFT JOIN keeps every adult bird
  -- represented exactly once even in the (data-impossible) event a lifetime row is
  -- missing — such a bird reads as not-new, since NULL = period_year is not true.
  adult_age_split AS (
    SELECT
      bab.species_id,
      bab.time_period,
      bfy.first_year = py.period_year AS is_new_adult
    FROM bird_age_bucket bab
    JOIN cell_period_year py
      ON py.species_id IS NOT DISTINCT FROM bab.species_id
     AND py.time_period IS NOT DISTINCT FROM bab.time_period
    LEFT JOIN bird_first_year bfy ON bfy.bird_id = bab.bird_id
    WHERE bab.age_bucket = 'adult'
  ),
  adult_split_counts AS (
    SELECT
      aas.species_id,
      aas.time_period,
      COUNT(*) FILTER (WHERE aas.is_new_adult) AS new_adult_bird_count
    FROM adult_age_split aas
    GROUP BY aas.species_id, aas.time_period
  ),
  -- Returning-age subsets of adult_bird_count (#843). Each adult-bucketed bird in
  -- a cell carries exactly one bucket from stats_bird_returning_age_bucket, or
  -- NULL when its period-relative proven age is 0 (not yet proven to have
  -- returned). So these four counts are mutually exclusive but NOT exhaustive over
  -- the adult cohort: they sum to adult_bird_count MINUS this cell's
  -- proven_age-0 adults, not to adult_bird_count itself.
  returning_age_counts AS (
    SELECT
      brab.species_id,
      brab.time_period,
      COUNT(*) FILTER (WHERE brab.returning_age_bucket = '1') AS returning_age_1_bird_count,
      COUNT(*) FILTER (WHERE brab.returning_age_bucket = '2') AS returning_age_2_bird_count,
      COUNT(*) FILTER (WHERE brab.returning_age_bucket = '3_plus') AS returning_age_3_plus_bird_count,
      COUNT(*) FILTER (WHERE brab.returning_age_bucket = 'new_unknown_age') AS returning_new_unknown_age_bird_count
    FROM bird_returning_age_bucket brab
    GROUP BY brab.species_id, brab.time_period
  )
  SELECT
    CASE WHEN group_by_species THEN spine.species_name ELSE NULL::text END AS "species_name",
    CASE
      WHEN group_by_time_period = 'day' THEN spine.time_period
      WHEN group_by_time_period = 'month' THEN spine.time_period
      WHEN group_by_time_period = 'year' THEN spine.time_period
      WHEN group_by_time_period = 'month-squashed' THEN spine.time_period
      ELSE NULL::date
    END AS "time_period",

    COALESCE(eabc.encounter_count, 0) AS "encounter_count",

    COALESCE(abc.adult_count, 0) AS "adult_bird_count",
    COALESCE(abc.juv_count, 0) AS "juv_bird_count",
    COALESCE(eabc.juv_enc_count, 0) AS "juv_enc_count",
    COALESCE(eabc.postjuv_enc_count, 0) AS "postjuv_enc_count",

    COALESCE(abc.new_young_count, 0) AS "new_young_bird_count",

    -- Subset of adult_bird_count: adults first encountered by this group in this
    -- cell's own period_year.
    COALESCE(asc2.new_adult_bird_count, 0) AS "new_adult_bird_count",

    -- Young-trends encounter-level counts; 3J-only slice of juv_enc_count + New variants.
    COALESCE(eabc.postjuv_juv_enc_count, 0) AS "postjuv_juv_enc_count",
    COALESCE(eabc.new_postjuv_juv_enc_count, 0) AS "new_postjuv_juv_enc_count",
    COALESCE(eabc.new_postjuv_enc_count, 0) AS "new_postjuv_enc_count",

    -- Returning-age subsets of adult_bird_count; these four sum to
    -- adult_bird_count MINUS this cell's proven_age-0 adults, NOT to
    -- adult_bird_count (see returning_age_counts above).
    COALESCE(rac.returning_age_1_bird_count, 0) AS "returning_age_1_bird_count",
    COALESCE(rac.returning_age_2_bird_count, 0) AS "returning_age_2_bird_count",
    COALESCE(rac.returning_age_3_plus_bird_count, 0) AS "returning_age_3_plus_bird_count",
    COALESCE(rac.returning_new_unknown_age_bird_count, 0) AS "returning_new_unknown_age_bird_count"

  FROM spine
  LEFT JOIN age_bucket_counts abc ON CASE WHEN group_by_species THEN spine.species_id = abc.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = abc.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = abc.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = abc.time_period
    WHEN group_by_time_period = 'month-squashed' THEN spine.time_period = abc.time_period
    ELSE true
  END
  LEFT JOIN encounter_age_bucket_counts eabc ON CASE WHEN group_by_species THEN spine.species_id = eabc.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = eabc.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = eabc.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = eabc.time_period
    WHEN group_by_time_period = 'month-squashed' THEN spine.time_period = eabc.time_period
    ELSE true
  END
  LEFT JOIN adult_split_counts asc2 ON CASE WHEN group_by_species THEN spine.species_id = asc2.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = asc2.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = asc2.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = asc2.time_period
    WHEN group_by_time_period = 'month-squashed' THEN spine.time_period = asc2.time_period
    ELSE true
  END
  LEFT JOIN returning_age_counts rac ON CASE WHEN group_by_species THEN spine.species_id = rac.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = rac.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = rac.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = rac.time_period
    WHEN group_by_time_period = 'month-squashed' THEN spine.time_period = rac.time_period
    ELSE true
  END
  ) AS agg
  CROSS JOIN LATERAL jsonb_populate_record(NULL::public.demographics_stats_result, to_jsonb(agg)) AS r
  ORDER BY r.species_name ASC, r.time_period ASC;

END;
$function$;
