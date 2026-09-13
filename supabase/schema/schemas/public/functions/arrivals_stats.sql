-- "Arrivals" companion RPC to aggregate_stats/population_stats (#858). Those two
-- count birds per (species, time_period) cell INDEPENDENTLY, so a bird seen in
-- Jan, Mar and Jun of one year lands in all three monthly cells. This RPC counts
-- each bird exactly once per calendar year, in whichever cell holds its first
-- classifiable encounter of that year, bucketed by what the bird was AT that
-- encounter — see stats_bird_first_encounter_of_year.sql for the per-bird-year
-- resolution and the new_adult/returning_adult split.
--
-- Shares aggregate_stats' input signature and builds on the same stats_spine /
-- stats_encounter_age_classification plumbing (via
-- stats_bird_first_encounter_of_year). Each utility RPC is called exactly once and
-- materialized into a local CTE, so downstream references don't rescan the base
-- tables.
--
-- The final projection is wrapped in jsonb_populate_record rather than returned as
-- a bare positional SELECT: a bare `RETURN QUERY SELECT ...` binds to
-- arrivals_stats_result's columns by ORDINAL POSITION, not by the "AS" alias names
-- below, and that position is only as stable as whatever DDL a given environment's
-- schema-diff run happens to emit for the composite type's attributes. Routing
-- through to_jsonb(...)/jsonb_populate_record binds every column by NAME instead
-- (see population_stats.sql's header for the #800 postmortem behind this).
CREATE FUNCTION public.arrivals_stats (
	species_name_filter text DEFAULT NULL::text,
	from_date date DEFAULT NULL::date,
	to_date date DEFAULT NULL::date,
	ringing_group_filter bigint DEFAULT NULL::bigint,
	group_by_species boolean DEFAULT FALSE,
	group_by_time_period text DEFAULT NULL::text
) RETURNS SETOF public.arrivals_stats_result LANGUAGE plpgsql AS $function$
  BEGIN
  RETURN QUERY
  SELECT (jsonb_populate_record(NULL::public.arrivals_stats_result, to_jsonb(agg))).*
  FROM (
  WITH spine AS (
    SELECT * FROM public.stats_spine(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ), bird_first_encounter_of_year AS (
    SELECT * FROM public.stats_bird_first_encounter_of_year(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ),
  -- One count per arrival bucket per cell. Buckets are mutually exclusive and
  -- exhaustive over the rows above (which already exclude 'unknown'), so the five
  -- counts sum to the cell's distinct-arriving-bird-year count.
  arrival_bucket_counts AS (
    SELECT
      bfe.species_id,
      bfe.time_period,
      COUNT(*) FILTER (WHERE bfe.arrival_bucket = 'new_adult') AS new_adult_bird_count,
      COUNT(*) FILTER (WHERE bfe.arrival_bucket = 'returning_adult') AS returning_adult_bird_count,
      COUNT(*) FILTER (WHERE bfe.arrival_bucket = 'pullus') AS pullus_bird_count,
      COUNT(*) FILTER (WHERE bfe.arrival_bucket = 'juv') AS juv_bird_count,
      COUNT(*) FILTER (WHERE bfe.arrival_bucket = 'postjuv') AS postjuv_bird_count
    FROM bird_first_encounter_of_year bfe
    GROUP BY bfe.species_id, bfe.time_period
  )
  SELECT
    CASE WHEN group_by_species THEN spine.species_name ELSE NULL::text END AS "species_name",
    CASE
      WHEN group_by_time_period = 'day' THEN spine.time_period
      WHEN group_by_time_period = 'month' THEN spine.time_period
      WHEN group_by_time_period = 'year' THEN spine.time_period
      ELSE NULL::date
    END AS "time_period",

    COALESCE(abc.new_adult_bird_count, 0) AS "new_adult_bird_count",
    COALESCE(abc.returning_adult_bird_count, 0) AS "returning_adult_bird_count",
    COALESCE(abc.pullus_bird_count, 0) AS "pullus_bird_count",
    COALESCE(abc.juv_bird_count, 0) AS "juv_bird_count",
    COALESCE(abc.postjuv_bird_count, 0) AS "postjuv_bird_count"

  FROM spine
  LEFT JOIN arrival_bucket_counts abc ON CASE WHEN group_by_species THEN spine.species_id = abc.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = abc.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = abc.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = abc.time_period
    ELSE true
  END
  ) AS agg
  ORDER BY agg.species_name ASC, agg.time_period ASC;

END;
$function$;

GRANT ALL ON FUNCTION public.arrivals_stats (text, date, date, bigint, boolean, text) TO anon;

GRANT ALL ON FUNCTION public.arrivals_stats (text, date, date, bigint, boolean, text) TO authenticated;

GRANT ALL ON FUNCTION public.arrivals_stats (text, date, date, bigint, boolean, text) TO service_role;
