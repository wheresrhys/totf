CREATE OR REPLACE FUNCTION "public"."find_discrepencies" (
	"ringing_group_filter" bigint DEFAULT NULL::bigint
) RETURNS TABLE (
	"bird_id" bigint,
	"ring_no" "text",
	"species_name" "text",
	"discrepency_type" "text"
) LANGUAGE "plpgsql" STABLE
SET
	"search_path" TO 'public',
	'pg_catalog' AS $$
BEGIN
  RETURN QUERY


WITH
	hatch_ages AS (
		SELECT
			b.id AS bird_id,
			b.ring_no AS ring_no,
			s.visit_date,
			e.age_code,
			sp.species_name,
			EXTRACT(
				YEAR
				FROM
					s.visit_date
			)::INTEGER AS visit_year,
			CASE
				WHEN e.age_code % 2 = 0 THEN EXTRACT(
					YEAR
					FROM
						s.visit_date
				)::INTEGER - (e.age_code / 2 - 1)
				WHEN e.age_code % 2 = 1
				AND e.age_code > 1 THEN EXTRACT(
					YEAR
					FROM
						s.visit_date
				)::INTEGER - ((e.age_code - 3) / 2)
				ELSE EXTRACT(
					YEAR
					FROM
						s.visit_date
				)::INTEGER
			END AS max_hatch_year,
			CASE
				WHEN e.age_code % 2 = 0 THEN 0
				WHEN e.age_code % 2 = 1
				AND e.age_code > 1 THEN EXTRACT(
					YEAR
					FROM
						s.visit_date
				)::INTEGER - ((e.age_code - 3) / 2)
				ELSE EXTRACT(
					YEAR
					FROM
						s.visit_date
				)::INTEGER
			END AS min_hatch_year
		FROM
			"Encounters" e
			JOIN "Birds" b ON e.bird_id = b.id
			JOIN "Sessions" s ON s.id = e.session_id
			JOIN "Species" sp ON sp.id = b.species_id
		WHERE
			(ringing_group_filter IS NULL OR e.ringing_group_id = ringing_group_filter)
	),
	hatch_year_differences AS (
		SELECT
			MAX(hatch_ages.min_hatch_year) AS max_min_year,
			MIN(hatch_ages.max_hatch_year) AS min_max_year,
			hatch_ages.bird_id as bird_id,
			hatch_ages.ring_no as ring_no,
			hatch_ages.species_name as species_name
		FROM
			hatch_ages
		GROUP BY
			hatch_ages.bird_id,
			hatch_ages.ring_no,
			hatch_ages.species_name
	),
	sex_counts AS (
		SELECT
			b.id AS bird_id,
			b.ring_no AS ring_no,
			s.species_name,
			count(DISTINCT e.sex) AS sex_count
		FROM
			"Birds" b
			JOIN "Encounters" e ON e.bird_id = b.id
			JOIN "Species" s ON s.id = b.species_id
		WHERE
			NOT e.sex ILIKE 'u'
			AND (ringing_group_filter IS NULL OR e.ringing_group_id = ringing_group_filter)
		GROUP BY
			b.id,
			b.ring_no,
			s.species_name
	),wing_lengths as (SELECT
  b.id as bird_id,
  b.ring_no as ring_no,
  s.species_name,
  MAX(e.wing_length) as max_wing_length,
  MIN(e.wing_length) as min_wing_length
from "Birds" b
JOIN "Encounters" e on e.bird_id = b.id
JOIN "Species" s on s.id = b.species_id
WHERE e.wing_length IS NOT NULL
AND (ringing_group_filter IS NULL OR e.ringing_group_id = ringing_group_filter)
GROUP by b.id, b.ring_no, s.species_name)

SELECT
	hatch_year_differences.bird_id as bird_id,
	hatch_year_differences.ring_no as ring_no,
	hatch_year_differences.species_name as species_name,
	'age' as discrepency_type
FROM
	hatch_year_differences
WHERE
	min_max_year < max_min_year

UNION ALL
SELECT
	sex_counts.bird_id as bird_id,
	sex_counts.ring_no as ring_no,
	sex_counts.species_name as species_name,
  'sex' as discrepency_type
FROM
	sex_counts
WHERE
	sex_count > 1
UNION ALL
SELECT
  wing_lengths.bird_id as bird_id,
  wing_lengths.ring_no as ring_no,
  wing_lengths.species_name as species_name,
  'wing_length' as discrepency_type
FROM wing_lengths
WHERE max_wing_length - min_wing_length >= 5;




END;
$$;

ALTER FUNCTION "public"."find_discrepencies" ("ringing_group_filter" bigint) OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."find_discrepencies" ("ringing_group_filter" bigint) TO "anon";

GRANT ALL ON FUNCTION "public"."find_discrepencies" ("ringing_group_filter" bigint) TO "authenticated";

GRANT ALL ON FUNCTION "public"."find_discrepencies" ("ringing_group_filter" bigint) TO "service_role";
