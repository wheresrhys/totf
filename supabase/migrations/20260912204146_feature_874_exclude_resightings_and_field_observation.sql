SET check_function_bodies = false;
CREATE TYPE public.resighting_record_type AS ENUM ('U', 'F', 'D');
CREATE OR REPLACE FUNCTION public.stats_raw_encounters(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint)
 RETURNS TABLE(species_id bigint, species_name text, bird_id bigint, ring_no text, encounter_id bigint, weight real, wing_length smallint, record_type text, age_code smallint, is_juv boolean, session_id bigint, visit_date date, session_type text, max_hatch_year smallint, capture_time time without time zone, session_day date, session_month date, session_year date)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    sp.id AS species_id,
    sp.species_name,
    b.id AS bird_id,
    b.ring_no,
    e.id AS encounter_id,
    e.weight,
    e.wing_length,
    e.record_type,
    e.age_code,
    e.is_juv,
    sess.id AS session_id,
    sess.visit_date,
    sess.session_type,
    e.max_hatch_year,
    e.capture_time,
    date_trunc('day', sess.visit_date)::DATE AS session_day,
    date_trunc('month', sess.visit_date)::DATE AS session_month,
    date_trunc('year', sess.visit_date)::DATE AS session_year
  FROM public."Species" sp
  JOIN public."Birds" b ON sp.id = b.species_id
  -- Resighting/recovery record_types (public.resighting_record_type: U/F/D) are
  -- passive encounters with no bird in the hand, and must not surface in any stats
  -- RPC (#874). Filtering in the LEFT JOIN's ON clause (not the WHERE) preserves the
  -- NULL-preserving semantics: a bird whose only encounters are resightings still
  -- appears with encounter_id IS NULL rather than being dropped entirely.
  LEFT JOIN public."Encounters" e ON b.id = e.bird_id
    AND NOT (e.record_type = ANY (enum_range(NULL::public.resighting_record_type)::text[]))
  LEFT JOIN public."Sessions" sess ON e.session_id = sess.id
  WHERE (from_date IS NULL OR sess.visit_date >= from_date)
   AND (to_date IS NULL OR sess.visit_date <= to_date)
   AND (species_name_filter IS NULL OR sp.species_name = species_name_filter)
   AND (ringing_group_filter IS NULL OR sess.ringing_group_id = ringing_group_filter);
$function$;
CREATE OR REPLACE FUNCTION public.stats_spine(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text)
 RETURNS TABLE(species_id bigint, species_name text, time_period date)
 LANGUAGE sql
 STABLE
AS $function$
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
      -- Field-observation-only sessions are passive resightings (#874): their dates
      -- must not stretch the month/year spine's min..max range. session_type is NOT
      -- NULL (default 'FULL_GROWN'), so a plain <> is safe here.
      AND sess.session_type <> 'FIELD_OBSERVATION'
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
