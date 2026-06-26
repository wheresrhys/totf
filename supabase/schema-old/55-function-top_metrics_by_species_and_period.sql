CREATE OR REPLACE FUNCTION "public"."top_metrics_by_species_and_period" (
	"temporal_unit" "text",
	"metric_name" "text",
	"result_limit" integer,
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
  WITH by_period_and_species AS (
    SELECT * from metrics_by_period_and_species(
      temporal_unit=>temporal_unit,
      metric_name=>metric_name,
      filters=>filters
    )
  )
  SELECT
    "by_period_and_species"."species_name",
    "by_period_and_species"."visit_date",
    "by_period_and_species"."metric_value"
  FROM
    by_period_and_species
  ORDER BY
    "by_period_and_species"."metric_value" DESC,
    "by_period_and_species"."visit_date" DESC,
    "by_period_and_species"."species_name" DESC
  LIMIT result_limit;
END;
$$;

ALTER FUNCTION "public"."top_metrics_by_species_and_period" (
	"temporal_unit" "text",
	"metric_name" "text",
	"result_limit" integer,
	"filters" "public"."top_metrics_filter_params"
) OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."top_metrics_by_species_and_period" (
	"temporal_unit" "text",
	"metric_name" "text",
	"result_limit" integer,
	"filters" "public"."top_metrics_filter_params"
) TO "anon";

GRANT ALL ON FUNCTION "public"."top_metrics_by_species_and_period" (
	"temporal_unit" "text",
	"metric_name" "text",
	"result_limit" integer,
	"filters" "public"."top_metrics_filter_params"
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."top_metrics_by_species_and_period" (
	"temporal_unit" "text",
	"metric_name" "text",
	"result_limit" integer,
	"filters" "public"."top_metrics_filter_params"
) TO "service_role";
