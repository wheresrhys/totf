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
    -- Exclude any ring already linked to a RingSequences row. A bird attached to
    -- a sequence is being tracked, so it is no longer a "foreign" control and must
    -- not resurface here. This deliberately ignores which group owns that sequence:
    -- the deeper multi-tenancy flaw (a group can attach a "shadow sequence" to a
    -- bird it does not truly own, blocking the real owner) is tracked separately —
    -- see PR #690's review thread and issue #703.
    AND b.ring_sequence_id IS NULL
  GROUP BY b.ring_no, sp.species_name
  HAVING COUNT(*) = COUNT(*) FILTER (WHERE e.record_type = 'S')
  ORDER BY b.ring_no;
END;
$function$;

GRANT ALL ON FUNCTION public.ring_sequence_controls (bigint) TO anon;

GRANT ALL ON FUNCTION public.ring_sequence_controls (bigint) TO authenticated;

GRANT ALL ON FUNCTION public.ring_sequence_controls (bigint) TO service_role;
