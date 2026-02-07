CREATE OR REPLACE FUNCTION "public"."top_species_by_metric" (
	"temporal_unit" "text",
	"metric_name" "text",
	"result_limit" integer,
	"month_filter" integer DEFAULT NULL::integer,
	"year_filter" integer DEFAULT NULL::integer,
	"exact_months_filter" "text" [] DEFAULT NULL::"text" [],
	"months_filter" INTEGER[] DEFAULT NULL::INTEGER[]
) RETURNS TABLE (
	"species_name" "text",
	"visit_date" "date",
	"metric_value" bigint
) LANGUAGE "plpgsql" STABLE
SET
	"search_path" TO 'public',
	'pg_catalog' AS $$
BEGIN
  RETURN QUERY
  SELECT
    sp.species_name as species_name,
    date_trunc(temporal_unit, sess.visit_date)::DATE AS visit_date,
    CASE
      WHEN metric_name = 'encounters' THEN count(e.*)
      WHEN metric_name = 'individuals' THEN count(DISTINCT b.ring_no)
      WHEN metric_name = 'species' THEN count(DISTINCT sp.species_name)
      ELSE count(e.*)
    END::BIGINT AS metric_value
  FROM
    public."Birds" b
    LEFT JOIN public."Encounters" e ON b.id = e.bird_id
    LEFT JOIN public."Sessions" sess ON e.session_id = sess.id
    LEFT JOIN public."Species" sp ON b.species_id = sp.id
  WHERE
    sess.visit_date IS NOT NULL
    AND (month_filter IS NULL OR EXTRACT(MONTH FROM sess.visit_date) = month_filter)
    AND (year_filter IS NULL OR EXTRACT(YEAR FROM sess.visit_date) = year_filter)
    AND (exact_months_filter IS NULL OR TO_CHAR(sess.visit_date, 'YYYY-MM') = ANY(exact_months_filter))
    AND (months_filter IS NULL OR EXTRACT(MONTH FROM sess.visit_date) = ANY(months_filter))
  GROUP BY
    sp.species_name,
    date_trunc(temporal_unit, sess.visit_date)
  ORDER BY
    metric_value DESC
  LIMIT result_limit;
END;
$$;

ALTER FUNCTION "public"."top_species_by_metric" (
	"temporal_unit" "text",
	"metric_name" "text",
	"result_limit" integer,
	"month_filter" integer,
	"year_filter" integer,
	"exact_months_filter" "text" [],
	"months_filter" INTEGER[]
) OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."top_species_by_metric" (
	"temporal_unit" "text",
	"metric_name" "text",
	"result_limit" integer,
	"month_filter" integer,
	"year_filter" integer,
	"exact_months_filter" "text" [],
	"months_filter" INTEGER[]
) TO "anon";

GRANT ALL ON FUNCTION "public"."top_species_by_metric" (
	"temporal_unit" "text",
	"metric_name" "text",
	"result_limit" integer,
	"month_filter" integer,
	"year_filter" integer,
	"exact_months_filter" "text" [],
	"months_filter" INTEGER[]
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."top_species_by_metric" (
	"temporal_unit" "text",
	"metric_name" "text",
	"result_limit" integer,
	"month_filter" integer,
	"year_filter" integer,
	"exact_months_filter" "text" [],
	"months_filter" INTEGER[]
) TO "service_role";
