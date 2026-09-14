SET check_function_bodies = false;
CREATE OR REPLACE FUNCTION public.ring_sequence_summaries(ringing_group_filter bigint DEFAULT NULL::bigint)
 RETURNS TABLE(sequence_prefix text, ring_length integer, ring_count bigint, earliest_date date, latest_date date)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    LEFT(b.ring_no, 3)             AS sequence_prefix,
    LENGTH(b.ring_no)              AS ring_length,
    COUNT(DISTINCT b.ring_no)      AS ring_count,
    MIN(s.visit_date)              AS earliest_date,
    MAX(s.visit_date)              AS latest_date
  FROM "Birds" b
  JOIN "Encounters" e ON e.bird_id = b.id
  JOIN "Sessions"   s ON s.id = e.session_id
  WHERE e.record_type = 'N'
    AND (ringing_group_filter IS NULL OR e.ringing_group_id = ringing_group_filter)
  GROUP BY LEFT(b.ring_no, 3), LENGTH(b.ring_no)
  ORDER BY MAX(s.visit_date) DESC, MIN(s.visit_date) DESC, LEFT(b.ring_no, 3) ASC;
END;
$function$;
GRANT ALL ON FUNCTION public.ring_sequence_summaries(bigint) TO anon;
GRANT ALL ON FUNCTION public.ring_sequence_summaries(bigint) TO authenticated;
GRANT ALL ON FUNCTION public.ring_sequence_summaries(bigint) TO service_role;
CREATE OR REPLACE FUNCTION public.ring_sequence_detail(sequence_prefix_filter text, ring_length_filter integer, ringing_group_filter bigint DEFAULT NULL::bigint)
 RETURNS TABLE(ring_no text, species_name text, ringed_date date)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    b.ring_no,
    sp.species_name AS species_name,
    s.visit_date    AS ringed_date
  FROM "Birds" b
  JOIN "Species"    sp ON sp.id = b.species_id
  JOIN "Encounters" e  ON e.bird_id = b.id
  JOIN "Sessions"   s  ON s.id = e.session_id
  WHERE e.record_type = 'N'
    AND LEFT(b.ring_no, 3) = sequence_prefix_filter
    AND LENGTH(b.ring_no) = ring_length_filter
    AND (ringing_group_filter IS NULL OR e.ringing_group_id = ringing_group_filter)
  ORDER BY b.ring_no;
END;
$function$;
GRANT ALL ON FUNCTION public.ring_sequence_detail(text, integer, bigint) TO anon;
GRANT ALL ON FUNCTION public.ring_sequence_detail(text, integer, bigint) TO authenticated;
GRANT ALL ON FUNCTION public.ring_sequence_detail(text, integer, bigint) TO service_role;
CREATE OR REPLACE FUNCTION public.ring_sequence_controls(ringing_group_filter bigint DEFAULT NULL::bigint)
 RETURNS TABLE(ring_no text, species_name text, first_date date)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    b.ring_no,
    sp.species_name   AS species_name,
    MIN(s.visit_date) AS first_date
  FROM "Birds" b
  JOIN "Encounters" e  ON e.bird_id = b.id
  JOIN "Sessions"   s  ON s.id = e.session_id
  JOIN "Species"    sp ON sp.id = b.species_id
  WHERE (ringing_group_filter IS NULL OR e.ringing_group_id = ringing_group_filter)
  GROUP BY b.ring_no, sp.species_name
  HAVING COUNT(*) = COUNT(*) FILTER (WHERE e.record_type = 'S')
  ORDER BY b.ring_no;
END;
$function$;
GRANT ALL ON FUNCTION public.ring_sequence_controls(bigint) TO anon;
GRANT ALL ON FUNCTION public.ring_sequence_controls(bigint) TO authenticated;
GRANT ALL ON FUNCTION public.ring_sequence_controls(bigint) TO service_role;
