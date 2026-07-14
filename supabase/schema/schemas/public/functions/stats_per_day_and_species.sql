CREATE FUNCTION public.stats_per_day_and_species (ringing_group_filter bigint) RETURNS TABLE (
	species_name text,
	visit_date date,
	encounter_count bigint,
	weighted_birds_count bigint,
	min_weight numeric,
	max_weight numeric
) LANGUAGE plpgsql STABLE
SET
	search_path TO 'public',
	'pg_catalog' AS $function$
BEGIN
  RETURN QUERY
  SELECT
    sp.species_name AS species_name,
    sess.visit_date AS visit_date,
    COUNT(e.*) AS encounter_count,
    COUNT(e.*) FILTER (WHERE e.weight IS NOT NULL) AS weighted_birds_count,
    MIN(e.weight::numeric) AS min_weight,
    MAX(e.weight::numeric) AS max_weight
  FROM
    public."Birds" b
    LEFT JOIN public."Encounters" e ON b.id = e.bird_id
    LEFT JOIN public."Sessions" sess ON e.session_id = sess.id
    LEFT JOIN public."Species" sp ON b.species_id = sp.id
  WHERE
    sess.visit_date IS NOT NULL
    AND e.ringing_group_id = ringing_group_filter
    AND sess.ringing_group_id = ringing_group_filter
  GROUP BY
    sess.visit_date, sp.species_name;
END;
$function$;

GRANT ALL ON FUNCTION public.stats_per_day_and_species (bigint) TO anon;

GRANT ALL ON FUNCTION public.stats_per_day_and_species (bigint) TO authenticated;

GRANT ALL ON FUNCTION public.stats_per_day_and_species (bigint) TO service_role;
