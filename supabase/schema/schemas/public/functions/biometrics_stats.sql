-- Wing/weight summary statistics (max/avg/min/median for both) for the planned
-- biometrics species-page charts/tables (#822). Split out of aggregate_stats into
-- its own RPC rather than left folded into that already-large single query, both to
-- keep each query's plan simpler and to leave aggregate_stats' existing
-- columns/performance untouched (those wing/weight columns are removed from
-- aggregate_stats in a later ticket, once consumers migrate). Shares aggregate_stats'
-- input signature and reuses its underlying plumbing via the stats_raw_encounters /
-- stats_spine utility RPCs — biometrics has no age dimension, so
-- stats_encounter_age_classification / stats_bird_age_bucket are not needed here.
-- Each utility RPC is called exactly once and materialized into a local CTE.
--
-- The eight metric columns and their rounding mirror aggregate_stats.sql's final
-- SELECT exactly (ROUND(..., 1) for avg/median weight, ROUND(..., 0) for median
-- wing). MAX/AVG/MIN/PERCENTILE_CONT over an empty set is NULL (not 0), so a
-- spine-only cell with no matching encounters yields NULLs for all eight columns —
-- deliberately no COALESCE, matching aggregate_stats' behaviour for these columns.
--
-- The final projection below is wrapped in jsonb_populate_record rather than
-- returned as a bare positional SELECT. A bare `RETURN QUERY SELECT ...` binds to
-- biometrics_stats_result's columns by ORDINAL POSITION, not by the "AS" alias names
-- below — and that position is only as stable as whatever DDL a given environment's
-- schema-diff run happens to emit for the composite type's attributes
-- (`ALTER TYPE ... ADD ATTRIBUTE` order is not guaranteed to match this file's
-- declared column order — confirmed while building population_stats: two
-- `db:schema:apply` runs on the same source files produced two different physical
-- attribute orders, silently scrambling values into the wrong named columns with no
-- error). Routing through to_jsonb(...)/jsonb_populate_record binds every column by
-- NAME instead, so the result is correct regardless of the composite type's physical
-- attribute order in any given environment.
CREATE FUNCTION public.biometrics_stats (
	species_name_filter text DEFAULT NULL::text,
	from_date date DEFAULT NULL::date,
	to_date date DEFAULT NULL::date,
	ringing_group_filter bigint DEFAULT NULL::bigint,
	group_by_species boolean DEFAULT FALSE,
	group_by_time_period text DEFAULT NULL::text
) RETURNS SETOF public.biometrics_stats_result LANGUAGE plpgsql AS $function$
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

GRANT ALL ON FUNCTION public.biometrics_stats (text, date, date, bigint, boolean, text) TO anon;

GRANT ALL ON FUNCTION public.biometrics_stats (text, date, date, bigint, boolean, text) TO authenticated;

GRANT ALL ON FUNCTION public.biometrics_stats (text, date, date, bigint, boolean, text) TO service_role;
