SET check_function_bodies = false;
CREATE TYPE public.stats_cache_encounter_age_metrics_result AS (species_id bigint, time_period date, pullus_enc_count bigint, juv_enc_count bigint, postjuv_enc_count bigint, adult_enc_count bigint, unknown_age_enc_count bigint, postjuv_juv_enc_count bigint, new_postjuv_juv_enc_count bigint, new_postjuv_enc_count bigint);
CREATE FUNCTION public.stats_cache_encounter_age_metrics(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text, year_filter smallint DEFAULT NULL::smallint, month_filter smallint DEFAULT NULL::smallint)
 RETURNS SETOF public.stats_cache_encounter_age_metrics_result
 LANGUAGE sql
 STABLE
AS $function$
  SELECT r.*
  FROM (
  WITH spine AS (
    SELECT * FROM public.stats_spine(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
  ), encounter_age_classification AS (
    SELECT * FROM public.stats_encounter_age_classification(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
  )
  SELECT
    CASE WHEN group_by_species THEN spine.species_id ELSE NULL::bigint END AS "species_id",
    CASE
      WHEN group_by_time_period = 'day' THEN spine.time_period
      WHEN group_by_time_period = 'month' THEN spine.time_period
      WHEN group_by_time_period = 'year' THEN spine.time_period
      WHEN group_by_time_period = 'month-squashed' THEN spine.time_period
      ELSE NULL::date
    END AS "time_period",

    -- core_stats' five mutually-exclusive, exhaustive buckets.
    COUNT(*) FILTER (WHERE eac.age_bucket = 'pullus') AS "pullus_enc_count",
    COUNT(*) FILTER (WHERE eac.age_bucket = 'juv') AS "juv_enc_count",
    COUNT(*) FILTER (WHERE eac.age_bucket = 'postjuv') AS "postjuv_enc_count",
    COUNT(*) FILTER (WHERE eac.age_bucket = 'adult') AS "adult_enc_count",
    COUNT(*) FILTER (WHERE eac.age_bucket = 'unknown') AS "unknown_age_enc_count",

    -- demographics_stats' young-trends slices. The first is the 3J-only part of
    -- the 'juv' bucket above (1J encounters are juv but not postjuv_juv); the
    -- other two are the 'N'-record_type parts of 3J and of bare age 3.
    COUNT(*) FILTER (WHERE eac.age_code = 3 AND eac.is_juv) AS "postjuv_juv_enc_count",
    COUNT(*) FILTER (WHERE eac.age_code = 3 AND eac.is_juv AND eac.record_type = 'N') AS "new_postjuv_juv_enc_count",
    COUNT(*) FILTER (WHERE eac.age_code = 3 AND NOT eac.is_juv AND eac.record_type = 'N') AS "new_postjuv_enc_count"

  FROM spine
  -- eac.species_id / eac.time_period are already resolved to the same cell axis
  -- the spine uses (stats_encounter_age_classification applies the same
  -- group_by_* CASEs), so this joins on them directly rather than re-deriving
  -- session_day/month/year.
  LEFT JOIN encounter_age_classification eac ON
  (NOT group_by_species OR spine.species_id = eac.species_id)
  AND (
    (group_by_time_period IN ('day', 'month', 'year', 'month-squashed') AND spine.time_period = eac.time_period)
    OR (group_by_time_period IS NULL OR group_by_time_period NOT IN ('month', 'year', 'day', 'month-squashed'))
  )
  GROUP BY CASE
    WHEN group_by_species THEN spine.species_id
    ELSE NULL::bigint
  END, CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period
    WHEN group_by_time_period = 'month-squashed' THEN spine.time_period
    ELSE NULL::date
  END
  ) AS agg
  CROSS JOIN LATERAL jsonb_populate_record(NULL::public.stats_cache_encounter_age_metrics_result, to_jsonb(agg)) AS r
  ORDER BY r.species_id ASC, r.time_period ASC;
$function$;
GRANT ALL ON FUNCTION public.stats_cache_encounter_age_metrics(text, date, date, bigint, boolean, text, smallint, smallint) TO anon;
GRANT ALL ON FUNCTION public.stats_cache_encounter_age_metrics(text, date, date, bigint, boolean, text, smallint, smallint) TO authenticated;
GRANT ALL ON FUNCTION public.stats_cache_encounter_age_metrics(text, date, date, bigint, boolean, text, smallint, smallint) TO service_role;
