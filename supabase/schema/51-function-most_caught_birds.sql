CREATE OR REPLACE FUNCTION "public"."most_caught_birds" (
	"result_limit" integer DEFAULT NULL::integer,
	"max_per_species" integer DEFAULT NULL::integer,
	"significance_threshold" integer DEFAULT 3,
	"species_filter" "text" DEFAULT NULL::"text",
	"year_filter" integer DEFAULT NULL::integer,
	"ringing_group_filter" bigint DEFAULT NULL::bigint
) RETURNS TABLE (
	"species_name" "text",
	"ring_no" "text",
	"encounter_count" bigint
) LANGUAGE "plpgsql" STABLE
SET
	"search_path" TO 'public',
	'pg_catalog' AS $$
BEGIN
  RETURN QUERY
	WITH bird_encounter_counts AS (
  SELECT
    sp.species_name as species_name,
    b.ring_no as ring_no,
    count(en.*) as encounter_count
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
    b.ring_no
  ), significant_birds AS (
    SELECT * FROM bird_encounter_counts as bec
    WHERE bec.encounter_count >= significance_threshold
  ), top_per_species AS (
		SELECT *
		FROM (
			SELECT *,
				ROW_NUMBER() OVER (PARTITION BY sb.species_name ORDER BY sb.encounter_count DESC) AS rn
			FROM significant_birds as sb
		) sub
		WHERE max_per_species IS NULL OR rn <= max_per_species
	)
	SELECT tps.species_name, tps.ring_no, tps.encounter_count FROM top_per_species as tps
	ORDER BY tps.encounter_count DESC, tps.ring_no DESC
	LIMIT result_limit;
END;
$$;

ALTER FUNCTION "public"."most_caught_birds" (
	"result_limit" integer,
	"max_per_species" integer,
	"significance_threshold" integer,
	"species_filter" "text",
	"year_filter" integer,
	"ringing_group_filter" bigint
) OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."most_caught_birds" (
	"result_limit" integer,
	"max_per_species" integer,
	"significance_threshold" integer,
	"species_filter" "text",
	"year_filter" integer,
	"ringing_group_filter" bigint
) TO "anon";

GRANT ALL ON FUNCTION "public"."most_caught_birds" (
	"result_limit" integer,
	"max_per_species" integer,
	"significance_threshold" integer,
	"species_filter" "text",
	"year_filter" integer,
	"ringing_group_filter" bigint
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."most_caught_birds" (
	"result_limit" integer,
	"max_per_species" integer,
	"significance_threshold" integer,
	"species_filter" "text",
	"year_filter" integer,
	"ringing_group_filter" bigint
) TO "service_role";
