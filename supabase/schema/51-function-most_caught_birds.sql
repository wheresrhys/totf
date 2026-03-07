CREATE OR REPLACE FUNCTION "public"."most_caught_birds" (
	"result_limit" integer DEFAULT 5,
	"species_filter" "text" DEFAULT NULL::"text",
	"year_filter" integer DEFAULT NULL::integer
) RETURNS TABLE (
	"species_name" "text",
	"ring_no" "text",
	"encounters" bigint
) LANGUAGE "plpgsql" STABLE
SET
	"search_path" TO 'public',
	'pg_catalog' AS $$
BEGIN
  RETURN QUERY
  SELECT
    sp.species_name as species_name,
    b.ring_no as ring_no,
    count(en.*) as encounters
  FROM public."Encounters" en
    LEFT JOIN public."Birds" b on  b.id=en.bird_id
    LEFT JOIN public."Species" sp on sp.id=b.species_id
    LEFT JOIN public."Sessions" sess on sess.id=en.session_id
  WHERE
    (species_filter IS NULL OR sp.species_name ilike species_filter) AND
    (year_filter IS NULL OR EXTRACT(YEAR FROM sess.visit_date) = year_filter)
  GROUP BY
    sp.species_name,
    b.ring_no
  ORDER BY
    encounters DESC,
		ring_no DESC
  LIMIT result_limit;
END;
$$;

ALTER FUNCTION "public"."most_caught_birds" (
	"result_limit" integer,
	"species_filter" "text",
	"year_filter" integer
) OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."most_caught_birds" (
	"result_limit" integer,
	"species_filter" "text",
	"year_filter" integer
) TO "anon";

GRANT ALL ON FUNCTION "public"."most_caught_birds" (
	"result_limit" integer,
	"species_filter" "text",
	"year_filter" integer
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."most_caught_birds" (
	"result_limit" integer,
	"species_filter" "text",
	"year_filter" integer
) TO "service_role";
