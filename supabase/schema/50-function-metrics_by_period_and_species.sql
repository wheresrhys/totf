CREATE OR REPLACE FUNCTION "public"."metrics_by_period_and_species" (
	"temporal_unit" "text",
	"metric_name" "text",
	"filters" "public"."top_metrics_filter_params" DEFAULT NULL::"public"."top_metrics_filter_params"
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
      ELSE 1
    END::BIGINT AS metric_value
  FROM
    public."Birds" b
    LEFT JOIN public."Encounters" e ON b.id = e.bird_id
    LEFT JOIN public."Sessions" sess ON e.session_id = sess.id
    LEFT JOIN public."Species" sp ON b.species_id = sp.id
  WHERE
    sess.visit_date IS NOT NULL
    AND (filters IS NULL OR filters.month_filter IS NULL OR EXTRACT(MONTH FROM sess.visit_date) = filters.month_filter)
    AND (filters IS NULL OR filters.year_filter IS NULL OR EXTRACT(YEAR FROM sess.visit_date) = filters.year_filter)
    AND (filters IS NULL OR filters.exact_months_filter IS NULL OR TO_CHAR(sess.visit_date, 'YYYY-MM') = ANY(filters.exact_months_filter))
    AND (filters IS NULL OR filters.months_filter IS NULL OR EXTRACT(MONTH FROM sess.visit_date) = ANY(filters.months_filter))
    AND (filters IS NULL OR filters.species_filter IS NULL OR sp.species_name = filters.species_filter)
  GROUP BY
    date_trunc(temporal_unit, sess.visit_date), sp.species_name;
END;
$$;

ALTER FUNCTION "public"."metrics_by_period_and_species" (
	"temporal_unit" "text",
	"metric_name" "text",
	"filters" "public"."top_metrics_filter_params"
) OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."metrics_by_period_and_species" (
	"temporal_unit" "text",
	"metric_name" "text",
	"filters" "public"."top_metrics_filter_params"
) TO "anon";

GRANT ALL ON FUNCTION "public"."metrics_by_period_and_species" (
	"temporal_unit" "text",
	"metric_name" "text",
	"filters" "public"."top_metrics_filter_params"
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."metrics_by_period_and_species" (
	"temporal_unit" "text",
	"metric_name" "text",
	"filters" "public"."top_metrics_filter_params"
) TO "service_role";
