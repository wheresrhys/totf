CREATE OR REPLACE FUNCTION "public"."species_stats" (
	"species_name_filter" "text" DEFAULT NULL::"text",
	"from_date" "date" DEFAULT NULL::"date",
	"to_date" "date" DEFAULT NULL::"date"
) RETURNS TABLE (
	"species_name" "text",
	"bird_count" bigint,
	"encounter_count" bigint,
	"session_count" bigint,
	"max_weight" real,
	"avg_weight" numeric,
	"min_weight" real,
	"median_weight" numeric,
	"max_wing" smallint,
	"avg_wing" numeric,
	"min_wing" smallint,
	"median_wing" numeric,
	"max_encountered_bird" bigint,
	"pct_retrapped" numeric,
	"max_time_span" numeric,
	"max_per_session" bigint,
	"max_proven_age" numeric
) LANGUAGE "plpgsql" AS $$
  BEGIN
  RETURN QUERY
  WITH species_encounters AS (
    -- Pre-aggregate all encounter data per species
    SELECT
      sp.id AS species_id,
      sp.species_name,
      b.id AS bird_id,
      b.ring_no,
      e.id AS encounter_id,
      e.weight,
      e.wing_length,
      sess.id AS session_id,
      sess.visit_date,
      e.minimum_years
    FROM public."Species" sp
    JOIN public."Birds" b ON sp.id = b.species_id
    LEFT JOIN public."Encounters" e ON b.id = e.bird_id
    LEFT JOIN public."Sessions" sess ON e.session_id = sess.id
    WHERE (from_date IS NULL OR sess.visit_date >=from_date)
     AND (to_date IS NULL OR sess.visit_date<=to_date)
     AND (species_name_filter IS NULL OR sp.species_name = species_name_filter)
  ),
  bird_stats AS (
    -- Calculate per-bird statistics once
    SELECT
      species_id,
      bird_id,
      COUNT(*) AS encounter_count,
      MIN(visit_date) AS first_visit,
      MAX(visit_date) AS last_visit,
      MIN(minimum_years) AS min_years_at_first,
      EXTRACT(EPOCH FROM (MAX(visit_date)::timestamp - MIN(visit_date)::timestamp)) / 86400.0 AS time_span_days
    FROM species_encounters
    WHERE encounter_id IS NOT NULL
    GROUP BY species_id, bird_id
  ),
  species_bird_aggregates AS (
    -- Aggregate bird-level stats to species level
    SELECT
      species_id,
      MAX(bird_stats.encounter_count) AS max_encounter_count,
      MAX(bird_stats.time_span_days) AS max_time_span,
      MAX(
        bird_stats.min_years_at_first +
        EXTRACT(YEAR FROM bird_stats.last_visit) -
        EXTRACT(YEAR FROM bird_stats.first_visit)
      ) AS max_proven_age
    FROM bird_stats
    GROUP BY species_id
  ),
  session_counts AS (
    -- Count encounters per session per species
    SELECT
      species_id,
      session_id,
      COUNT(*) AS encounter_count
    FROM species_encounters
    WHERE session_id IS NOT NULL
    GROUP BY species_id, session_id
  ),
  species_session_max AS (
    -- Get max encounters per session per species
    SELECT
      species_id,
      MAX(session_counts.encounter_count) AS max_per_session
    FROM session_counts
    GROUP BY species_id
  )
  SELECT
    se.species_name,
    COUNT(DISTINCT se.bird_id) AS "bird_count",
    COUNT(se.encounter_id) AS "encounter_count",
    COUNT(DISTINCT se.visit_date) AS "session_count",
    MAX(se.weight) AS "max_weight",
    ROUND(AVG(se.weight)::numeric, 1) AS "avg_weight",
    MIN(se.weight) AS "min_weight",
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY se.weight)::numeric, 1) AS "median_weight",
    MAX(se.wing_length) AS "max_wing",
    ROUND(AVG(se.wing_length)::numeric, 1) AS "avg_wing",
    MIN(se.wing_length) AS "min_wing",
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY se.wing_length)::numeric, 0) AS "median_wing",
    sba.max_encounter_count AS "max_encountered_bird",
    ROUND(
      100 * COUNT(DISTINCT CASE WHEN bs.encounter_count > 1 THEN se.bird_id END)::numeric /
      NULLIF(COUNT(DISTINCT se.bird_id), 0)::numeric,
      0
    ) AS "pct_retrapped",
    ROUND(sba.max_time_span, 0) AS "max_time_span",
    ssm.max_per_session AS "max_per_session",
    sba.max_proven_age AS "max_proven_age"
  FROM species_encounters se
  LEFT JOIN bird_stats bs ON se.bird_id = bs.bird_id
  LEFT JOIN species_bird_aggregates sba ON se.species_id = sba.species_id
  LEFT JOIN species_session_max ssm ON se.species_id = ssm.species_id
  GROUP BY se.species_name, sba.max_encounter_count, sba.max_time_span, ssm.max_per_session, sba.max_proven_age;

END;
$$;

ALTER FUNCTION "public"."species_stats" (
	"species_name_filter" "text",
	"from_date" "date",
	"to_date" "date"
) OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."species_stats" (
	"species_name_filter" "text",
	"from_date" "date",
	"to_date" "date"
) TO "anon";

GRANT ALL ON FUNCTION "public"."species_stats" (
	"species_name_filter" "text",
	"from_date" "date",
	"to_date" "date"
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."species_stats" (
	"species_name_filter" "text",
	"from_date" "date",
	"to_date" "date"
) TO "service_role";
