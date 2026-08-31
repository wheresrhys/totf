CREATE FUNCTION public.ring_sequence_controls (ringing_group_filter bigint DEFAULT NULL::bigint) RETURNS TABLE (ring_no text, species_name text, first_date date) LANGUAGE plpgsql STABLE
SET
	search_path TO 'public',
	'pg_catalog' AS $function$
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
  WHERE (ringing_group_filter IS NULL OR s.ringing_group_id = ringing_group_filter)
    -- Exclude any ring whose leading-alpha prefix already has a RingSequences
    -- row for this group — regardless of owned_by_group. A prefix the group
    -- already tracks (including one promoted from a control, owned_by_group =
    -- false) is not a "foreign" control, so it must not resurface here.
    AND NOT EXISTS (
      SELECT 1
      FROM "RingSequences" rs
      WHERE rs.ringing_group_id = ringing_group_filter
        AND rs.prefix = substring(b.ring_no FROM '^[A-Za-z]+')
    )
  GROUP BY b.ring_no, sp.species_name
  HAVING COUNT(*) = COUNT(*) FILTER (WHERE e.record_type = 'S')
  ORDER BY b.ring_no;
END;
$function$;

GRANT ALL ON FUNCTION public.ring_sequence_controls (bigint) TO anon;

GRANT ALL ON FUNCTION public.ring_sequence_controls (bigint) TO authenticated;

GRANT ALL ON FUNCTION public.ring_sequence_controls (bigint) TO service_role;
