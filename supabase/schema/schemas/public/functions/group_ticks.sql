CREATE FUNCTION public.group_ticks (
	ringing_group_filter bigint DEFAULT NULL::bigint,
	location_filter bigint DEFAULT NULL::bigint,
	result_limit integer DEFAULT NULL::integer,
	from_date date DEFAULT NULL::date,
	to_date date DEFAULT NULL::date,
	year_filter smallint DEFAULT NULL::smallint,
	month_filter smallint DEFAULT NULL::smallint
) RETURNS TABLE (species_name text, first_encounter_date date) LANGUAGE plpgsql STABLE
SET
	search_path TO 'public',
	'pg_catalog' AS $function$
BEGIN
  RETURN QUERY
	-- A tick is always resolved against the group's (or location's) WHOLE history:
	-- it is the first time that species was ever encountered, full stop. The
	-- temporal filters must therefore not narrow which encounters the MIN() sees —
	-- that would report a species' first encounter *within the window* and would
	-- re-tick a species already ticked years earlier. Find the ticks first, then
	-- filter the resulting tick dates down to the requested time window.
	WITH species_ticks AS (
		SELECT
			sp.species_name as species_name,
			MIN(sess.visit_date) as first_encounter_date
		FROM public."Encounters" en
			LEFT JOIN public."Birds" b on b.id=en.bird_id
			LEFT JOIN public."Species" sp on sp.id=b.species_id
			LEFT JOIN public."Sessions" sess on sess.id=en.session_id
		WHERE
			(ringing_group_filter IS NULL OR sess.ringing_group_id = ringing_group_filter) AND
			(location_filter IS NULL OR en.location_id = location_filter)
		GROUP BY
			sp.species_name
	)
	SELECT
		st.species_name,
		st.first_encounter_date
	FROM species_ticks st
	WHERE
		(from_date IS NULL OR st.first_encounter_date >= from_date) AND
		(to_date IS NULL OR st.first_encounter_date <= to_date) AND
		(year_filter IS NULL OR EXTRACT(YEAR FROM st.first_encounter_date) = year_filter) AND
		(month_filter IS NULL OR EXTRACT(MONTH FROM st.first_encounter_date) = month_filter)
	ORDER BY st.first_encounter_date DESC, st.species_name ASC
	LIMIT result_limit;
END;
$function$;

GRANT ALL ON FUNCTION public.group_ticks (
	bigint,
	bigint,
	integer,
	date,
	date,
	smallint,
	smallint
) TO anon;

GRANT ALL ON FUNCTION public.group_ticks (
	bigint,
	bigint,
	integer,
	date,
	date,
	smallint,
	smallint
) TO authenticated;

GRANT ALL ON FUNCTION public.group_ticks (
	bigint,
	bigint,
	integer,
	date,
	date,
	smallint,
	smallint
) TO service_role;
