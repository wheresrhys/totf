-- juv_count/postjuv_count/pullus_count mirror the age-class split defined in TypeScript by
-- getAgeClass() in app/models/encounter.ts (#527) — keep the two in sync by hand, since
-- Postgres functions can't import a TS helper.
CREATE FUNCTION public.stats_per_day_and_species (ringing_group_filter bigint) RETURNS TABLE (
	species_name text,
	visit_date date,
	encounter_count bigint,
	juv_count bigint,
	postjuv_count bigint,
	pullus_count bigint,
	weighed_birds_count bigint,
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
    COUNT(e.*) FILTER (WHERE e.is_juv AND e.age_code IN (1, 3)) AS juv_count,
    COUNT(e.*) FILTER (WHERE e.age_code = 3 AND NOT e.is_juv) AS postjuv_count,
    COUNT(e.*) FILTER (WHERE e.age_code = 1 AND NOT e.is_juv) AS pullus_count,
    COUNT(e.*) FILTER (WHERE e.weight IS NOT NULL) AS weighed_birds_count,
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
    AND sess.session_type = 'FULL_GROWN'
  GROUP BY
    sess.visit_date, sp.species_name;
END;
$function$;

GRANT ALL ON FUNCTION public.stats_per_day_and_species (bigint) TO anon;

GRANT ALL ON FUNCTION public.stats_per_day_and_species (bigint) TO authenticated;

GRANT ALL ON FUNCTION public.stats_per_day_and_species (bigint) TO service_role;
