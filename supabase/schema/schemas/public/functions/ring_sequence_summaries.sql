CREATE FUNCTION public.ring_sequence_summaries (ringing_group_filter bigint DEFAULT NULL::bigint) RETURNS TABLE (
	sequence_prefix text,
	ring_length int,
	ring_count bigint,
	earliest_date date,
	latest_date date
) LANGUAGE plpgsql STABLE
SET
	search_path TO 'public',
	'pg_catalog' AS $function$
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
    AND (ringing_group_filter IS NULL OR s.ringing_group_id = ringing_group_filter)
  GROUP BY LEFT(b.ring_no, 3), LENGTH(b.ring_no)
  ORDER BY MAX(s.visit_date) DESC, MIN(s.visit_date) DESC, LEFT(b.ring_no, 3) ASC;
END;
$function$;

GRANT ALL ON FUNCTION public.ring_sequence_summaries (bigint) TO anon;

GRANT ALL ON FUNCTION public.ring_sequence_summaries (bigint) TO authenticated;

GRANT ALL ON FUNCTION public.ring_sequence_summaries (bigint) TO service_role;
