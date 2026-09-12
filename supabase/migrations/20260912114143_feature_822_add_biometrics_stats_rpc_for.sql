SET check_function_bodies = false;
CREATE TYPE public.biometrics_stats_result AS (species_name text, time_period date, max_weight real, avg_weight numeric, min_weight real, median_weight numeric, max_wing smallint, avg_wing numeric, min_wing smallint, median_wing numeric);
CREATE FUNCTION public.biometrics_stats(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text)
 RETURNS SETOF public.biometrics_stats_result
 LANGUAGE plpgsql
AS $function$
  BEGIN
  RETURN QUERY
  SELECT (jsonb_populate_record(NULL::public.biometrics_stats_result, to_jsonb(agg))).*
  FROM (
  WITH raw_encounters AS (
    SELECT * FROM public.stats_raw_encounters(species_name_filter, from_date, to_date, ringing_group_filter)
  ), spine AS (
    SELECT * FROM public.stats_spine(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  )
  SELECT
    CASE WHEN group_by_species THEN spine.species_name ELSE NULL::text END AS "species_name",
    CASE
      WHEN group_by_time_period = 'day' THEN spine.time_period
      WHEN group_by_time_period = 'month' THEN spine.time_period
      WHEN group_by_time_period = 'year' THEN spine.time_period
      ELSE NULL::date
    END AS "time_period",

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
    OR (group_by_time_period IS NULL OR group_by_time_period NOT IN ('month', 'year', 'day'))
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
    ELSE NULL::date
  END
  ) AS agg
  ORDER BY agg.species_name ASC, agg.time_period ASC;

END;
$function$;
GRANT ALL ON FUNCTION public.biometrics_stats(text, date, date, bigint, boolean, text) TO anon;
GRANT ALL ON FUNCTION public.biometrics_stats(text, date, date, bigint, boolean, text) TO authenticated;
GRANT ALL ON FUNCTION public.biometrics_stats(text, date, date, bigint, boolean, text) TO service_role;
