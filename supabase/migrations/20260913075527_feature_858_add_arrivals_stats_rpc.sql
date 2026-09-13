SET check_function_bodies = false;
CREATE TYPE public.arrivals_stats_result AS (species_name text, time_period date, new_adult_bird_count bigint, returning_adult_bird_count bigint, pullus_bird_count bigint, juv_bird_count bigint, postjuv_bird_count bigint);
CREATE FUNCTION public.arrivals_stats(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text)
 RETURNS SETOF public.arrivals_stats_result
 LANGUAGE plpgsql
AS $function$
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
GRANT ALL ON FUNCTION public.arrivals_stats(text, date, date, bigint, boolean, text) TO anon;
GRANT ALL ON FUNCTION public.arrivals_stats(text, date, date, bigint, boolean, text) TO authenticated;
GRANT ALL ON FUNCTION public.arrivals_stats(text, date, date, bigint, boolean, text) TO service_role;
CREATE FUNCTION public.stats_bird_first_encounter_of_year(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text)
 RETURNS TABLE(bird_id bigint, species_id bigint, time_period date, arrival_bucket text)
 LANGUAGE sql
 STABLE
AS $function$
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
GRANT ALL ON FUNCTION public.stats_bird_first_encounter_of_year(text, date, date, bigint, boolean, text) TO anon;
GRANT ALL ON FUNCTION public.stats_bird_first_encounter_of_year(text, date, date, bigint, boolean, text) TO authenticated;
GRANT ALL ON FUNCTION public.stats_bird_first_encounter_of_year(text, date, date, bigint, boolean, text) TO service_role;
