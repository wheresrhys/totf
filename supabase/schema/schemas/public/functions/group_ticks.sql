CREATE FUNCTION public.group_ticks (
	ringing_group_filter bigint DEFAULT NULL::bigint,
	location_filter bigint DEFAULT NULL::bigint,
	result_limit integer DEFAULT NULL::integer
) RETURNS TABLE (species_name text, first_encounter_date date) LANGUAGE plpgsql STABLE
SET
	search_path TO 'public',
	'pg_catalog' AS $function$
BEGIN
  RETURN QUERY
	SELECT
		sp.species_name as species_name,
		MIN(sess.visit_date) as first_encounter_date
	FROM public."Encounters" en
		LEFT JOIN public."Birds" b on b.id=en.bird_id
		LEFT JOIN public."Species" sp on sp.id=b.species_id
		LEFT JOIN public."Sessions" sess on sess.id=en.session_id
	WHERE
		(ringing_group_filter IS NULL OR sess.ringing_group_id = ringing_group_filter) AND
		(location_filter IS NULL OR sess.location_id = location_filter)
	GROUP BY
		sp.species_name
	ORDER BY first_encounter_date DESC, sp.species_name ASC
	LIMIT result_limit;
END;
$function$;

GRANT ALL ON FUNCTION public.group_ticks (bigint, bigint, integer) TO anon;

GRANT ALL ON FUNCTION public.group_ticks (bigint, bigint, integer) TO authenticated;

GRANT ALL ON FUNCTION public.group_ticks (bigint, bigint, integer) TO service_role;
