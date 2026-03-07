CREATE OR REPLACE FUNCTION "public"."paginated_birds_table" (
	"species_name_param" "text",
	"result_limit" integer,
	"result_offset" integer DEFAULT 0
) RETURNS TABLE (
	"encounter_id" bigint,
	"session_id" bigint,
	"bird_id" bigint,
	"visit_date" "date",
	"capture_time" time without time zone,
	"ring_no" "text",
	"age_code" smallint,
	"is_juv" boolean,
	"minimum_years" smallint,
	"record_type" "text",
	"sex" "text",
	"weight" real,
	"wing_length" smallint
) LANGUAGE "plpgsql" AS $$
BEGIN
  RETURN QUERY
 WITH bird_last_encounters AS (
    -- Get the most recent encounter for each bird
    SELECT DISTINCT ON (b.id)
      b.id,
      ss.visit_date as visit_date,
      e.capture_time as capture_time
    FROM "Species" sp
    LEFT JOIN "Birds" b ON b.species_id = sp.id
    LEFT JOIN "Encounters" e ON b.id = e.bird_id
    LEFT JOIN "Sessions" ss ON ss.id = e.session_id
    WHERE sp.species_name = species_name_param
    ORDER BY
      b.id,
      ss.visit_date DESC,
      e.capture_time DESC
  ),
  top_birds AS (
    -- Select distinct bird IDs based on their most recent encounter
    SELECT id
    FROM bird_last_encounters
    ORDER BY
      bird_last_encounters.visit_date DESC,
      bird_last_encounters.capture_time DESC,
      bird_last_encounters.id ASC
    LIMIT result_limit
    OFFSET result_offset
  )
  -- Return ALL encounters for those birds
  SELECT
    e.id as encounter_id,
    ss.id as session_id,
    b.id as bird_id,
    ss.visit_date,
    e.capture_time,
    b.ring_no,
    e.age_code,
    e.is_juv,
    e.minimum_years,
    e.record_type,
    e.sex,
    e.weight,
    e.wing_length
  FROM top_birds tb
  JOIN "Birds" b ON b.id = tb.id
  LEFT JOIN "Encounters" e ON b.id = e.bird_id
  LEFT JOIN "Sessions" ss ON ss.id = e.session_id
  ORDER BY
    ss.visit_date DESC,
    e.capture_time DESC;
END;
$$;

ALTER FUNCTION "public"."paginated_birds_table" (
	"species_name_param" "text",
	"result_limit" integer,
	"result_offset" integer
) OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."paginated_birds_table" (
	"species_name_param" "text",
	"result_limit" integer,
	"result_offset" integer
) TO "anon";

GRANT ALL ON FUNCTION "public"."paginated_birds_table" (
	"species_name_param" "text",
	"result_limit" integer,
	"result_offset" integer
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."paginated_birds_table" (
	"species_name_param" "text",
	"result_limit" integer,
	"result_offset" integer
) TO "service_role";
