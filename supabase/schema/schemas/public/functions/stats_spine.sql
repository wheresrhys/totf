-- Shared plumbing for aggregate_stats and population_stats (#800). Builds the
-- (species, time_period) grouping-cell spine both RPCs LEFT JOIN their own
-- per-cell aggregates onto, so every cell in range appears in the result even
-- when it has no matching encounters (the caller COALESCEs to 0/empty). Mirrors
-- aggregate_stats' own (untouched, historical) inline
-- species_spine/session_date_range/period_spine/spine CTEs — see
-- stats_raw_encounters.sql's header for why the two functions don't literally share
-- SQL text with aggregate_stats itself.
CREATE FUNCTION public.stats_spine (
	species_name_filter text DEFAULT NULL::text,
	from_date date DEFAULT NULL::date,
	to_date date DEFAULT NULL::date,
	ringing_group_filter bigint DEFAULT NULL::bigint,
	group_by_species boolean DEFAULT FALSE,
	group_by_time_period text DEFAULT NULL::text
) RETURNS TABLE (
	species_id bigint,
	species_name text,
	time_period date
) LANGUAGE sql STABLE AS $function$
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

GRANT ALL ON FUNCTION public.stats_spine (text, date, date, bigint, boolean, text) TO anon;

GRANT ALL ON FUNCTION public.stats_spine (text, date, date, bigint, boolean, text) TO authenticated;

GRANT ALL ON FUNCTION public.stats_spine (text, date, date, bigint, boolean, text) TO service_role;
