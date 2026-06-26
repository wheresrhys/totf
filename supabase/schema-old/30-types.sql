CREATE TYPE "public"."top_metrics_filter_params" AS (
	"month_filter" integer,
	"year_filter" integer,
	"exact_months_filter" "text" [],
	"months_filter" INTEGER[],
	"species_filter" "text",
	"ringing_group_filter" bigint
);

ALTER TYPE "public"."top_metrics_filter_params" OWNER TO "postgres";
