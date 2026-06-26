CREATE FUNCTION public.notable_retraps (
	result_limit integer DEFAULT NULL::integer,
	result_limit_per_species integer DEFAULT NULL::integer,
	min_proven_age integer DEFAULT NULL::integer,
	min_encounter_count integer DEFAULT NULL::integer,
	species_filter text DEFAULT NULL::text,
	year_filter integer DEFAULT NULL::integer,
	ringing_group_filter bigint DEFAULT NULL::bigint
) RETURNS TABLE (
	species_name text,
	ring_no text,
	encounter_count bigint,
	encounter_dates date[],
	proven_age smallint
) LANGUAGE plpgsql STABLE
SET
	search_path TO 'public',
	'pg_catalog' AS $function$
BEGIN
  RETURN QUERY
	WITH bird_encounter_counts AS (
  SELECT
    sp.species_name as species_name,
    b.ring_no as ring_no,
    b.proven_age as proven_age,
    count(en.*) as encounter_count,
		array_agg(sess.visit_date order by sess.visit_date ASC) as encounter_dates
  FROM public."Encounters" en
    LEFT JOIN public."Birds" b on  b.id=en.bird_id
    LEFT JOIN public."Species" sp on sp.id=b.species_id
    LEFT JOIN public."Sessions" sess on sess.id=en.session_id
  WHERE
    (species_filter IS NULL OR sp.species_name ilike species_filter) AND
    (year_filter IS NULL OR EXTRACT(YEAR FROM sess.visit_date) = year_filter)
		AND (ringing_group_filter IS NULL OR en.ringing_group_id = ringing_group_filter)
  GROUP BY
    sp.species_name,
    b.ring_no,
    b.proven_age
  ), significant_birds AS (
    SELECT * FROM bird_encounter_counts as bec

  ), top_per_species AS (
		SELECT *
		FROM (
			SELECT *,
				ROW_NUMBER() OVER (PARTITION BY sb.species_name ORDER BY sb.encounter_count DESC) AS rn
			FROM significant_birds as sb
		) sub
		WHERE result_limit_per_species IS NULL OR rn <= result_limit_per_species
	)
	SELECT tps.species_name, tps.ring_no, tps.encounter_count, tps.encounter_dates, tps.proven_age FROM top_per_species as tps
  WHERE
  (min_proven_age IS NULL AND min_encounter_count IS NULL)
  OR
  tps.encounter_count >= min_encounter_count
  OR
  tps.proven_age >= min_proven_age

	ORDER BY tps.encounter_count DESC, tps.ring_no DESC
	LIMIT result_limit;
END;
$function$;

GRANT ALL ON FUNCTION public.notable_retraps (
	integer,
	integer,
	integer,
	integer,
	text,
	integer,
	bigint
) TO anon;

GRANT ALL ON FUNCTION public.notable_retraps (
	integer,
	integer,
	integer,
	integer,
	text,
	integer,
	bigint
) TO authenticated;

GRANT ALL ON FUNCTION public.notable_retraps (
	integer,
	integer,
	integer,
	integer,
	text,
	integer,
	bigint
) TO service_role;
