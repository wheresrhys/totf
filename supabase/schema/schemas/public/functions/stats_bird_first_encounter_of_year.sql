-- Shared plumbing for arrivals_stats (#858). Resolves each bird's single
-- "arrival" per calendar year — its earliest classifiable encounter in that year
-- — and buckets it into exactly one of new_adult / returning_adult / pullus /
-- juv / postjuv.
--
-- Why this exists at all: aggregate_stats'/population_stats' bucket counts are
-- computed per (species, time_period) cell INDEPENDENTLY, so a bird encountered
-- in Jan, Mar and Jun of the same year is counted again in each of those three
-- monthly cells. This function instead emits at most one row per
-- (bird, calendar year), so a downstream count of its rows counts each bird
-- exactly once per year, in whichever cell contains that year's first encounter.
--
-- Bucketing rules:
--   * 'unknown'-bucketed encounters are filtered out BEFORE the first-of-year
--     pick, so an unclassifiable early-year encounter is skipped in favour of the
--     next classifiable one that year rather than excluding the bird from that
--     year entirely — matching the existing convention that 'unknown' never
--     contributes to any bucket.
--   * pullus / juv / postjuv map straight through from
--     stats_encounter_age_classification's per-encounter bucket.
--   * adult splits into new_adult vs returning_adult off the bird's UNWINDOWED
--     lifetime history with this ringing group (the same lifetime_encounters /
--     bird_first_year pattern population_stats.sql uses, ringing_group_filter
--     -scoped but ignoring from_date/to_date): new_adult iff this row's calendar
--     year is the bird's first-ever-with-group year, else returning_adult. No
--     majority-vote heuristic is needed here (unlike population_stats' historical
--     first_summer/old_timers split) because by construction the year of a bird's
--     first-ever encounter with the group IS the year its first-encounter-of-that-
--     year row falls in.
--
-- Note the per-year (not per-cell) granularity: under group_by_time_period =
-- 'month'/'day' a bird encountered in two different calendar years yields two
-- rows, landing in two different cells; under an ungrouped query (time_period
-- NULL) those two rows collapse into the same cell and the bird is counted once
-- per year it arrived, not once overall. That is the defined semantic — an
-- "arrival" is a bird-year, not a bird.
CREATE FUNCTION public.stats_bird_first_encounter_of_year (
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
	arrival_bucket text
) LANGUAGE sql STABLE AS $function$
  WITH encounter_age_classification AS (
    SELECT * FROM public.stats_encounter_age_classification(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ),
  -- Drop unclassifiable encounters before the first-of-year pick (see header).
  classifiable_encounters AS (
    SELECT
      eac.encounter_id,
      eac.bird_id,
      eac.visit_date,
      eac.species_id,
      eac.time_period,
      eac.age_bucket,
      EXTRACT(YEAR FROM eac.visit_date)::int AS enc_year
    FROM encounter_age_classification eac
    WHERE eac.age_bucket <> 'unknown'
      AND eac.bird_id IS NOT NULL
  ),
  -- One row per (bird, calendar year): that year's earliest encounter. The
  -- encounter_id tiebreak makes same-day ties deterministic.
  first_encounter_of_year AS (
    SELECT DISTINCT ON (ce.bird_id, ce.enc_year)
      ce.bird_id,
      ce.species_id,
      ce.time_period,
      ce.age_bucket,
      ce.enc_year
    FROM classifiable_encounters ce
    ORDER BY ce.bird_id, ce.enc_year, ce.visit_date ASC, ce.encounter_id ASC
  ),
  -- Unwindowed lifetime history for every arriving bird, scoped to
  -- ringing_group_filter but IGNORING from_date/to_date — "first-ever with this
  -- group" can't be answered from a windowed source. Group scoping mirrors
  -- stats_raw_encounters' pattern so a bird's history under a DIFFERENT group
  -- never counts as history with this one.
  lifetime_encounters AS (
    SELECT
      e.bird_id,
      EXTRACT(YEAR FROM sess.visit_date)::int AS enc_year
    FROM public."Encounters" e
    JOIN public."Sessions" sess ON e.session_id = sess.id
    WHERE (ringing_group_filter IS NULL OR sess.ringing_group_id = ringing_group_filter)
      AND e.bird_id IN (SELECT DISTINCT feoy.bird_id FROM first_encounter_of_year feoy)
  ),
  -- First calendar year each bird was ever encountered by this group (unwindowed).
  bird_first_year AS (
    SELECT le.bird_id, MIN(le.enc_year) AS first_year
    FROM lifetime_encounters le
    GROUP BY le.bird_id
  )
  SELECT
    feoy.bird_id,
    feoy.species_id,
    feoy.time_period,
    CASE
      WHEN feoy.age_bucket <> 'adult' THEN feoy.age_bucket
      WHEN bfy.first_year = feoy.enc_year THEN 'new_adult'
      ELSE 'returning_adult'
    END AS arrival_bucket
  FROM first_encounter_of_year feoy
  LEFT JOIN bird_first_year bfy ON bfy.bird_id = feoy.bird_id;
$function$;

GRANT ALL ON FUNCTION public.stats_bird_first_encounter_of_year (text, date, date, bigint, boolean, text) TO anon;

GRANT ALL ON FUNCTION public.stats_bird_first_encounter_of_year (text, date, date, bigint, boolean, text) TO authenticated;

GRANT ALL ON FUNCTION public.stats_bird_first_encounter_of_year (text, date, date, bigint, boolean, text) TO service_role;
