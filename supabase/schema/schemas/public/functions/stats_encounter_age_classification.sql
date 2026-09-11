-- Shared plumbing for aggregate_stats and population_stats (#800). Canonical
-- per-encounter age classification: every in-scope encounter is placed into
-- exactly one mutually-exclusive, exhaustive age bucket. Mirrors
-- aggregate_stats' own (untouched, historical) inline encounter_age_classification
-- CTE — see stats_raw_encounters.sql's header for why the two functions don't
-- literally share SQL text with aggregate_stats itself; keep the bucket
-- definitions below in sync BY HAND with aggregate_stats.sql's copy and with the
-- single-encounter age classes defined in TypeScript by getAgeClass()
-- (app/models/encounter.ts, #527):
--   pullus  = age_code = 1 AND NOT is_juv   (true nestling)
--   juv     = is_juv AND age_code IN (1, 3) (1J or 3J)
--   postjuv = age_code = 3 AND NOT is_juv   (bare age 3)
--   adult   = age_code > 3
--   unknown = anything else (incl. age_code NULL or age_code 2)
-- age_code/is_juv/visit_date are carried (beyond what aggregate_stats' copy
-- exposes) because population_stats' young-trends columns filter directly on
-- age_code/is_juv, and its period_year resolution needs visit_date.
CREATE FUNCTION public.stats_encounter_age_classification (
	species_name_filter text DEFAULT NULL::text,
	from_date date DEFAULT NULL::date,
	to_date date DEFAULT NULL::date,
	ringing_group_filter bigint DEFAULT NULL::bigint,
	group_by_species boolean DEFAULT FALSE,
	group_by_time_period text DEFAULT NULL::text
) RETURNS TABLE (
	encounter_id bigint,
	bird_id bigint,
	record_type text,
	age_code smallint,
	is_juv boolean,
	visit_date date,
	species_id bigint,
	time_period date,
	age_bucket text
) LANGUAGE sql STABLE AS $function$
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

GRANT ALL ON FUNCTION public.stats_encounter_age_classification (text, date, date, bigint, boolean, text) TO anon;

GRANT ALL ON FUNCTION public.stats_encounter_age_classification (text, date, date, bigint, boolean, text) TO authenticated;

GRANT ALL ON FUNCTION public.stats_encounter_age_classification (text, date, date, bigint, boolean, text) TO service_role;
