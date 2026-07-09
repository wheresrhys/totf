CREATE FUNCTION public.ring_sequence_detail (
	sequence_prefix_filter text,
	ring_length_filter int,
	ringing_group_filter bigint DEFAULT NULL::bigint
) RETURNS TABLE (
	ring_no text,
	species_name text,
	ringed_date date
) LANGUAGE plpgsql STABLE
SET
	search_path TO 'public',
	'pg_catalog' AS $function$
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

GRANT ALL ON FUNCTION public.ring_sequence_detail (text, int, bigint) TO anon;

GRANT ALL ON FUNCTION public.ring_sequence_detail (text, int, bigint) TO authenticated;

GRANT ALL ON FUNCTION public.ring_sequence_detail (text, int, bigint) TO service_role;
