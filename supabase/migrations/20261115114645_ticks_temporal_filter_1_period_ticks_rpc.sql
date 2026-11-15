SET check_function_bodies = false;
DROP FUNCTION public.group_ticks(IN ringing_group_filter bigint, IN location_filter bigint, IN result_limit integer, IN from_date date, IN to_date date, IN year_filter smallint, IN month_filter smallint);
CREATE FUNCTION public.group_ticks(ringing_group_filter bigint DEFAULT NULL::bigint, location_filter bigint DEFAULT NULL::bigint, result_limit integer DEFAULT NULL::integer, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, year_filter smallint DEFAULT NULL::smallint, month_filter smallint DEFAULT NULL::smallint, temporal_filter_mode text DEFAULT 'filter'::text)
 RETURNS TABLE(species_name text, first_encounter_date date, is_first_ever boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  IF temporal_filter_mode IS NULL OR temporal_filter_mode NOT IN ('filter', 'scope') THEN
    RAISE EXCEPTION 'group_ticks: temporal_filter_mode must be ''filter'' or ''scope'', got %', temporal_filter_mode;
  END IF;

  RETURN QUERY
	WITH species_firsts AS (
		SELECT
			sp.species_name AS species_name,
			MIN(en.visit_date) FILTER (
				WHERE
					(from_date IS NULL OR en.visit_date >= from_date) AND
					(to_date IS NULL OR en.visit_date <= to_date) AND
					(year_filter IS NULL OR EXTRACT(YEAR FROM en.visit_date) = year_filter) AND
					(month_filter IS NULL OR EXTRACT(MONTH FROM en.visit_date) = month_filter)
			) AS period_first_date,
			MIN(en.visit_date) AS all_time_first_date
		FROM public."Encounters" en
			JOIN public."Birds" b ON b.id = en.bird_id
			JOIN public."Species" sp ON sp.id = b.species_id
		WHERE
			(ringing_group_filter IS NULL OR en.ringing_group_id = ringing_group_filter) AND
			(location_filter IS NULL OR en.location_id = location_filter)
		GROUP BY
			sp.species_name
	)
	SELECT
		sf.species_name,
		sf.period_first_date AS first_encounter_date,
		sf.period_first_date = sf.all_time_first_date AS is_first_ever
	FROM species_firsts sf
	WHERE
		sf.period_first_date IS NOT NULL AND
		(temporal_filter_mode = 'scope' OR sf.period_first_date = sf.all_time_first_date)
	ORDER BY sf.period_first_date DESC, sf.species_name ASC
	LIMIT result_limit;
END;
$function$;
GRANT ALL ON FUNCTION public.group_ticks(bigint, bigint, integer, date, date, smallint, smallint, text) TO anon;
GRANT ALL ON FUNCTION public.group_ticks(bigint, bigint, integer, date, date, smallint, smallint, text) TO authenticated;
GRANT ALL ON FUNCTION public.group_ticks(bigint, bigint, integer, date, date, smallint, smallint, text) TO service_role;
