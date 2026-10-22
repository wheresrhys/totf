SET check_function_bodies = false;
CREATE TYPE public.stats_cache_returning_age_metrics_result AS (species_id bigint, time_period date, returning_age_1_bird_count bigint, returning_age_2_bird_count bigint, returning_age_3_plus_bird_count bigint, returning_new_unknown_age_bird_count bigint);
CREATE FUNCTION public.stats_cache_returning_age_metrics(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text, year_filter smallint DEFAULT NULL::smallint, month_filter smallint DEFAULT NULL::smallint)
 RETURNS SETOF public.stats_cache_returning_age_metrics_result
 LANGUAGE sql
 STABLE
AS $function$
  SELECT r.*
  FROM (
  WITH spine AS (
    SELECT * FROM public.stats_spine(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
  ), bird_returning_age_bucket AS (
    SELECT * FROM public.stats_bird_returning_age_bucket(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
  ),
  -- Returning-age subsets of adult_bird_count (#843). Each adult-bucketed bird
  -- in a cell carries exactly one bucket from stats_bird_returning_age_bucket,
  -- or NULL when its period-relative proven age is 0 (not yet proven to have
  -- returned). So these four counts are mutually exclusive but NOT exhaustive
  -- over the adult cohort — replicated verbatim from demographics_stats.sql's
  -- own returning_age_counts CTE.
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
    CASE WHEN group_by_species THEN spine.species_id ELSE NULL::bigint END AS "species_id",
    CASE
      WHEN group_by_time_period = 'day' THEN spine.time_period
      WHEN group_by_time_period = 'month' THEN spine.time_period
      WHEN group_by_time_period = 'year' THEN spine.time_period
      WHEN group_by_time_period = 'month-squashed' THEN spine.time_period
      ELSE NULL::date
    END AS "time_period",

    COALESCE(rac.returning_age_1_bird_count, 0) AS "returning_age_1_bird_count",
    COALESCE(rac.returning_age_2_bird_count, 0) AS "returning_age_2_bird_count",
    COALESCE(rac.returning_age_3_plus_bird_count, 0) AS "returning_age_3_plus_bird_count",
    COALESCE(rac.returning_new_unknown_age_bird_count, 0) AS "returning_new_unknown_age_bird_count"

  FROM spine
  LEFT JOIN returning_age_counts rac ON
  (NOT group_by_species OR spine.species_id = rac.species_id)
  AND (
    (group_by_time_period IN ('day', 'month', 'year', 'month-squashed') AND spine.time_period = rac.time_period)
    OR (group_by_time_period IS NULL OR group_by_time_period NOT IN ('month', 'year', 'day', 'month-squashed'))
  )
  ) AS agg
  CROSS JOIN LATERAL jsonb_populate_record(NULL::public.stats_cache_returning_age_metrics_result, to_jsonb(agg)) AS r
  ORDER BY r.species_id ASC, r.time_period ASC;
$function$;
GRANT ALL ON FUNCTION public.stats_cache_returning_age_metrics(text, date, date, bigint, boolean, text, smallint, smallint) TO anon;
GRANT ALL ON FUNCTION public.stats_cache_returning_age_metrics(text, date, date, bigint, boolean, text, smallint, smallint) TO authenticated;
GRANT ALL ON FUNCTION public.stats_cache_returning_age_metrics(text, date, date, bigint, boolean, text, smallint, smallint) TO service_role;
