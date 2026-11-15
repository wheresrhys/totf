-- A "tick" is the first time a species was encountered. temporal_filter_mode
-- decides what the four temporal filters (from_date/to_date/year_filter/
-- month_filter) mean:
--
-- 'filter' (default): a tick is resolved against the group's (or location's)
--   WHOLE history — the first time that species was ever encountered — and the
--   temporal filters only select which of those first-ever tick dates are
--   returned. A species first encountered before the window is absent rather
--   than re-ticked at an in-window date.
-- 'scope': the temporal filters narrow which encounters count, so a tick is the
--   species' first encounter WITHIN the window, whether or not it was seen
--   earlier.
--
-- Either way is_first_ever says whether the returned date is also the species'
-- all-time first (under the same group/location scope). 'filter' mode is
-- exactly the is_first_ever subset of 'scope' mode, so its rows are always
-- is_first_ever. Both dates come out of one aggregate pass — the in-window MIN
-- via an aggregate FILTER clause — rather than two grouped CTEs joined back
-- together. The minimums are taken over visit_date + capture_time, so ticks
-- falling on the same date are ordered by when that first capture happened.
CREATE FUNCTION public.group_ticks (
	ringing_group_filter bigint DEFAULT NULL::bigint,
	location_filter bigint DEFAULT NULL::bigint,
	result_limit integer DEFAULT NULL::integer,
	from_date date DEFAULT NULL::date,
	to_date date DEFAULT NULL::date,
	year_filter smallint DEFAULT NULL::smallint,
	month_filter smallint DEFAULT NULL::smallint,
	temporal_filter_mode text DEFAULT 'filter'::text
) RETURNS TABLE (
	species_name text,
	first_encounter_date date,
	is_first_ever boolean
) LANGUAGE plpgsql STABLE
SET
	search_path TO 'public',
	'pg_catalog' AS $function$
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

GRANT ALL ON FUNCTION public.group_ticks (
	bigint,
	bigint,
	integer,
	date,
	date,
	smallint,
	smallint,
	text
) TO anon;

GRANT ALL ON FUNCTION public.group_ticks (
	bigint,
	bigint,
	integer,
	date,
	date,
	smallint,
	smallint,
	text
) TO authenticated;

GRANT ALL ON FUNCTION public.group_ticks (
	bigint,
	bigint,
	integer,
	date,
	date,
	smallint,
	smallint,
	text
) TO service_role;
