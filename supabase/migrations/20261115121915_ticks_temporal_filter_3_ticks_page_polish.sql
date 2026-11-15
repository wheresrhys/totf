SET check_function_bodies = false;
CREATE OR REPLACE FUNCTION public.group_ticks(ringing_group_filter bigint DEFAULT NULL::bigint, location_filter bigint DEFAULT NULL::bigint, result_limit integer DEFAULT NULL::integer, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, year_filter smallint DEFAULT NULL::smallint, month_filter smallint DEFAULT NULL::smallint, temporal_filter_mode text DEFAULT 'filter'::text)
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
			MIN(en.visit_date + en.capture_time) FILTER (
				WHERE
					(from_date IS NULL OR en.visit_date >= from_date) AND
					(to_date IS NULL OR en.visit_date <= to_date) AND
					(year_filter IS NULL OR EXTRACT(YEAR FROM en.visit_date) = year_filter) AND
					(month_filter IS NULL OR EXTRACT(MONTH FROM en.visit_date) = month_filter)
			) AS period_first_timestamp,
			MIN(en.visit_date + en.capture_time) AS all_time_first_timestamp
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
		sf.period_first_timestamp::date AS first_encounter_date,
		sf.period_first_timestamp = sf.all_time_first_timestamp AS is_first_ever
	FROM species_firsts sf
	WHERE
		sf.period_first_timestamp IS NOT NULL AND
		(temporal_filter_mode = 'scope' OR sf.period_first_timestamp = sf.all_time_first_timestamp)
	ORDER BY sf.period_first_timestamp DESC, sf.species_name ASC
	LIMIT result_limit;
END;
$function$;
