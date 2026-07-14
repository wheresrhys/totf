CREATE FUNCTION public.session_weight_record_breakers (
	session_date date,
	ringing_group_filter bigint,
	min_prior_weighed integer DEFAULT 3
) RETURNS TABLE (
	species_name text,
	ring_no text,
	weight numeric,
	record_type text,
	previous_record numeric,
	previous_record_date date
) LANGUAGE plpgsql STABLE
SET
	search_path TO 'public',
	'pg_catalog' AS $function$
BEGIN
  RETURN QUERY
  WITH todays_weighed AS (
    SELECT
      sp.species_name AS species_name,
      b.ring_no AS ring_no,
      e.weight::numeric AS weight
    FROM public."Encounters" e
      JOIN public."Sessions" sess ON e.session_id = sess.id
      JOIN public."Birds" b ON e.bird_id = b.id
      LEFT JOIN public."Species" sp ON b.species_id = sp.id
    WHERE sess.visit_date = session_date
      AND sess.ringing_group_id = ringing_group_filter
      AND e.ringing_group_id = ringing_group_filter
      AND e.weight IS NOT NULL
  ),
  prior_weighed AS (
    SELECT
      sp.species_name AS species_name,
      e.weight::numeric AS weight,
      sess.visit_date AS visit_date
    FROM public."Encounters" e
      JOIN public."Sessions" sess ON e.session_id = sess.id
      JOIN public."Birds" b ON e.bird_id = b.id
      LEFT JOIN public."Species" sp ON b.species_id = sp.id
    WHERE sess.visit_date < session_date
      AND sess.ringing_group_id = ringing_group_filter
      AND e.ringing_group_id = ringing_group_filter
      AND e.weight IS NOT NULL
  ),
  prior_records AS (
    SELECT
      pw.species_name AS species_name,
      MIN(pw.weight) AS min_weight,
      MAX(pw.weight) AS max_weight,
      COUNT(*) AS weighed_count
    FROM prior_weighed pw
    GROUP BY pw.species_name
    HAVING COUNT(*) >= min_prior_weighed
  )
  SELECT record_breakers.species_name, record_breakers.ring_no, record_breakers.weight,
    record_breakers.record_type, record_breakers.previous_record, record_breakers.previous_record_date
  FROM (
    -- Heaviest: today's birds equalling or beating the prior maximum.
    (
      SELECT DISTINCT ON (tw.species_name)
        tw.species_name,
        tw.ring_no,
        tw.weight,
        'heaviest'::text AS record_type,
        pr.max_weight AS previous_record,
        (
          SELECT MAX(pw.visit_date)
          FROM prior_weighed pw
          WHERE pw.species_name = pr.species_name
            AND pw.weight = pr.max_weight
        ) AS previous_record_date
      FROM todays_weighed tw
        JOIN prior_records pr ON tw.species_name = pr.species_name
      WHERE tw.weight >= pr.max_weight
      ORDER BY tw.species_name, tw.weight DESC
    )

    UNION ALL

    -- Lightest: today's birds equalling or undercutting the prior minimum.
    (
      SELECT DISTINCT ON (tw.species_name)
        tw.species_name,
        tw.ring_no,
        tw.weight,
        'lightest'::text AS record_type,
        pr.min_weight AS previous_record,
        (
          SELECT MAX(pw.visit_date)
          FROM prior_weighed pw
          WHERE pw.species_name = pr.species_name
            AND pw.weight = pr.min_weight
        ) AS previous_record_date
      FROM todays_weighed tw
        JOIN prior_records pr ON tw.species_name = pr.species_name
      WHERE tw.weight <= pr.min_weight
      ORDER BY tw.species_name, tw.weight ASC
    )
  ) AS record_breakers
  -- 'heaviest' sorts before 'lightest' so each species' heaviest row comes first.
  ORDER BY record_breakers.species_name, record_breakers.record_type;
END;
$function$;

GRANT ALL ON FUNCTION public.session_weight_record_breakers (date, bigint, integer) TO anon;

GRANT ALL ON FUNCTION public.session_weight_record_breakers (date, bigint, integer) TO authenticated;

GRANT ALL ON FUNCTION public.session_weight_record_breakers (date, bigint, integer) TO service_role;
