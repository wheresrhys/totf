-- Shared plumbing for aggregate_stats and population_stats (#800). Resolves each
-- bird's per-(species, time_period)-cell encounters into exactly one
-- mutually-exclusive, exhaustive bird-level age bucket, applying the two
-- precedence rules with no single-encounter equivalent: pullus always wins (a
-- bird with any pullus reading is pullus, even against a conflicting adult
-- reading, which is assumed erroneous), and otherwise juv wins over postjuv.
-- Mirrors aggregate_stats' own (untouched, historical) inline
-- bird_age_flags/bird_age_bucket CTEs — see stats_raw_encounters.sql's header for
-- why the two functions don't literally share SQL text with aggregate_stats
-- itself; keep the precedence rules below in sync BY HAND with aggregate_stats.sql's
-- copy. bird_id is carried (beyond what aggregate_stats' copy exposes) because
-- population_stats' age-split columns need per-bird (not just per-cell-count)
-- bucket membership to drive its own lifetime-history lookups.
CREATE FUNCTION public.stats_bird_age_bucket (
	species_name_filter text DEFAULT NULL::text,
	from_date date DEFAULT NULL::date,
	to_date date DEFAULT NULL::date,
	ringing_group_filter bigint DEFAULT NULL::bigint,
	group_by_species boolean DEFAULT FALSE,
	group_by_time_period text DEFAULT NULL::text
) RETURNS TABLE (
	bird_id bigint,
	species_id bigint,
	time_period date,
	has_new boolean,
	age_bucket text
) LANGUAGE sql STABLE AS $function$
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

GRANT ALL ON FUNCTION public.stats_bird_age_bucket (text, date, date, bigint, boolean, text) TO anon;

GRANT ALL ON FUNCTION public.stats_bird_age_bucket (text, date, date, bigint, boolean, text) TO authenticated;

GRANT ALL ON FUNCTION public.stats_bird_age_bucket (text, date, date, bigint, boolean, text) TO service_role;
