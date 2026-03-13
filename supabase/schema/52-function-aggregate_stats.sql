DROP FUNCTION IF EXISTS "public"."aggregate_stats" (
	"species_name_filter" "text",
	"from_date" "date",
	"to_date" "date",
	"ringing_group_filter" bigint,
	"group_by_species" boolean,
	"group_by_time_period" "text"
);

CREATE OR REPLACE FUNCTION "public"."aggregate_stats" (
	"species_name_filter" "text" DEFAULT NULL::"text",
	"from_date" "date" DEFAULT NULL::"date",
	"to_date" "date" DEFAULT NULL::"date",
	"ringing_group_filter" bigint DEFAULT NULL::bigint,
	"group_by_species" boolean DEFAULT FALSE,
	"group_by_time_period" "text" DEFAULT NULL::"text"
) RETURNS TABLE (
	"species_name" "text",
	"time_period" "date",
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
  WITH raw_encounters AS (
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
      e.max_hatch_year,
      date_trunc('month', sess.visit_date)::DATE AS session_month,
      date_trunc('year', sess.visit_date)::DATE AS session_year
    FROM public."Species" sp
    JOIN public."Birds" b ON sp.id = b.species_id
    LEFT JOIN public."Encounters" e ON b.id = e.bird_id
    LEFT JOIN public."Sessions" sess ON e.session_id = sess.id
    WHERE (from_date IS NULL OR sess.visit_date >=from_date)
     AND (to_date IS NULL OR sess.visit_date<=to_date)
     AND (species_name_filter IS NULL OR sp.species_name = species_name_filter)
     AND (ringing_group_filter IS NULL OR e.ringing_group_id = ringing_group_filter)
  ),
  stats_per_bird_month AS (
    -- Calculate per-bird statistics once
    SELECT
      re.species_id,
      re.bird_id,
      re.session_month,
      re.session_year,
      COUNT(*) AS encounter_count,
      MIN(re.visit_date) AS first_visit,
      MAX(re.visit_date) AS last_visit,
      MIN(re.max_hatch_year) AS min_max_hatch_year,
      EXTRACT(EPOCH FROM (MAX(re.visit_date)::timestamp - MIN(re.visit_date)::timestamp)) / 86400.0 AS time_span_days
    FROM raw_encounters re
    WHERE re.encounter_id IS NOT NULL
    GROUP BY re.species_id, re.bird_id, re.session_month, re.session_year
  ),
  aggregated_stats AS (
    -- Aggregate bird-level stats to species level
    SELECT
      CASE WHEN group_by_species THEN spbm.species_id ELSE NULL::bigint END AS species_id,
      CASE
        WHEN group_by_time_period = 'month' THEN spbm.session_month
        WHEN group_by_time_period = 'year' THEN spbm.session_year
        ELSE NULL::date
      END AS time_period,
      MAX(spbm.encounter_count) AS max_encounter_count,
      MAX(spbm.time_span_days) AS max_time_span,
      MAX(EXTRACT(YEAR FROM spbm.last_visit) - spbm.min_max_hatch_year) AS max_proven_age
    FROM stats_per_bird_month spbm
    GROUP BY CASE
      WHEN group_by_species THEN spbm.species_id
      ELSE NULL::bigint
    END, CASE
      WHEN group_by_time_period = 'month' THEN spbm.session_month
      WHEN group_by_time_period = 'year' THEN spbm.session_year
      ELSE NULL::date
    END
  ),
  session_counts AS (
    -- Count encounters per session per species
    SELECT
      re.species_id,
      re.session_id,
      date_trunc('month', re.visit_date)::DATE AS session_month,
      date_trunc('year', re.visit_date)::DATE AS session_year,
      COUNT(*) AS encounter_count
    FROM raw_encounters re
    WHERE re.session_id IS NOT NULL
    GROUP BY re.species_id, re.session_id, date_trunc('month', re.visit_date)::DATE, date_trunc('year', re.visit_date)::DATE
  ),
  aggregated_session_counts AS (
    -- Get max encounters per session per species
    SELECT
      CASE WHEN group_by_species THEN sc.species_id ELSE NULL::bigint END AS species_id,
      CASE
        WHEN group_by_time_period = 'month' THEN sc.session_month
        WHEN group_by_time_period = 'year' THEN sc.session_year
        ELSE NULL::date
      END AS time_period,
      MAX(sc.encounter_count) AS max_per_session
    FROM session_counts sc
    GROUP BY CASE
      WHEN group_by_species THEN sc.species_id
      ELSE NULL::bigint
    END, CASE
      WHEN group_by_time_period = 'month' THEN sc.session_month
      WHEN group_by_time_period = 'year' THEN sc.session_year
      ELSE NULL::date
    END
  )
  SELECT
    CASE WHEN group_by_species THEN raw_enc.species_name ELSE NULL::text END AS "species_name",
    CASE
      WHEN group_by_time_period = 'month' THEN raw_enc.session_month
      WHEN group_by_time_period = 'year' THEN raw_enc.session_year
    ELSE NULL::date END AS "time_period",
    COUNT(DISTINCT raw_enc.bird_id) AS "bird_count",
    COUNT(raw_enc.encounter_id) AS "encounter_count",
    COUNT(DISTINCT raw_enc.visit_date) AS "session_count",
    MAX(raw_enc.weight) AS "max_weight",
    ROUND(AVG(raw_enc.weight)::numeric, 1) AS "avg_weight",
    MIN(raw_enc.weight) AS "min_weight",
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY raw_enc.weight)::numeric, 1) AS "median_weight",
    MAX(raw_enc.wing_length) AS "max_wing",
    ROUND(AVG(raw_enc.wing_length)::numeric, 1) AS "avg_wing",
    MIN(raw_enc.wing_length) AS "min_wing",
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY raw_enc.wing_length)::numeric, 0) AS "median_wing",
    agg_sta.max_encounter_count AS "max_encountered_bird",
    ROUND(
      100 * COUNT(DISTINCT CASE WHEN bm_stats.encounter_count > 1 THEN raw_enc.bird_id END)::numeric /
      NULLIF(COUNT(DISTINCT raw_enc.bird_id), 0)::numeric,
      0
    ) AS "pct_retrapped",
    ROUND(agg_sta.max_time_span, 0) AS "max_time_span",
    agg_sess.max_per_session AS "max_per_session",
    agg_sta.max_proven_age AS "max_proven_age"
  FROM raw_encounters raw_enc
  LEFT JOIN stats_per_bird_month bm_stats ON raw_enc.bird_id = bm_stats.bird_id
  LEFT JOIN aggregated_stats agg_sta ON CASE WHEN group_by_species THEN raw_enc.species_id = agg_sta.species_id ELSE true END
  AND
  CASE
    WHEN group_by_time_period = 'month' THEN raw_enc.session_month = agg_sta.time_period
    WHEN group_by_time_period = 'year' THEN raw_enc.session_year = agg_sta.time_period
    ELSE true
  END
  LEFT JOIN aggregated_session_counts agg_sess ON CASE WHEN group_by_species THEN raw_enc.species_id = agg_sess.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'month' THEN raw_enc.session_month = agg_sess.time_period
    WHEN group_by_time_period = 'year' THEN raw_enc.session_year = agg_sess.time_period
    ELSE true
  END
  GROUP BY CASE
    WHEN group_by_species THEN raw_enc.species_id
    ELSE NULL::bigint
  END, CASE
    WHEN group_by_species THEN raw_enc.species_name
    ELSE NULL::text
  END,CASE
    WHEN group_by_time_period = 'month' THEN raw_enc.session_month
    WHEN group_by_time_period = 'year' THEN raw_enc.session_year
    ELSE NULL::date
  END, agg_sta.max_encounter_count, agg_sta.max_time_span, agg_sess.max_per_session, agg_sta.max_proven_age;

END;
$$;

ALTER FUNCTION "public"."aggregate_stats" (
	"species_name_filter" "text",
	"from_date" "date",
	"to_date" "date",
	"ringing_group_filter" bigint,
	"group_by_species" boolean,
	"group_by_time_period" "text"
) OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."aggregate_stats" (
	"species_name_filter" "text",
	"from_date" "date",
	"to_date" "date",
	"ringing_group_filter" bigint,
	"group_by_species" boolean,
	"group_by_time_period" "text"
) TO "anon";

GRANT ALL ON FUNCTION "public"."aggregate_stats" (
	"species_name_filter" "text",
	"from_date" "date",
	"to_date" "date",
	"ringing_group_filter" bigint,
	"group_by_species" boolean,
	"group_by_time_period" "text"
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."aggregate_stats" (
	"species_name_filter" "text",
	"from_date" "date",
	"to_date" "date",
	"ringing_group_filter" bigint,
	"group_by_species" boolean,
	"group_by_time_period" "text"
) TO "service_role";
