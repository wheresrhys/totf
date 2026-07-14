CREATE FUNCTION public.long_absence_retraps (
	session_date date,
	ringing_group_filter bigint,
	min_gap_days integer DEFAULT 730
) RETURNS TABLE (
	ring_no text,
	species_name text,
	previous_date date,
	gap_days integer
) LANGUAGE plpgsql STABLE
SET
	search_path TO 'public',
	'pg_catalog' AS $function$
BEGIN
  RETURN QUERY
  WITH todays_birds AS (
    SELECT DISTINCT b.id AS bird_id, b.ring_no AS ring_no, sp.species_name AS species_name
    FROM public."Encounters" e
      JOIN public."Sessions" sess ON e.session_id = sess.id
      JOIN public."Birds" b ON e.bird_id = b.id
      LEFT JOIN public."Species" sp ON b.species_id = sp.id
    WHERE sess.visit_date = session_date
      AND sess.ringing_group_id = ringing_group_filter
  ),
  previous_visits AS (
    SELECT e.bird_id AS bird_id, MAX(sess.visit_date) AS previous_date
    FROM public."Encounters" e
      JOIN public."Sessions" sess ON e.session_id = sess.id
    WHERE sess.visit_date < session_date
      AND sess.ringing_group_id = ringing_group_filter
    GROUP BY e.bird_id
  )
  SELECT
    tb.ring_no,
    tb.species_name,
    pv.previous_date,
    (session_date - pv.previous_date)::integer AS gap_days
  FROM todays_birds tb
    JOIN previous_visits pv ON tb.bird_id = pv.bird_id
  WHERE (session_date - pv.previous_date) >= min_gap_days
  ORDER BY gap_days DESC;
END;
$function$;

GRANT ALL ON FUNCTION public.long_absence_retraps (date, bigint, integer) TO anon;

GRANT ALL ON FUNCTION public.long_absence_retraps (date, bigint, integer) TO authenticated;

GRANT ALL ON FUNCTION public.long_absence_retraps (date, bigint, integer) TO service_role;
