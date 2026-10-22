SET check_function_bodies = false;
CREATE TYPE public.stats_cache_bird_age_metrics_result AS (species_id bigint, time_period date, pullus_bird_count bigint, juv_bird_count bigint, postjuv_bird_count bigint, adult_bird_count bigint, unknown_age_bird_count bigint, new_young_bird_count bigint);
CREATE FUNCTION public.stats_cache_bird_age_metrics(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text, year_filter smallint DEFAULT NULL::smallint, month_filter smallint DEFAULT NULL::smallint)
 RETURNS SETOF public.stats_cache_bird_age_metrics_result
 LANGUAGE sql
 STABLE
AS $function$
  SELECT r.*
  FROM (
  WITH spine AS (
    SELECT * FROM public.stats_spine(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
  ), bird_age_bucket AS (
    SELECT * FROM public.stats_bird_age_bucket(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
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

    COUNT(*) FILTER (WHERE bab.age_bucket = 'pullus') AS "pullus_bird_count",
    COUNT(*) FILTER (WHERE bab.age_bucket = 'juv') AS "juv_bird_count",
    COUNT(*) FILTER (WHERE bab.age_bucket = 'postjuv') AS "postjuv_bird_count",
    COUNT(*) FILTER (WHERE bab.age_bucket = 'adult') AS "adult_bird_count",
    COUNT(*) FILTER (WHERE bab.age_bucket = 'unknown') AS "unknown_age_bird_count",

    -- Demographics' derived column: a young-bucket bird that also has any 'N'
    -- encounter in the cell. bab.has_new is bool_or'd across the bird's whole
    -- cell, so the two conditions are independent by construction.
    COUNT(*) FILTER (
      WHERE bab.age_bucket IN ('pullus', 'juv', 'postjuv') AND bab.has_new
    ) AS "new_young_bird_count"

  FROM spine
  -- bab.species_id / bab.time_period are already resolved to the same cell axis
  -- the spine uses (stats_bird_age_bucket applies the same group_by_* CASEs), so
  -- this joins on them directly rather than re-deriving session_day/month/year.
  LEFT JOIN bird_age_bucket bab ON
  (NOT group_by_species OR spine.species_id = bab.species_id)
  AND (
    (group_by_time_period IN ('day', 'month', 'year', 'month-squashed') AND spine.time_period = bab.time_period)
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
  CROSS JOIN LATERAL jsonb_populate_record(NULL::public.stats_cache_bird_age_metrics_result, to_jsonb(agg)) AS r
  ORDER BY r.species_id ASC, r.time_period ASC;
$function$;
GRANT ALL ON FUNCTION public.stats_cache_bird_age_metrics(text, date, date, bigint, boolean, text, smallint, smallint) TO anon;
GRANT ALL ON FUNCTION public.stats_cache_bird_age_metrics(text, date, date, bigint, boolean, text, smallint, smallint) TO authenticated;
GRANT ALL ON FUNCTION public.stats_cache_bird_age_metrics(text, date, date, bigint, boolean, text, smallint, smallint) TO service_role;
