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
    -- Exclude a ring only when THIS group has its own RingSequences_Birds link for
    -- the bird. Tracking is now per-group (issue #703 fixed the old group-agnostic
    -- Birds.ring_sequence_id FK, which let one group's link block every other
    -- group from ever seeing or tracking the same bird as a control). RLS on
    -- RingSequences_Birds already scopes rows to the caller's own group, and the
    -- explicit ringing_group_id match below is defence-in-depth rather than
    -- reliance on RLS alone.
    AND NOT EXISTS (
      SELECT 1
      FROM "RingSequences_Birds" rsb
      WHERE rsb.bird_id = b.id
        AND rsb.ringing_group_id = ringing_group_filter
    )
  GROUP BY b.ring_no, sp.species_name
  HAVING COUNT(*) = COUNT(*) FILTER (WHERE e.record_type = 'S')
  ORDER BY b.ring_no;
END;
$function$;

GRANT ALL ON FUNCTION public.ring_sequence_controls (bigint) TO anon;

GRANT ALL ON FUNCTION public.ring_sequence_controls (bigint) TO authenticated;

GRANT ALL ON FUNCTION public.ring_sequence_controls (bigint) TO service_role;
