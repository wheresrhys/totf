


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "fuzzystrmatch" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."aggregate_stats_result" AS (
	"species_name" "text",
	"time_period" "date",
	"session_count" bigint,
	"total_effort" interval,
	"effort_per_session" interval,
	"effort_per_encounter" interval,
	"avg_encounters_per_session" numeric,
	"max_per_session" bigint,
	"species_count" bigint,
	"bird_count" bigint,
	"encounter_count" bigint,
	"new_bird_count" bigint,
	"pullus_bird_count" bigint,
	"juv_bird_count" bigint,
	"postjuv_bird_count" bigint,
	"adult_bird_count" bigint,
	"unknown_age_bird_count" bigint,
	"pullus_enc_count" bigint,
	"juv_enc_count" bigint,
	"postjuv_enc_count" bigint,
	"adult_enc_count" bigint,
	"unknown_age_enc_count" bigint,
	"max_new_per_session" bigint
);


ALTER TYPE "public"."aggregate_stats_result" OWNER TO "postgres";


CREATE TYPE "public"."arrivals_stats_result" AS (
	"species_name" "text",
	"time_period" "date",
	"new_adult_bird_count" bigint,
	"returning_adult_bird_count" bigint,
	"pullus_bird_count" bigint,
	"juv_bird_count" bigint,
	"postjuv_bird_count" bigint
);


ALTER TYPE "public"."arrivals_stats_result" OWNER TO "postgres";


CREATE TYPE "public"."biometrics_stats_result" AS (
	"species_name" "text",
	"time_period" "date",
	"max_weight" real,
	"avg_weight" numeric,
	"min_weight" real,
	"median_weight" numeric,
	"max_wing" smallint,
	"avg_wing" numeric,
	"min_wing" smallint,
	"median_wing" numeric
);


ALTER TYPE "public"."biometrics_stats_result" OWNER TO "postgres";


CREATE TYPE "public"."core_stats_result" AS (
	"species_name" "text",
	"time_period" "date",
	"session_count" bigint,
	"total_effort" interval,
	"effort_per_session" interval,
	"effort_per_encounter" interval,
	"avg_encounters_per_session" numeric,
	"max_per_session" bigint,
	"species_count" bigint,
	"bird_count" bigint,
	"encounter_count" bigint,
	"new_bird_count" bigint,
	"pullus_bird_count" bigint,
	"juv_bird_count" bigint,
	"postjuv_bird_count" bigint,
	"adult_bird_count" bigint,
	"unknown_age_bird_count" bigint,
	"pullus_enc_count" bigint,
	"juv_enc_count" bigint,
	"postjuv_enc_count" bigint,
	"adult_enc_count" bigint,
	"unknown_age_enc_count" bigint,
	"max_new_per_session" bigint
);


ALTER TYPE "public"."core_stats_result" OWNER TO "postgres";


CREATE TYPE "public"."demographics_stats_result" AS (
	"species_name" "text",
	"time_period" "date",
	"adult_bird_count" bigint,
	"juv_bird_count" bigint,
	"juv_enc_count" bigint,
	"postjuv_enc_count" bigint,
	"new_young_bird_count" bigint,
	"new_adult_bird_count" bigint,
	"first_summer_bird_count" bigint,
	"old_timers_bird_count" bigint,
	"postjuv_juv_enc_count" bigint,
	"new_postjuv_juv_enc_count" bigint,
	"new_postjuv_enc_count" bigint
);


ALTER TYPE "public"."demographics_stats_result" OWNER TO "postgres";


CREATE TYPE "public"."population_stats_result" AS (
	"species_name" "text",
	"time_period" "date",
	"adult_bird_count" bigint,
	"juv_bird_count" bigint,
	"juv_enc_count" bigint,
	"postjuv_enc_count" bigint,
	"new_young_bird_count" bigint,
	"new_adult_bird_count" bigint,
	"first_summer_bird_count" bigint,
	"postjuv_juv_enc_count" bigint,
	"new_postjuv_juv_enc_count" bigint,
	"new_postjuv_enc_count" bigint,
	"old_timers_bird_count" bigint
);


ALTER TYPE "public"."population_stats_result" OWNER TO "postgres";


CREATE TYPE "public"."ring_size" AS ENUM (
    'AA',
    'A',
    'A2',
    'B',
    'B+',
    'B2',
    'SO',
    'C',
    'C2',
    'CC',
    'D2',
    'E',
    'Fc',
    'Fv',
    'G',
    'H',
    'J',
    'K',
    'L',
    'L+',
    'MI',
    'MS'
);


ALTER TYPE "public"."ring_size" OWNER TO "postgres";


CREATE TYPE "public"."top_metrics_filter_params" AS (
	"month_filter" integer,
	"year_filter" integer,
	"exact_months_filter" "text"[],
	"months_filter" integer[],
	"species_filter" "text",
	"ringing_group_filter" bigint
);


ALTER TYPE "public"."top_metrics_filter_params" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."aggregate_stats"("species_name_filter" "text" DEFAULT NULL::"text", "from_date" "date" DEFAULT NULL::"date", "to_date" "date" DEFAULT NULL::"date", "ringing_group_filter" bigint DEFAULT NULL::bigint, "group_by_species" boolean DEFAULT false, "group_by_time_period" "text" DEFAULT NULL::"text") RETURNS SETOF "public"."aggregate_stats_result"
    LANGUAGE "plpgsql"
    AS $$
  BEGIN
  RETURN QUERY
  -- The final projection below is wrapped in jsonb_populate_record rather than
  -- returned as a bare positional SELECT, so it binds to aggregate_stats_result's
  -- columns by NAME instead of ordinal attribute position — see CLAUDE.md's
  -- "Composite-type RETURN QUERY binds by position, not name" section for why
  -- (confirmed empirically while building population_stats: two db:schema:apply
  -- runs on identical schema files produced two different physical attribute
  -- orders for the same composite type).
  SELECT (jsonb_populate_record(NULL::public.aggregate_stats_result, to_jsonb(agg))).*
  FROM (
  -- Base windowed row source and grouping-cell spine, delegated to the shared
  -- stats_raw_encounters / stats_spine utility RPCs (#800) so this logic isn't
  -- duplicated between aggregate_stats and population_stats. Each utility RPC is
  -- called exactly once here and materialized into a local CTE (reused by every
  -- downstream reference below), so the base tables aren't rescanned per use.
  WITH raw_encounters AS (
    SELECT * FROM public.stats_raw_encounters(species_name_filter, from_date, to_date, ringing_group_filter)
  ), spine AS (
    SELECT * FROM public.stats_spine(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ),
  stats_per_bird_month AS (
    -- Calculate per-bird statistics once
    SELECT
      re.species_id,
      re.bird_id,
      re.session_day,
      re.session_month,
      re.session_year,
      COUNT(*) AS encounter_count,
      MIN(re.visit_date) AS first_visit,
      MAX(re.visit_date) AS last_visit,
      MIN(re.max_hatch_year) AS min_max_hatch_year,
      EXTRACT(EPOCH FROM (MAX(re.visit_date)::timestamp - MIN(re.visit_date)::timestamp)) / 86400.0 AS time_span_days
    FROM raw_encounters re
    WHERE re.encounter_id IS NOT NULL
    GROUP BY re.species_id, re.bird_id, re.session_day, re.session_month, re.session_year
  ),
  -- Canonical per-encounter age classification and its bird-level bucket
  -- resolution, delegated to the shared stats_encounter_age_classification /
  -- stats_bird_age_bucket utility RPCs (#800) — see those files for the bucket
  -- definitions and bird-level precedence rules (pullus always wins; otherwise
  -- juv wins over postjuv), which mirror the single-encounter age classes
  -- defined in TypeScript by getAgeClass() (app/models/encounter.ts, #527) — keep
  -- the two in sync by hand.
  encounter_age_classification AS (
    SELECT * FROM public.stats_encounter_age_classification(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ),
  bird_age_bucket AS (
    SELECT * FROM public.stats_bird_age_bucket(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ),
  age_bucket_counts AS (
    SELECT
      bab.species_id,
      bab.time_period,
      COUNT(*) FILTER (WHERE bab.age_bucket = 'pullus') AS pullus_count,
      COUNT(*) FILTER (WHERE bab.age_bucket = 'juv') AS juv_count,
      COUNT(*) FILTER (WHERE bab.age_bucket = 'postjuv') AS postjuv_count,
      COUNT(*) FILTER (WHERE bab.age_bucket = 'adult') AS adult_count,
      COUNT(*) FILTER (WHERE bab.age_bucket = 'unknown') AS unknown_age_count
    FROM bird_age_bucket bab
    GROUP BY bab.species_id, bab.time_period
  ),
  -- Per-encounter age-bucket counts — the encounter-level cut, reading the canonical
  -- encounter_age_classification directly with no bird-level dedup or precedence. A
  -- retrapped-then-recaught bird whose encounters span different ages is counted once in
  -- each encounter's bucket here, unlike the bird-level buckets (age_bucket_counts) which
  -- resolve it to a single bucket.
  encounter_age_bucket_counts AS (
    SELECT
      eac.species_id,
      eac.time_period,
      COUNT(*) FILTER (WHERE eac.age_bucket = 'pullus') AS pullus_enc_count,
      COUNT(*) FILTER (WHERE eac.age_bucket = 'juv') AS juv_enc_count,
      COUNT(*) FILTER (WHERE eac.age_bucket = 'postjuv') AS postjuv_enc_count,
      COUNT(*) FILTER (WHERE eac.age_bucket = 'adult') AS adult_enc_count,
      COUNT(*) FILTER (WHERE eac.age_bucket = 'unknown') AS unknown_age_enc_count
    FROM encounter_age_classification eac
    GROUP BY eac.species_id, eac.time_period
  ),
  stats_per_species_period AS (
    -- Aggregate bird-level stats to species level
    SELECT
      CASE WHEN group_by_species THEN spbm.species_id ELSE NULL::bigint END AS species_id,
      CASE
        WHEN group_by_time_period = 'day' THEN spbm.session_day
        WHEN group_by_time_period = 'month' THEN spbm.session_month
        WHEN group_by_time_period = 'year' THEN spbm.session_year
        ELSE NULL::date
      END AS time_period,
      MAX(spbm.encounter_count) AS max_encounter_count,
      MAX(spbm.time_span_days) AS max_time_span_days,
      MAX(EXTRACT(YEAR FROM spbm.last_visit) - spbm.min_max_hatch_year) AS max_proven_age
    FROM stats_per_bird_month spbm
    GROUP BY CASE
      WHEN group_by_species THEN spbm.species_id
      ELSE NULL::bigint
    END, CASE
      WHEN group_by_time_period = 'day' THEN spbm.session_day
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
      date_trunc('day', re.visit_date)::DATE AS session_day,
      date_trunc('month', re.visit_date)::DATE AS session_month,
      date_trunc('year', re.visit_date)::DATE AS session_year,
      COUNT(*) AS encounter_count,
      COUNT(CASE WHEN re.record_type = 'N' THEN 1 END) AS new_encounter_count
    FROM raw_encounters re
    WHERE re.session_id IS NOT NULL
      AND re.session_type = 'FULL_GROWN'
    GROUP BY re.species_id, re.session_id, date_trunc('day', re.visit_date)::DATE, date_trunc('month', re.visit_date)::DATE, date_trunc('year', re.visit_date)::DATE
  ),
  aggregated_session_counts AS (
    -- Get max encounters per session per species
    SELECT
      CASE WHEN group_by_species THEN sc.species_id ELSE NULL::bigint END AS species_id,
      CASE
        WHEN group_by_time_period = 'day' THEN sc.session_day
        WHEN group_by_time_period = 'month' THEN sc.session_month
        WHEN group_by_time_period = 'year' THEN sc.session_year
        ELSE NULL::date
      END AS time_period,
      MAX(sc.encounter_count) AS max_per_session,
      MAX(sc.new_encounter_count) AS max_new_per_session,
      AVG(sc.encounter_count) AS avg_encounters_per_session
    FROM session_counts sc
    GROUP BY CASE
      WHEN group_by_species THEN sc.species_id
      ELSE NULL::bigint
    END, CASE
      WHEN group_by_time_period = 'day' THEN sc.session_day
      WHEN group_by_time_period = 'month' THEN sc.session_month
      WHEN group_by_time_period = 'year' THEN sc.session_year
      ELSE NULL::date
    END
  ), session_effort AS (
    SELECT
      re.session_id,
      -- realistically the minimum effort per session is 2 hours
      GREATEST(MAX(re.capture_time) - MIN(re.capture_time), '02:00:00'::interval) AS total_effort
    FROM raw_encounters re
    WHERE re.session_type = 'FULL_GROWN'
    GROUP BY re.session_id
  ), effort_per_period AS (
    SELECT
      CASE
        WHEN group_by_time_period = 'day' THEN re.session_day
        WHEN group_by_time_period = 'month' THEN re.session_month
        WHEN group_by_time_period = 'year' THEN re.session_year
        ELSE NULL::date
      END AS time_period,
      SUM(sess_effort.total_effort) AS total_effort,
      SUM(sess_effort.total_effort) / COUNT(DISTINCT re.session_id) AS effort_per_session
    FROM (
      SELECT DISTINCT re.session_id,
            date_trunc('day', re.visit_date)::DATE AS session_day,
            date_trunc('month', re.visit_date)::DATE AS session_month,
            date_trunc('year', re.visit_date)::DATE AS session_year
      FROM raw_encounters as re
    ) re
    JOIN session_effort sess_effort ON re.session_id = sess_effort.session_id
    GROUP BY
      CASE
        WHEN group_by_time_period = 'day' THEN re.session_day
        WHEN group_by_time_period = 'month' THEN re.session_month
        WHEN group_by_time_period = 'year' THEN re.session_year
        ELSE NULL::date
      END
  )
  SELECT

	  CASE WHEN group_by_species THEN spine.species_name ELSE NULL::text END AS "species_name",
    CASE
      WHEN group_by_time_period = 'day' THEN spine.time_period
      WHEN group_by_time_period = 'month' THEN spine.time_period
      WHEN group_by_time_period = 'year' THEN spine.time_period
    ELSE NULL::date END AS "time_period",

    COALESCE(COUNT(DISTINCT CASE WHEN raw_enc.session_type = 'FULL_GROWN' THEN raw_enc.visit_date END), 0) AS "session_count",
    COALESCE(effort.total_effort, '00:00:00'::interval) AS "total_effort",
    COALESCE(effort.effort_per_session, '00:00:00'::interval) AS "effort_per_session",
    COALESCE(effort.total_effort / NULLIF(COUNT(DISTINCT raw_enc.encounter_id), 0), '00:00:00'::interval) AS "effort_per_encounter",
    COALESCE(agg_sess.avg_encounters_per_session, 0) AS "avg_encounters_per_session",
    COALESCE(agg_sess.max_per_session, 0) AS "max_per_session",

    COALESCE(COUNT(DISTINCT raw_enc.species_id), 0) AS "species_count",
    COALESCE(COUNT(DISTINCT raw_enc.bird_id), 0) AS "bird_count",
    COALESCE(COUNT(DISTINCT raw_enc.encounter_id), 0) AS "encounter_count",

    COALESCE(COUNT(DISTINCT CASE WHEN raw_enc.record_type = 'N' THEN raw_enc.bird_id END), 0) AS "new_bird_count",

    -- Corrected bird-level age buckets (see bird_age_flags / bird_age_bucket above).
    -- pullus + juv + postjuv + adult + unknown_age = bird_count for every row. new_bird_count
    -- already carries an unambiguous suffix, so it gets no *_bird_count duplicate here.
    COALESCE(abc.pullus_count, 0) AS "pullus_bird_count",
    COALESCE(abc.juv_count, 0) AS "juv_bird_count",
    COALESCE(abc.postjuv_count, 0) AS "postjuv_bird_count",
    COALESCE(abc.adult_count, 0) AS "adult_bird_count",
    COALESCE(abc.unknown_age_count, 0) AS "unknown_age_bird_count",

    -- Per-encounter age buckets (see encounter_age_classification above). No new_enc_count /
    -- new_young_enc_count: record_type 'N' occurs at most once per bird, so the New (and
    -- New-young) encounter-level and bird-level views coincide by construction.
    COALESCE(eabc.pullus_enc_count, 0) AS "pullus_enc_count",
    COALESCE(eabc.juv_enc_count, 0) AS "juv_enc_count",
    COALESCE(eabc.postjuv_enc_count, 0) AS "postjuv_enc_count",
    COALESCE(eabc.adult_enc_count, 0) AS "adult_enc_count",
    COALESCE(eabc.unknown_age_enc_count, 0) AS "unknown_age_enc_count",

    COALESCE(agg_sess.max_new_per_session, 0) AS "max_new_per_session"

    -- agg_sta.max_encounter_count AS "max_encountered_bird",
    -- ROUND(
    --   100 * COUNT(DISTINCT CASE WHEN bm_stats.encounter_count > 1 THEN raw_enc.bird_id END)::numeric /
    --   NULLIF(COUNT(DISTINCT raw_enc.bird_id), 0)::numeric,
    --   0
    -- ) AS "pct_retrapped",
    -- ROUND(agg_sta.max_time_span_days, 0) AS "max_time_span_days",
    -- agg_sta.max_proven_age AS "max_proven_age"



  FROM spine
  LEFT JOIN raw_encounters raw_enc ON
  (NOT group_by_species OR spine.species_id = raw_enc.species_id)
  AND (
    (group_by_time_period = 'day' AND spine.time_period = raw_enc.session_day)
    OR (group_by_time_period = 'month' AND spine.time_period = raw_enc.session_month)
    OR (group_by_time_period = 'year' AND spine.time_period = raw_enc.session_year)
    OR (group_by_time_period IS NULL OR group_by_time_period NOT IN ('month', 'year', 'day'))
  )
  -- LEFT JOIN stats_per_bird_month bm_stats ON raw_enc.bird_id = bm_stats.bird_id
  LEFT JOIN effort_per_period effort ON
  CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = effort.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = effort.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = effort.time_period
    ELSE true
  END
  LEFT JOIN stats_per_species_period agg_sta ON CASE WHEN group_by_species THEN spine.species_id = agg_sta.species_id ELSE true END
  AND
  CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = agg_sta.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = agg_sta.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = agg_sta.time_period
    ELSE true
  END
  LEFT JOIN aggregated_session_counts agg_sess ON CASE WHEN group_by_species THEN spine.species_id = agg_sess.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = agg_sess.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = agg_sess.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = agg_sess.time_period
    ELSE true
  END
  LEFT JOIN age_bucket_counts abc ON CASE WHEN group_by_species THEN spine.species_id = abc.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = abc.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = abc.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = abc.time_period
    ELSE true
  END
  LEFT JOIN encounter_age_bucket_counts eabc ON CASE WHEN group_by_species THEN spine.species_id = eabc.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = eabc.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = eabc.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = eabc.time_period
    ELSE true
  END
  GROUP BY CASE
    WHEN group_by_species THEN spine.species_id
    ELSE NULL::bigint
  END, CASE
    WHEN group_by_species THEN spine.species_name
    ELSE NULL::text
  END,CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period
    ELSE NULL::date
  END, agg_sta.max_encounter_count, agg_sess.max_per_session,
  -- agg_sta.max_proven_age, agg_sta.max_time_span_days,
  agg_sess.max_new_per_session, effort.total_effort, effort.effort_per_session, agg_sess.avg_encounters_per_session,
  abc.pullus_count, abc.juv_count, abc.postjuv_count, abc.adult_count, abc.unknown_age_count,
  eabc.pullus_enc_count, eabc.juv_enc_count, eabc.postjuv_enc_count, eabc.adult_enc_count, eabc.unknown_age_enc_count
  ) AS agg
  ORDER BY agg.species_name ASC, agg.time_period ASC;

END;
$$;


ALTER FUNCTION "public"."aggregate_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arrivals_stats"("species_name_filter" "text" DEFAULT NULL::"text", "from_date" "date" DEFAULT NULL::"date", "to_date" "date" DEFAULT NULL::"date", "ringing_group_filter" bigint DEFAULT NULL::bigint, "group_by_species" boolean DEFAULT false, "group_by_time_period" "text" DEFAULT NULL::"text") RETURNS SETOF "public"."arrivals_stats_result"
    LANGUAGE "plpgsql"
    AS $$
  BEGIN
  RETURN QUERY
  SELECT (jsonb_populate_record(NULL::public.arrivals_stats_result, to_jsonb(agg))).*
  FROM (
  WITH spine AS (
    SELECT * FROM public.stats_spine(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ), bird_first_encounter_of_year AS (
    SELECT * FROM public.stats_bird_first_encounter_of_year(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ),
  -- One count per arrival bucket per cell. Buckets are mutually exclusive and
  -- exhaustive over the rows above (which already exclude 'unknown'), so the five
  -- counts sum to the cell's distinct-arriving-bird-year count.
  arrival_bucket_counts AS (
    SELECT
      bfe.species_id,
      bfe.time_period,
      COUNT(*) FILTER (WHERE bfe.arrival_bucket = 'new_adult') AS new_adult_bird_count,
      COUNT(*) FILTER (WHERE bfe.arrival_bucket = 'returning_adult') AS returning_adult_bird_count,
      COUNT(*) FILTER (WHERE bfe.arrival_bucket = 'pullus') AS pullus_bird_count,
      COUNT(*) FILTER (WHERE bfe.arrival_bucket = 'juv') AS juv_bird_count,
      COUNT(*) FILTER (WHERE bfe.arrival_bucket = 'postjuv') AS postjuv_bird_count
    FROM bird_first_encounter_of_year bfe
    GROUP BY bfe.species_id, bfe.time_period
  )
  SELECT
    CASE WHEN group_by_species THEN spine.species_name ELSE NULL::text END AS "species_name",
    CASE
      WHEN group_by_time_period = 'day' THEN spine.time_period
      WHEN group_by_time_period = 'month' THEN spine.time_period
      WHEN group_by_time_period = 'year' THEN spine.time_period
      ELSE NULL::date
    END AS "time_period",

    COALESCE(abc.new_adult_bird_count, 0) AS "new_adult_bird_count",
    COALESCE(abc.returning_adult_bird_count, 0) AS "returning_adult_bird_count",
    COALESCE(abc.pullus_bird_count, 0) AS "pullus_bird_count",
    COALESCE(abc.juv_bird_count, 0) AS "juv_bird_count",
    COALESCE(abc.postjuv_bird_count, 0) AS "postjuv_bird_count"

  FROM spine
  LEFT JOIN arrival_bucket_counts abc ON CASE WHEN group_by_species THEN spine.species_id = abc.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = abc.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = abc.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = abc.time_period
    ELSE true
  END
  ) AS agg
  ORDER BY agg.species_name ASC, agg.time_period ASC;

END;
$$;


ALTER FUNCTION "public"."arrivals_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."biometrics_stats"("species_name_filter" "text" DEFAULT NULL::"text", "from_date" "date" DEFAULT NULL::"date", "to_date" "date" DEFAULT NULL::"date", "ringing_group_filter" bigint DEFAULT NULL::bigint, "group_by_species" boolean DEFAULT false, "group_by_time_period" "text" DEFAULT NULL::"text") RETURNS SETOF "public"."biometrics_stats_result"
    LANGUAGE "plpgsql"
    AS $$
  BEGIN
  RETURN QUERY
  SELECT (jsonb_populate_record(NULL::public.biometrics_stats_result, to_jsonb(agg))).*
  FROM (
  WITH raw_encounters AS (
    SELECT * FROM public.stats_raw_encounters(species_name_filter, from_date, to_date, ringing_group_filter)
  ), spine AS (
    SELECT * FROM public.stats_spine(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  )
  SELECT
    CASE WHEN group_by_species THEN spine.species_name ELSE NULL::text END AS "species_name",
    CASE
      WHEN group_by_time_period = 'day' THEN spine.time_period
      WHEN group_by_time_period = 'month' THEN spine.time_period
      WHEN group_by_time_period = 'year' THEN spine.time_period
      ELSE NULL::date
    END AS "time_period",

    MAX(raw_enc.weight) AS "max_weight",
    ROUND(AVG(raw_enc.weight)::numeric, 1) AS "avg_weight",
    MIN(raw_enc.weight) AS "min_weight",
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY raw_enc.weight)::numeric, 1) AS "median_weight",

    MAX(raw_enc.wing_length) AS "max_wing",
    ROUND(AVG(raw_enc.wing_length)::numeric, 1) AS "avg_wing",
    MIN(raw_enc.wing_length) AS "min_wing",
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY raw_enc.wing_length)::numeric, 0) AS "median_wing"

  FROM spine
  LEFT JOIN raw_encounters raw_enc ON
  (NOT group_by_species OR spine.species_id = raw_enc.species_id)
  AND (
    (group_by_time_period = 'day' AND spine.time_period = raw_enc.session_day)
    OR (group_by_time_period = 'month' AND spine.time_period = raw_enc.session_month)
    OR (group_by_time_period = 'year' AND spine.time_period = raw_enc.session_year)
    OR (group_by_time_period IS NULL OR group_by_time_period NOT IN ('month', 'year', 'day'))
  )
  GROUP BY CASE
    WHEN group_by_species THEN spine.species_id
    ELSE NULL::bigint
  END, CASE
    WHEN group_by_species THEN spine.species_name
    ELSE NULL::text
  END, CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period
    ELSE NULL::date
  END
  ) AS agg
  ORDER BY agg.species_name ASC, agg.time_period ASC;

END;
$$;


ALTER FUNCTION "public"."biometrics_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."core_stats"("species_name_filter" "text" DEFAULT NULL::"text", "from_date" "date" DEFAULT NULL::"date", "to_date" "date" DEFAULT NULL::"date", "ringing_group_filter" bigint DEFAULT NULL::bigint, "group_by_species" boolean DEFAULT false, "group_by_time_period" "text" DEFAULT NULL::"text") RETURNS SETOF "public"."core_stats_result"
    LANGUAGE "plpgsql"
    AS $$
  BEGIN
  RETURN QUERY
  -- The final projection below is wrapped in jsonb_populate_record rather than
  -- returned as a bare positional SELECT, so it binds to core_stats_result's
  -- columns by NAME instead of ordinal attribute position — see CLAUDE.md's
  -- "Composite-type RETURN QUERY binds by position, not name" section for why
  -- (confirmed empirically while building population_stats: two db:schema:apply
  -- runs on identical schema files produced two different physical attribute
  -- orders for the same composite type).
  SELECT (jsonb_populate_record(NULL::public.core_stats_result, to_jsonb(agg))).*
  FROM (
  -- Base windowed row source and grouping-cell spine, delegated to the shared
  -- stats_raw_encounters / stats_spine utility RPCs (#800) so this logic isn't
  -- duplicated between aggregate_stats and population_stats. Each utility RPC is
  -- called exactly once here and materialized into a local CTE (reused by every
  -- downstream reference below), so the base tables aren't rescanned per use.
  WITH raw_encounters AS (
    SELECT * FROM public.stats_raw_encounters(species_name_filter, from_date, to_date, ringing_group_filter)
  ), spine AS (
    SELECT * FROM public.stats_spine(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ),
  stats_per_bird_month AS (
    -- Calculate per-bird statistics once
    SELECT
      re.species_id,
      re.bird_id,
      re.session_day,
      re.session_month,
      re.session_year,
      COUNT(*) AS encounter_count,
      MIN(re.visit_date) AS first_visit,
      MAX(re.visit_date) AS last_visit,
      MIN(re.max_hatch_year) AS min_max_hatch_year,
      EXTRACT(EPOCH FROM (MAX(re.visit_date)::timestamp - MIN(re.visit_date)::timestamp)) / 86400.0 AS time_span_days
    FROM raw_encounters re
    WHERE re.encounter_id IS NOT NULL
    GROUP BY re.species_id, re.bird_id, re.session_day, re.session_month, re.session_year
  ),
  -- Canonical per-encounter age classification and its bird-level bucket
  -- resolution, delegated to the shared stats_encounter_age_classification /
  -- stats_bird_age_bucket utility RPCs (#800) — see those files for the bucket
  -- definitions and bird-level precedence rules (pullus always wins; otherwise
  -- juv wins over postjuv), which mirror the single-encounter age classes
  -- defined in TypeScript by getAgeClass() (app/models/encounter.ts, #527) — keep
  -- the two in sync by hand.
  encounter_age_classification AS (
    SELECT * FROM public.stats_encounter_age_classification(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ),
  bird_age_bucket AS (
    SELECT * FROM public.stats_bird_age_bucket(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ),
  age_bucket_counts AS (
    SELECT
      bab.species_id,
      bab.time_period,
      COUNT(*) FILTER (WHERE bab.age_bucket = 'pullus') AS pullus_count,
      COUNT(*) FILTER (WHERE bab.age_bucket = 'juv') AS juv_count,
      COUNT(*) FILTER (WHERE bab.age_bucket = 'postjuv') AS postjuv_count,
      COUNT(*) FILTER (WHERE bab.age_bucket = 'adult') AS adult_count,
      COUNT(*) FILTER (WHERE bab.age_bucket = 'unknown') AS unknown_age_count
    FROM bird_age_bucket bab
    GROUP BY bab.species_id, bab.time_period
  ),
  -- Per-encounter age-bucket counts — the encounter-level cut, reading the canonical
  -- encounter_age_classification directly with no bird-level dedup or precedence. A
  -- retrapped-then-recaught bird whose encounters span different ages is counted once in
  -- each encounter's bucket here, unlike the bird-level buckets (age_bucket_counts) which
  -- resolve it to a single bucket.
  encounter_age_bucket_counts AS (
    SELECT
      eac.species_id,
      eac.time_period,
      COUNT(*) FILTER (WHERE eac.age_bucket = 'pullus') AS pullus_enc_count,
      COUNT(*) FILTER (WHERE eac.age_bucket = 'juv') AS juv_enc_count,
      COUNT(*) FILTER (WHERE eac.age_bucket = 'postjuv') AS postjuv_enc_count,
      COUNT(*) FILTER (WHERE eac.age_bucket = 'adult') AS adult_enc_count,
      COUNT(*) FILTER (WHERE eac.age_bucket = 'unknown') AS unknown_age_enc_count
    FROM encounter_age_classification eac
    GROUP BY eac.species_id, eac.time_period
  ),
  stats_per_species_period AS (
    -- Aggregate bird-level stats to species level
    SELECT
      CASE WHEN group_by_species THEN spbm.species_id ELSE NULL::bigint END AS species_id,
      CASE
        WHEN group_by_time_period = 'day' THEN spbm.session_day
        WHEN group_by_time_period = 'month' THEN spbm.session_month
        WHEN group_by_time_period = 'year' THEN spbm.session_year
        ELSE NULL::date
      END AS time_period,
      MAX(spbm.encounter_count) AS max_encounter_count,
      MAX(spbm.time_span_days) AS max_time_span_days,
      MAX(EXTRACT(YEAR FROM spbm.last_visit) - spbm.min_max_hatch_year) AS max_proven_age
    FROM stats_per_bird_month spbm
    GROUP BY CASE
      WHEN group_by_species THEN spbm.species_id
      ELSE NULL::bigint
    END, CASE
      WHEN group_by_time_period = 'day' THEN spbm.session_day
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
      date_trunc('day', re.visit_date)::DATE AS session_day,
      date_trunc('month', re.visit_date)::DATE AS session_month,
      date_trunc('year', re.visit_date)::DATE AS session_year,
      COUNT(*) AS encounter_count,
      COUNT(CASE WHEN re.record_type = 'N' THEN 1 END) AS new_encounter_count
    FROM raw_encounters re
    WHERE re.session_id IS NOT NULL
      AND re.session_type = 'FULL_GROWN'
    GROUP BY re.species_id, re.session_id, date_trunc('day', re.visit_date)::DATE, date_trunc('month', re.visit_date)::DATE, date_trunc('year', re.visit_date)::DATE
  ),
  aggregated_session_counts AS (
    -- Get max encounters per session per species
    SELECT
      CASE WHEN group_by_species THEN sc.species_id ELSE NULL::bigint END AS species_id,
      CASE
        WHEN group_by_time_period = 'day' THEN sc.session_day
        WHEN group_by_time_period = 'month' THEN sc.session_month
        WHEN group_by_time_period = 'year' THEN sc.session_year
        ELSE NULL::date
      END AS time_period,
      MAX(sc.encounter_count) AS max_per_session,
      MAX(sc.new_encounter_count) AS max_new_per_session,
      AVG(sc.encounter_count) AS avg_encounters_per_session
    FROM session_counts sc
    GROUP BY CASE
      WHEN group_by_species THEN sc.species_id
      ELSE NULL::bigint
    END, CASE
      WHEN group_by_time_period = 'day' THEN sc.session_day
      WHEN group_by_time_period = 'month' THEN sc.session_month
      WHEN group_by_time_period = 'year' THEN sc.session_year
      ELSE NULL::date
    END
  ), session_effort AS (
    SELECT
      re.session_id,
      -- realistically the minimum effort per session is 2 hours
      GREATEST(MAX(re.capture_time) - MIN(re.capture_time), '02:00:00'::interval) AS total_effort
    FROM raw_encounters re
    WHERE re.session_type = 'FULL_GROWN'
    GROUP BY re.session_id
  ), effort_per_period AS (
    SELECT
      CASE
        WHEN group_by_time_period = 'day' THEN re.session_day
        WHEN group_by_time_period = 'month' THEN re.session_month
        WHEN group_by_time_period = 'year' THEN re.session_year
        ELSE NULL::date
      END AS time_period,
      SUM(sess_effort.total_effort) AS total_effort,
      SUM(sess_effort.total_effort) / COUNT(DISTINCT re.session_id) AS effort_per_session
    FROM (
      SELECT DISTINCT re.session_id,
            date_trunc('day', re.visit_date)::DATE AS session_day,
            date_trunc('month', re.visit_date)::DATE AS session_month,
            date_trunc('year', re.visit_date)::DATE AS session_year
      FROM raw_encounters as re
    ) re
    JOIN session_effort sess_effort ON re.session_id = sess_effort.session_id
    GROUP BY
      CASE
        WHEN group_by_time_period = 'day' THEN re.session_day
        WHEN group_by_time_period = 'month' THEN re.session_month
        WHEN group_by_time_period = 'year' THEN re.session_year
        ELSE NULL::date
      END
  )
  SELECT

	  CASE WHEN group_by_species THEN spine.species_name ELSE NULL::text END AS "species_name",
    CASE
      WHEN group_by_time_period = 'day' THEN spine.time_period
      WHEN group_by_time_period = 'month' THEN spine.time_period
      WHEN group_by_time_period = 'year' THEN spine.time_period
    ELSE NULL::date END AS "time_period",

    COALESCE(COUNT(DISTINCT CASE WHEN raw_enc.session_type = 'FULL_GROWN' THEN raw_enc.visit_date END), 0) AS "session_count",
    COALESCE(effort.total_effort, '00:00:00'::interval) AS "total_effort",
    COALESCE(effort.effort_per_session, '00:00:00'::interval) AS "effort_per_session",
    COALESCE(effort.total_effort / NULLIF(COUNT(DISTINCT raw_enc.encounter_id), 0), '00:00:00'::interval) AS "effort_per_encounter",
    COALESCE(agg_sess.avg_encounters_per_session, 0) AS "avg_encounters_per_session",
    COALESCE(agg_sess.max_per_session, 0) AS "max_per_session",

    COALESCE(COUNT(DISTINCT raw_enc.species_id), 0) AS "species_count",
    COALESCE(COUNT(DISTINCT raw_enc.bird_id), 0) AS "bird_count",
    COALESCE(COUNT(DISTINCT raw_enc.encounter_id), 0) AS "encounter_count",

    COALESCE(COUNT(DISTINCT CASE WHEN raw_enc.record_type = 'N' THEN raw_enc.bird_id END), 0) AS "new_bird_count",

    -- Corrected bird-level age buckets (see bird_age_flags / bird_age_bucket above).
    -- pullus + juv + postjuv + adult + unknown_age = bird_count for every row. new_bird_count
    -- already carries an unambiguous suffix, so it gets no *_bird_count duplicate here.
    COALESCE(abc.pullus_count, 0) AS "pullus_bird_count",
    COALESCE(abc.juv_count, 0) AS "juv_bird_count",
    COALESCE(abc.postjuv_count, 0) AS "postjuv_bird_count",
    COALESCE(abc.adult_count, 0) AS "adult_bird_count",
    COALESCE(abc.unknown_age_count, 0) AS "unknown_age_bird_count",

    -- Per-encounter age buckets (see encounter_age_classification above). No new_enc_count /
    -- new_young_enc_count: record_type 'N' occurs at most once per bird, so the New (and
    -- New-young) encounter-level and bird-level views coincide by construction.
    COALESCE(eabc.pullus_enc_count, 0) AS "pullus_enc_count",
    COALESCE(eabc.juv_enc_count, 0) AS "juv_enc_count",
    COALESCE(eabc.postjuv_enc_count, 0) AS "postjuv_enc_count",
    COALESCE(eabc.adult_enc_count, 0) AS "adult_enc_count",
    COALESCE(eabc.unknown_age_enc_count, 0) AS "unknown_age_enc_count",

    COALESCE(agg_sess.max_new_per_session, 0) AS "max_new_per_session"

    -- agg_sta.max_encounter_count AS "max_encountered_bird",
    -- ROUND(
    --   100 * COUNT(DISTINCT CASE WHEN bm_stats.encounter_count > 1 THEN raw_enc.bird_id END)::numeric /
    --   NULLIF(COUNT(DISTINCT raw_enc.bird_id), 0)::numeric,
    --   0
    -- ) AS "pct_retrapped",
    -- ROUND(agg_sta.max_time_span_days, 0) AS "max_time_span_days",
    -- agg_sta.max_proven_age AS "max_proven_age"



  FROM spine
  LEFT JOIN raw_encounters raw_enc ON
  (NOT group_by_species OR spine.species_id = raw_enc.species_id)
  AND (
    (group_by_time_period = 'day' AND spine.time_period = raw_enc.session_day)
    OR (group_by_time_period = 'month' AND spine.time_period = raw_enc.session_month)
    OR (group_by_time_period = 'year' AND spine.time_period = raw_enc.session_year)
    OR (group_by_time_period IS NULL OR group_by_time_period NOT IN ('month', 'year', 'day'))
  )
  -- LEFT JOIN stats_per_bird_month bm_stats ON raw_enc.bird_id = bm_stats.bird_id
  LEFT JOIN effort_per_period effort ON
  CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = effort.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = effort.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = effort.time_period
    ELSE true
  END
  LEFT JOIN stats_per_species_period agg_sta ON CASE WHEN group_by_species THEN spine.species_id = agg_sta.species_id ELSE true END
  AND
  CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = agg_sta.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = agg_sta.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = agg_sta.time_period
    ELSE true
  END
  LEFT JOIN aggregated_session_counts agg_sess ON CASE WHEN group_by_species THEN spine.species_id = agg_sess.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = agg_sess.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = agg_sess.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = agg_sess.time_period
    ELSE true
  END
  LEFT JOIN age_bucket_counts abc ON CASE WHEN group_by_species THEN spine.species_id = abc.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = abc.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = abc.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = abc.time_period
    ELSE true
  END
  LEFT JOIN encounter_age_bucket_counts eabc ON CASE WHEN group_by_species THEN spine.species_id = eabc.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = eabc.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = eabc.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = eabc.time_period
    ELSE true
  END
  GROUP BY CASE
    WHEN group_by_species THEN spine.species_id
    ELSE NULL::bigint
  END, CASE
    WHEN group_by_species THEN spine.species_name
    ELSE NULL::text
  END,CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period
    ELSE NULL::date
  END, agg_sta.max_encounter_count, agg_sess.max_per_session,
  -- agg_sta.max_proven_age, agg_sta.max_time_span_days,
  agg_sess.max_new_per_session, effort.total_effort, effort.effort_per_session, agg_sess.avg_encounters_per_session,
  abc.pullus_count, abc.juv_count, abc.postjuv_count, abc.adult_count, abc.unknown_age_count,
  eabc.pullus_enc_count, eabc.juv_enc_count, eabc.postjuv_enc_count, eabc.adult_enc_count, eabc.unknown_age_enc_count
  ) AS agg
  ORDER BY agg.species_name ASC, agg.time_period ASC;

END;
$$;


ALTER FUNCTION "public"."core_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."demographics_stats"("species_name_filter" "text" DEFAULT NULL::"text", "from_date" "date" DEFAULT NULL::"date", "to_date" "date" DEFAULT NULL::"date", "ringing_group_filter" bigint DEFAULT NULL::bigint, "group_by_species" boolean DEFAULT false, "group_by_time_period" "text" DEFAULT NULL::"text") RETURNS SETOF "public"."demographics_stats_result"
    LANGUAGE "plpgsql"
    AS $$
  BEGIN
  RETURN QUERY
  SELECT (jsonb_populate_record(NULL::public.demographics_stats_result, to_jsonb(agg))).*
  FROM (
  WITH spine AS (
    SELECT * FROM public.stats_spine(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ), encounter_age_classification AS (
    SELECT * FROM public.stats_encounter_age_classification(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ), bird_age_bucket AS (
    SELECT * FROM public.stats_bird_age_bucket(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ),
  -- Bird-level bucket counts (context columns + the new_young_bird_count copy).
  -- Mirrors aggregate_stats' age_bucket_counts, restricted to the columns this RPC
  -- exposes.
  age_bucket_counts AS (
    SELECT
      bab.species_id,
      bab.time_period,
      COUNT(*) FILTER (WHERE bab.age_bucket = 'juv') AS juv_count,
      COUNT(*) FILTER (WHERE bab.age_bucket = 'adult') AS adult_count,
      -- New young bird: in a young bucket (pullus/juv/postjuv) AND has any New ('N')
      -- encounter in the cell. Bucket membership and New membership are checked
      -- independently — not required to be the same encounter row. Identical
      -- derivation to aggregate_stats.new_young_bird_count.
      COUNT(*) FILTER (
        WHERE bab.age_bucket IN ('pullus', 'juv', 'postjuv') AND bab.has_new
      ) AS new_young_count
    FROM bird_age_bucket bab
    GROUP BY bab.species_id, bab.time_period
  ),
  -- Per-encounter counts: the young-trends columns plus the juv_enc_count /
  -- postjuv_enc_count context columns. juv_enc_count combines 1J and 3J;
  -- postjuv_juv_enc_count/new_postjuv_juv_enc_count break out the 3J-only slice
  -- (age_code = 3 AND is_juv) plus New-record variants. new_postjuv_enc_count is
  -- the non-juv sibling: bare age-3 New records.
  encounter_age_bucket_counts AS (
    SELECT
      eac.species_id,
      eac.time_period,
      COUNT(*) FILTER (WHERE eac.age_bucket = 'juv') AS juv_enc_count,
      COUNT(*) FILTER (WHERE eac.age_bucket = 'postjuv') AS postjuv_enc_count,
      COUNT(*) FILTER (WHERE eac.age_code = 3 AND eac.is_juv) AS postjuv_juv_enc_count,
      COUNT(*) FILTER (WHERE eac.age_code = 3 AND eac.is_juv AND eac.record_type = 'N') AS new_postjuv_juv_enc_count,
      COUNT(*) FILTER (WHERE eac.age_code = 3 AND NOT eac.is_juv AND eac.record_type = 'N') AS new_postjuv_enc_count
    FROM encounter_age_classification eac
    GROUP BY eac.species_id, eac.time_period
  ),
  -- Unwindowed lifetime history for every bird in this query's spine, scoped to
  -- ringing_group_filter but IGNORING from_date/to_date. This is the only data
  -- source in this RPC that is NOT limited to the query window — the age-split
  -- columns need a bird's full history with this group ("first-ever with this
  -- group", "what age was it recorded the year before"), which a windowed source
  -- can't answer. Group scoping mirrors stats_raw_encounters' pattern so a bird's
  -- history under a DIFFERENT group never counts as history with this one.
  lifetime_encounters AS (
    SELECT
      e.bird_id,
      e.age_code,
      e.is_juv,
      EXTRACT(YEAR FROM sess.visit_date)::int AS enc_year
    FROM public."Encounters" e
    JOIN public."Sessions" sess ON e.session_id = sess.id
    WHERE (ringing_group_filter IS NULL OR sess.ringing_group_id = ringing_group_filter)
      AND e.bird_id IN (SELECT DISTINCT bab.bird_id FROM bird_age_bucket bab WHERE bab.bird_id IS NOT NULL)
  ),
  -- First calendar year each bird was ever encountered by this group (unwindowed).
  bird_first_year AS (
    SELECT le.bird_id, MIN(le.enc_year) AS first_year
    FROM lifetime_encounters le
    GROUP BY le.bird_id
  ),
  -- Per (bird, calendar year) tally of how many of that year's encounters were
  -- recorded at age_code IN (1, 3) (i.e. a "young" age reading — 1, 1J, 3 or 3J;
  -- is_juv is irrelevant here, only age_code ∈ {1,3}) vs the year's total. Consumed
  -- by the first_summer vs old_timers majority vote for year (period_year − 1).
  bird_year_age_stats AS (
    SELECT
      le.bird_id,
      le.enc_year,
      COUNT(*) FILTER (WHERE le.age_code IN (1, 3)) AS young_age_count,
      COUNT(*) AS total_count
    FROM lifetime_encounters le
    GROUP BY le.bird_id, le.enc_year
  ),
  -- Resolve the calendar year each (species, time_period) cell represents, for the
  -- adult age-split classification. period_year resolution rule: use the cell's
  -- own time_period when the query is grouped by day/month/year (EXTRACT(YEAR) of
  -- the truncated date is the calendar year); when ungrouped (time_period IS
  -- NULL), fall back to the latest visit date actually present in the cell. These
  -- columns are primarily meaningful under group_by_time_period='year' (the mode
  -- the Age-split chart uses); the fallback merely keeps them well-defined and
  -- non-throwing in every other grouping mode rather than special-casing.
  cell_period_year AS (
    SELECT
      eac.species_id,
      eac.time_period,
      EXTRACT(YEAR FROM COALESCE(eac.time_period, MAX(eac.visit_date)))::int AS period_year
    FROM encounter_age_classification eac
    GROUP BY eac.species_id, eac.time_period
  ),
  -- Classify each adult-bucketed bird (per cell) into exactly one of the three
  -- age-split kinds. new_adult: first-ever-with-group year equals this cell's
  -- period_year. first_summer: first year is earlier AND a strict majority of the
  -- bird's encounters with this group in year (period_year − 1) were age_code IN (1,3).
  -- old_timers: everything else (majority not-young, a tie, or no encounters that prior
  -- year). Only bab.age_bucket = 'adult' birds are considered, so the three counts sum
  -- to adult_bird_count. IS NOT DISTINCT FROM makes the cell join NULL-safe for the
  -- ungrouped case (species_id / time_period are NULL). LEFT JOINs keep every adult
  -- bird represented exactly once even in the (data-impossible) event a lifetime row
  -- is missing — the ELSE 'old_timers' branch is total.
  adult_age_split AS (
    SELECT
      bab.species_id,
      bab.time_period,
      CASE
        WHEN bfy.first_year = py.period_year THEN 'new_adult'
        WHEN COALESCE(prev.young_age_count, 0) * 2 > COALESCE(prev.total_count, 0) THEN 'first_summer'
        ELSE 'old_timers'
      END AS split
    FROM bird_age_bucket bab
    JOIN cell_period_year py
      ON py.species_id IS NOT DISTINCT FROM bab.species_id
     AND py.time_period IS NOT DISTINCT FROM bab.time_period
    LEFT JOIN bird_first_year bfy ON bfy.bird_id = bab.bird_id
    LEFT JOIN bird_year_age_stats prev
      ON prev.bird_id = bab.bird_id AND prev.enc_year = py.period_year - 1
    WHERE bab.age_bucket = 'adult'
  ),
  adult_split_counts AS (
    SELECT
      aas.species_id,
      aas.time_period,
      COUNT(*) FILTER (WHERE aas.split = 'new_adult') AS new_adult_bird_count,
      COUNT(*) FILTER (WHERE aas.split = 'first_summer') AS first_summer_bird_count,
      COUNT(*) FILTER (WHERE aas.split = 'old_timers') AS old_timers_bird_count
    FROM adult_age_split aas
    GROUP BY aas.species_id, aas.time_period
  )
  SELECT
    CASE WHEN group_by_species THEN spine.species_name ELSE NULL::text END AS "species_name",
    CASE
      WHEN group_by_time_period = 'day' THEN spine.time_period
      WHEN group_by_time_period = 'month' THEN spine.time_period
      WHEN group_by_time_period = 'year' THEN spine.time_period
      ELSE NULL::date
    END AS "time_period",

    COALESCE(abc.adult_count, 0) AS "adult_bird_count",
    COALESCE(abc.juv_count, 0) AS "juv_bird_count",
    COALESCE(eabc.juv_enc_count, 0) AS "juv_enc_count",
    COALESCE(eabc.postjuv_enc_count, 0) AS "postjuv_enc_count",

    COALESCE(abc.new_young_count, 0) AS "new_young_bird_count",

    -- Age-split subsets of adult_bird_count; sum to adult_bird_count per row.
    COALESCE(asc2.new_adult_bird_count, 0) AS "new_adult_bird_count",
    COALESCE(asc2.first_summer_bird_count, 0) AS "first_summer_bird_count",
    COALESCE(asc2.old_timers_bird_count, 0) AS "old_timers_bird_count",

    -- Young-trends encounter-level counts; 3J-only slice of juv_enc_count + New variants.
    COALESCE(eabc.postjuv_juv_enc_count, 0) AS "postjuv_juv_enc_count",
    COALESCE(eabc.new_postjuv_juv_enc_count, 0) AS "new_postjuv_juv_enc_count",
    COALESCE(eabc.new_postjuv_enc_count, 0) AS "new_postjuv_enc_count"

  FROM spine
  LEFT JOIN age_bucket_counts abc ON CASE WHEN group_by_species THEN spine.species_id = abc.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = abc.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = abc.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = abc.time_period
    ELSE true
  END
  LEFT JOIN encounter_age_bucket_counts eabc ON CASE WHEN group_by_species THEN spine.species_id = eabc.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = eabc.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = eabc.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = eabc.time_period
    ELSE true
  END
  LEFT JOIN adult_split_counts asc2 ON CASE WHEN group_by_species THEN spine.species_id = asc2.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = asc2.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = asc2.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = asc2.time_period
    ELSE true
  END
  ) AS agg
  ORDER BY agg.species_name ASC, agg.time_period ASC;

END;
$$;


ALTER FUNCTION "public"."demographics_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_discrepencies"("ringing_group_filter" bigint DEFAULT NULL::bigint) RETURNS TABLE("bird_id" bigint, "ring_no" "text", "species_name" "text", "discrepency_type" "text", "last_encounter_date" "date")
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
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
			(ringing_group_filter IS NULL OR s.ringing_group_id = ringing_group_filter)
	),
	hatch_year_differences AS (
		SELECT
			MAX(hatch_ages.min_hatch_year) AS max_min_year,
			MIN(hatch_ages.max_hatch_year) AS min_max_year,
			MAX(hatch_ages.visit_date) AS last_encounter_date,
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
			count(DISTINCT e.sex) AS sex_count,
			MAX(sess.visit_date) AS last_encounter_date
		FROM
			"Birds" b
			JOIN "Encounters" e ON e.bird_id = b.id
			JOIN "Sessions" sess ON sess.id = e.session_id
			JOIN "Species" s ON s.id = b.species_id
		WHERE
			NOT e.sex ILIKE 'u'
			AND (ringing_group_filter IS NULL OR sess.ringing_group_id = ringing_group_filter)
		GROUP BY
			b.id,
			b.ring_no,
			s.species_name
	),wing_lengths as (SELECT
  b.id as bird_id,
  b.ring_no as ring_no,
  s.species_name,
  MAX(e.wing_length) as max_wing_length,
  MIN(e.wing_length) as min_wing_length,
  MAX(sess.visit_date) as last_encounter_date
from "Birds" b
JOIN "Encounters" e on e.bird_id = b.id
JOIN "Sessions" sess on sess.id = e.session_id
JOIN "Species" s on s.id = b.species_id
WHERE e.wing_length IS NOT NULL
AND (ringing_group_filter IS NULL OR sess.ringing_group_id = ringing_group_filter)
GROUP by b.id, b.ring_no, s.species_name)

SELECT
	hatch_year_differences.bird_id as bird_id,
	hatch_year_differences.ring_no as ring_no,
	hatch_year_differences.species_name as species_name,
	'age' as discrepency_type,
	hatch_year_differences.last_encounter_date as last_encounter_date
FROM
	hatch_year_differences
WHERE
	min_max_year < max_min_year

UNION ALL
SELECT
	sex_counts.bird_id as bird_id,
	sex_counts.ring_no as ring_no,
	sex_counts.species_name as species_name,
  'sex' as discrepency_type,
	sex_counts.last_encounter_date as last_encounter_date
FROM
	sex_counts
WHERE
	sex_count > 1
UNION ALL
SELECT
  wing_lengths.bird_id as bird_id,
  wing_lengths.ring_no as ring_no,
  wing_lengths.species_name as species_name,
  'wing_length' as discrepency_type,
  wing_lengths.last_encounter_date as last_encounter_date
FROM wing_lengths
WHERE max_wing_length - min_wing_length >= 5;




END;
$$;


ALTER FUNCTION "public"."find_discrepencies"("ringing_group_filter" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fuzzy_search_rings"("q" "text") RETURNS TABLE("ring_no" "text", "closeness_score" numeric, "species_name" "text")
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
BEGIN
  RETURN QUERY
WITH fuzzy_matches as (SELECT
  b.species_id,
  b.ring_no,
  levenshtein(b.ring_no ,q) as levenshtein
from "Birds" b
)
SELECT fm.ring_no,
        (
          fm.levenshtein::float - (
            0.5*(
              length(fm.ring_no) - length(q)
            )
          )
        )::numeric as closeness_score,
        sp.species_name
FROM fuzzy_matches fm
JOIN "Species" sp on fm.species_id = sp.id
WHERE fm.levenshtein < 3 OR fm.ring_no like CONCAT('%', q, '%')
ORDER BY closeness_score ASC;
END;
$$;


ALTER FUNCTION "public"."fuzzy_search_rings"("q" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."group_ticks"("ringing_group_filter" bigint DEFAULT NULL::bigint, "location_filter" bigint DEFAULT NULL::bigint, "result_limit" integer DEFAULT NULL::integer) RETURNS TABLE("species_name" "text", "first_encounter_date" "date")
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
BEGIN
  RETURN QUERY
	SELECT
		sp.species_name as species_name,
		MIN(sess.visit_date) as first_encounter_date
	FROM public."Encounters" en
		LEFT JOIN public."Birds" b on b.id=en.bird_id
		LEFT JOIN public."Species" sp on sp.id=b.species_id
		LEFT JOIN public."Sessions" sess on sess.id=en.session_id
	WHERE
		(ringing_group_filter IS NULL OR sess.ringing_group_id = ringing_group_filter) AND
		(location_filter IS NULL OR sess.location_id = location_filter)
	GROUP BY
		sp.species_name
	ORDER BY first_encounter_date DESC, sp.species_name ASC
	LIMIT result_limit;
END;
$$;


ALTER FUNCTION "public"."group_ticks"("ringing_group_filter" bigint, "location_filter" bigint, "result_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."long_absence_retraps"("session_date" "date", "ringing_group_filter" bigint, "min_gap_days" integer DEFAULT 730) RETURNS TABLE("ring_no" "text", "species_name" "text", "previous_date" "date", "gap_days" integer)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
BEGIN
  RETURN QUERY
  WITH todays_birds AS (
    SELECT DISTINCT b.id AS bird_id, b.ring_no AS ring_no, sp.species_name AS species_name
    FROM public."Encounters" e
      JOIN public."Sessions" sess ON e.session_id = sess.id
      JOIN public."Birds" b ON e.bird_id = b.id
      LEFT JOIN public."Species" sp ON b.species_id = sp.id
    WHERE sess.visit_date = session_date
      AND sess.ringing_group_id = ringing_group_filter
  ),
  previous_visits AS (
    SELECT e.bird_id AS bird_id, MAX(sess.visit_date) AS previous_date
    FROM public."Encounters" e
      JOIN public."Sessions" sess ON e.session_id = sess.id
    WHERE sess.visit_date < session_date
      AND sess.ringing_group_id = ringing_group_filter
    GROUP BY e.bird_id
  )
  SELECT
    tb.ring_no,
    tb.species_name,
    pv.previous_date,
    (session_date - pv.previous_date)::integer AS gap_days
  FROM todays_birds tb
    JOIN previous_visits pv ON tb.bird_id = pv.bird_id
  WHERE (session_date - pv.previous_date) >= min_gap_days
  ORDER BY gap_days DESC;
END;
$$;


ALTER FUNCTION "public"."long_absence_retraps"("session_date" "date", "ringing_group_filter" bigint, "min_gap_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."metrics_by_period_and_species"("temporal_unit" "text", "metric_name" "text", "filters" "public"."top_metrics_filter_params" DEFAULT NULL::"public"."top_metrics_filter_params") RETURNS TABLE("species_name" "text", "visit_date" "date", "metric_value" bigint)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
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
    AND (filters IS NULL OR filters.ringing_group_filter IS NULL OR (e.ringing_group_id = filters.ringing_group_filter AND sess.ringing_group_id = filters.ringing_group_filter))
  GROUP BY
    date_trunc(temporal_unit, sess.visit_date), sp.species_name;
END;
$$;


ALTER FUNCTION "public"."metrics_by_period_and_species"("temporal_unit" "text", "metric_name" "text", "filters" "public"."top_metrics_filter_params") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."most_caught_birds"("result_limit" integer DEFAULT NULL::integer, "max_per_species" integer DEFAULT NULL::integer, "significance_threshold" integer DEFAULT 3, "species_filter" "text" DEFAULT NULL::"text", "year_filter" integer DEFAULT NULL::integer, "ringing_group_filter" bigint DEFAULT NULL::bigint) RETURNS TABLE("species_name" "text", "ring_no" "text", "encounter_count" bigint, "encounter_dates" "date"[])
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
BEGIN
  RETURN QUERY
	WITH bird_encounter_counts AS (
  SELECT
    sp.species_name as species_name,
    b.ring_no as ring_no,
    count(en.*) as encounter_count,
		array_agg(sess.visit_date order by sess.visit_date ASC) as encounter_dates
  FROM public."Encounters" en
    LEFT JOIN public."Birds" b on  b.id=en.bird_id
    LEFT JOIN public."Species" sp on sp.id=b.species_id
    LEFT JOIN public."Sessions" sess on sess.id=en.session_id
  WHERE
    (species_filter IS NULL OR sp.species_name ilike species_filter) AND
    (year_filter IS NULL OR EXTRACT(YEAR FROM sess.visit_date) = year_filter)
		AND (ringing_group_filter IS NULL OR sess.ringing_group_id = ringing_group_filter)
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
	SELECT tps.species_name, tps.ring_no, tps.encounter_count, tps.encounter_dates FROM top_per_species as tps
	ORDER BY tps.encounter_count DESC, tps.ring_no DESC
	LIMIT result_limit;
END;
$$;


ALTER FUNCTION "public"."most_caught_birds"("result_limit" integer, "max_per_species" integer, "significance_threshold" integer, "species_filter" "text", "year_filter" integer, "ringing_group_filter" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notable_retraps"("result_limit" integer DEFAULT NULL::integer, "result_limit_per_species" integer DEFAULT NULL::integer, "min_proven_age" integer DEFAULT NULL::integer, "min_encounter_count" integer DEFAULT NULL::integer, "species_filter" "text" DEFAULT NULL::"text", "from_date" "date" DEFAULT NULL::"date", "to_date" "date" DEFAULT NULL::"date", "ringing_group_filter" bigint DEFAULT NULL::bigint) RETURNS TABLE("species_name" "text", "ring_no" "text", "encounter_count" bigint, "encounter_dates" "date"[], "proven_age" smallint)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
BEGIN
  RETURN QUERY
	WITH bird_encounter_counts AS (
  SELECT
    sp.species_name as species_name,
    b.ring_no as ring_no,
    b.proven_age as proven_age,
    count(en.*) as encounter_count,
		array_agg(sess.visit_date order by sess.visit_date ASC) as encounter_dates
  FROM public."Encounters" en
    LEFT JOIN public."Birds" b on  b.id=en.bird_id
    LEFT JOIN public."Species" sp on sp.id=b.species_id
    LEFT JOIN public."Sessions" sess on sess.id=en.session_id
  WHERE
    (species_filter IS NULL OR sp.species_name ilike species_filter) AND
    (from_date IS NULL OR sess.visit_date >= from_date) AND
    (to_date IS NULL OR sess.visit_date <= to_date)
		AND (ringing_group_filter IS NULL OR sess.ringing_group_id = ringing_group_filter)
  GROUP BY
    sp.species_name,
    b.ring_no,
    b.proven_age
  ), significant_birds AS (
    SELECT * FROM bird_encounter_counts as bec

  ), top_per_species AS (
		SELECT *
		FROM (
			SELECT *,
				ROW_NUMBER() OVER (PARTITION BY sb.species_name ORDER BY sb.encounter_count DESC) AS rn
			FROM significant_birds as sb
		) sub
		WHERE result_limit_per_species IS NULL OR rn <= result_limit_per_species
	)
	SELECT tps.species_name, tps.ring_no, tps.encounter_count, tps.encounter_dates, tps.proven_age FROM top_per_species as tps
  WHERE
  (min_proven_age IS NULL AND min_encounter_count IS NULL)
  OR
  tps.encounter_count >= min_encounter_count
  OR
  tps.proven_age >= min_proven_age

	ORDER BY tps.encounter_count DESC, tps.ring_no DESC
	LIMIT result_limit;
END;
$$;


ALTER FUNCTION "public"."notable_retraps"("result_limit" integer, "result_limit_per_species" integer, "min_proven_age" integer, "min_encounter_count" integer, "species_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."population_stats"("species_name_filter" "text" DEFAULT NULL::"text", "from_date" "date" DEFAULT NULL::"date", "to_date" "date" DEFAULT NULL::"date", "ringing_group_filter" bigint DEFAULT NULL::bigint, "group_by_species" boolean DEFAULT false, "group_by_time_period" "text" DEFAULT NULL::"text") RETURNS SETOF "public"."population_stats_result"
    LANGUAGE "plpgsql"
    AS $$
  BEGIN
  RETURN QUERY
  SELECT (jsonb_populate_record(NULL::public.population_stats_result, to_jsonb(agg))).*
  FROM (
  WITH spine AS (
    SELECT * FROM public.stats_spine(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ), encounter_age_classification AS (
    SELECT * FROM public.stats_encounter_age_classification(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ), bird_age_bucket AS (
    SELECT * FROM public.stats_bird_age_bucket(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ),
  -- Bird-level bucket counts (context columns + the new_young_bird_count copy).
  -- Mirrors aggregate_stats' age_bucket_counts, restricted to the columns this RPC
  -- exposes.
  age_bucket_counts AS (
    SELECT
      bab.species_id,
      bab.time_period,
      COUNT(*) FILTER (WHERE bab.age_bucket = 'juv') AS juv_count,
      COUNT(*) FILTER (WHERE bab.age_bucket = 'adult') AS adult_count,
      -- New young bird: in a young bucket (pullus/juv/postjuv) AND has any New ('N')
      -- encounter in the cell. Bucket membership and New membership are checked
      -- independently — not required to be the same encounter row. Identical
      -- derivation to aggregate_stats.new_young_bird_count.
      COUNT(*) FILTER (
        WHERE bab.age_bucket IN ('pullus', 'juv', 'postjuv') AND bab.has_new
      ) AS new_young_count
    FROM bird_age_bucket bab
    GROUP BY bab.species_id, bab.time_period
  ),
  -- Per-encounter counts: the young-trends columns plus the juv_enc_count /
  -- postjuv_enc_count context columns. juv_enc_count combines 1J and 3J;
  -- postjuv_juv_enc_count/new_postjuv_juv_enc_count break out the 3J-only slice
  -- (age_code = 3 AND is_juv) plus New-record variants. new_postjuv_enc_count is
  -- the non-juv sibling: bare age-3 New records.
  encounter_age_bucket_counts AS (
    SELECT
      eac.species_id,
      eac.time_period,
      COUNT(*) FILTER (WHERE eac.age_bucket = 'juv') AS juv_enc_count,
      COUNT(*) FILTER (WHERE eac.age_bucket = 'postjuv') AS postjuv_enc_count,
      COUNT(*) FILTER (WHERE eac.age_code = 3 AND eac.is_juv) AS postjuv_juv_enc_count,
      COUNT(*) FILTER (WHERE eac.age_code = 3 AND eac.is_juv AND eac.record_type = 'N') AS new_postjuv_juv_enc_count,
      COUNT(*) FILTER (WHERE eac.age_code = 3 AND NOT eac.is_juv AND eac.record_type = 'N') AS new_postjuv_enc_count
    FROM encounter_age_classification eac
    GROUP BY eac.species_id, eac.time_period
  ),
  -- Unwindowed lifetime history for every bird in this query's spine, scoped to
  -- ringing_group_filter but IGNORING from_date/to_date. This is the only data
  -- source in this RPC that is NOT limited to the query window — the age-split
  -- columns need a bird's full history with this group ("first-ever with this
  -- group", "what age was it recorded the year before"), which a windowed source
  -- can't answer. Group scoping mirrors stats_raw_encounters' pattern so a bird's
  -- history under a DIFFERENT group never counts as history with this one.
  lifetime_encounters AS (
    SELECT
      e.bird_id,
      e.age_code,
      e.is_juv,
      EXTRACT(YEAR FROM sess.visit_date)::int AS enc_year
    FROM public."Encounters" e
    JOIN public."Sessions" sess ON e.session_id = sess.id
    WHERE (ringing_group_filter IS NULL OR sess.ringing_group_id = ringing_group_filter)
      AND e.bird_id IN (SELECT DISTINCT bab.bird_id FROM bird_age_bucket bab WHERE bab.bird_id IS NOT NULL)
  ),
  -- First calendar year each bird was ever encountered by this group (unwindowed).
  bird_first_year AS (
    SELECT le.bird_id, MIN(le.enc_year) AS first_year
    FROM lifetime_encounters le
    GROUP BY le.bird_id
  ),
  -- Per (bird, calendar year) tally of how many of that year's encounters were
  -- recorded at age_code IN (1, 3) (i.e. a "young" age reading — 1, 1J, 3 or 3J;
  -- is_juv is irrelevant here, only age_code ∈ {1,3}) vs the year's total. Consumed
  -- by the first_summer vs old_timers majority vote for year (period_year − 1).
  bird_year_age_stats AS (
    SELECT
      le.bird_id,
      le.enc_year,
      COUNT(*) FILTER (WHERE le.age_code IN (1, 3)) AS young_age_count,
      COUNT(*) AS total_count
    FROM lifetime_encounters le
    GROUP BY le.bird_id, le.enc_year
  ),
  -- Resolve the calendar year each (species, time_period) cell represents, for the
  -- adult age-split classification. period_year resolution rule: use the cell's
  -- own time_period when the query is grouped by day/month/year (EXTRACT(YEAR) of
  -- the truncated date is the calendar year); when ungrouped (time_period IS
  -- NULL), fall back to the latest visit date actually present in the cell. These
  -- columns are primarily meaningful under group_by_time_period='year' (the mode
  -- the Age-split chart uses); the fallback merely keeps them well-defined and
  -- non-throwing in every other grouping mode rather than special-casing.
  cell_period_year AS (
    SELECT
      eac.species_id,
      eac.time_period,
      EXTRACT(YEAR FROM COALESCE(eac.time_period, MAX(eac.visit_date)))::int AS period_year
    FROM encounter_age_classification eac
    GROUP BY eac.species_id, eac.time_period
  ),
  -- Classify each adult-bucketed bird (per cell) into exactly one of the three
  -- age-split kinds. new_adult: first-ever-with-group year equals this cell's
  -- period_year. first_summer: first year is earlier AND a strict majority of the
  -- bird's encounters with this group in year (period_year − 1) were age_code IN (1,3).
  -- old_timers: everything else (majority not-young, a tie, or no encounters that prior
  -- year). Only bab.age_bucket = 'adult' birds are considered, so the three counts sum
  -- to adult_bird_count. IS NOT DISTINCT FROM makes the cell join NULL-safe for the
  -- ungrouped case (species_id / time_period are NULL). LEFT JOINs keep every adult
  -- bird represented exactly once even in the (data-impossible) event a lifetime row
  -- is missing — the ELSE 'old_timers' branch is total.
  adult_age_split AS (
    SELECT
      bab.species_id,
      bab.time_period,
      CASE
        WHEN bfy.first_year = py.period_year THEN 'new_adult'
        WHEN COALESCE(prev.young_age_count, 0) * 2 > COALESCE(prev.total_count, 0) THEN 'first_summer'
        ELSE 'old_timers'
      END AS split
    FROM bird_age_bucket bab
    JOIN cell_period_year py
      ON py.species_id IS NOT DISTINCT FROM bab.species_id
     AND py.time_period IS NOT DISTINCT FROM bab.time_period
    LEFT JOIN bird_first_year bfy ON bfy.bird_id = bab.bird_id
    LEFT JOIN bird_year_age_stats prev
      ON prev.bird_id = bab.bird_id AND prev.enc_year = py.period_year - 1
    WHERE bab.age_bucket = 'adult'
  ),
  adult_split_counts AS (
    SELECT
      aas.species_id,
      aas.time_period,
      COUNT(*) FILTER (WHERE aas.split = 'new_adult') AS new_adult_bird_count,
      COUNT(*) FILTER (WHERE aas.split = 'first_summer') AS first_summer_bird_count,
      COUNT(*) FILTER (WHERE aas.split = 'old_timers') AS old_timers_bird_count
    FROM adult_age_split aas
    GROUP BY aas.species_id, aas.time_period
  )
  SELECT
    CASE WHEN group_by_species THEN spine.species_name ELSE NULL::text END AS "species_name",
    CASE
      WHEN group_by_time_period = 'day' THEN spine.time_period
      WHEN group_by_time_period = 'month' THEN spine.time_period
      WHEN group_by_time_period = 'year' THEN spine.time_period
      ELSE NULL::date
    END AS "time_period",

    COALESCE(abc.adult_count, 0) AS "adult_bird_count",
    COALESCE(abc.juv_count, 0) AS "juv_bird_count",
    COALESCE(eabc.juv_enc_count, 0) AS "juv_enc_count",
    COALESCE(eabc.postjuv_enc_count, 0) AS "postjuv_enc_count",

    COALESCE(abc.new_young_count, 0) AS "new_young_bird_count",

    -- Age-split subsets of adult_bird_count; sum to adult_bird_count per row.
    COALESCE(asc2.new_adult_bird_count, 0) AS "new_adult_bird_count",
    COALESCE(asc2.first_summer_bird_count, 0) AS "first_summer_bird_count",
    COALESCE(asc2.old_timers_bird_count, 0) AS "old_timers_bird_count",

    -- Young-trends encounter-level counts; 3J-only slice of juv_enc_count + New variants.
    COALESCE(eabc.postjuv_juv_enc_count, 0) AS "postjuv_juv_enc_count",
    COALESCE(eabc.new_postjuv_juv_enc_count, 0) AS "new_postjuv_juv_enc_count",
    COALESCE(eabc.new_postjuv_enc_count, 0) AS "new_postjuv_enc_count"

  FROM spine
  LEFT JOIN age_bucket_counts abc ON CASE WHEN group_by_species THEN spine.species_id = abc.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = abc.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = abc.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = abc.time_period
    ELSE true
  END
  LEFT JOIN encounter_age_bucket_counts eabc ON CASE WHEN group_by_species THEN spine.species_id = eabc.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = eabc.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = eabc.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = eabc.time_period
    ELSE true
  END
  LEFT JOIN adult_split_counts asc2 ON CASE WHEN group_by_species THEN spine.species_id = asc2.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = asc2.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = asc2.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = asc2.time_period
    ELSE true
  END
  ) AS agg
  ORDER BY agg.species_name ASC, agg.time_period ASC;

END;
$$;


ALTER FUNCTION "public"."population_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."public_aggregate_stats"("species_name_filter" "text" DEFAULT NULL::"text", "from_date" "date" DEFAULT NULL::"date", "to_date" "date" DEFAULT NULL::"date", "ringing_group_filter" bigint DEFAULT NULL::bigint, "group_by_species" boolean DEFAULT false, "group_by_time_period" "text" DEFAULT NULL::"text") RETURNS SETOF "public"."aggregate_stats_result"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
BEGIN
  -- Only expose data for a group that has explicitly published its summary area.
  IF ringing_group_filter IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public."RingingGroups" rg
       WHERE rg.id = ringing_group_filter
         AND 'summary' = ANY(rg.public_areas)
     ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.aggregate_stats(
    species_name_filter,
    from_date,
    to_date,
    ringing_group_filter,
    group_by_species,
    group_by_time_period
  );
END;
$$;


ALTER FUNCTION "public"."public_aggregate_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."public_core_stats"("species_name_filter" "text" DEFAULT NULL::"text", "from_date" "date" DEFAULT NULL::"date", "to_date" "date" DEFAULT NULL::"date", "ringing_group_filter" bigint DEFAULT NULL::bigint, "group_by_species" boolean DEFAULT false, "group_by_time_period" "text" DEFAULT NULL::"text") RETURNS SETOF "public"."core_stats_result"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
BEGIN
  -- Only expose data for a group that has explicitly published its summary area.
  IF ringing_group_filter IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public."RingingGroups" rg
       WHERE rg.id = ringing_group_filter
         AND 'summary' = ANY(rg.public_areas)
     ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.core_stats(
    species_name_filter,
    from_date,
    to_date,
    ringing_group_filter,
    group_by_species,
    group_by_time_period
  );
END;
$$;


ALTER FUNCTION "public"."public_core_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ring_sequence_controls"("ringing_group_filter" bigint DEFAULT NULL::bigint) RETURNS TABLE("ring_no" "text", "species_name" "text", "first_date" "date")
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.ring_no,
    sp.species_name   AS species_name,
    MIN(s.visit_date) AS first_date
  FROM "Birds" b
  JOIN "Encounters" e  ON e.bird_id = b.id
  JOIN "Sessions"   s  ON s.id = e.session_id
  JOIN "Species"    sp ON sp.id = b.species_id
  WHERE (ringing_group_filter IS NULL OR s.ringing_group_id = ringing_group_filter)
    -- Exclude a ring only when THIS group has its own RingSequences_Birds link for
    -- the bird. Tracking is now per-group (issue #703 fixed the old group-agnostic
    -- Birds.ring_sequence_id FK, which let one group's link block every other
    -- group from ever seeing or tracking the same bird as a control). RLS on
    -- RingSequences_Birds already scopes rows to the caller's own group, and the
    -- explicit ringing_group_id match below is defence-in-depth rather than
    -- reliance on RLS alone.
    AND NOT EXISTS (
      SELECT 1
      FROM "RingSequences_Birds" rsb
      WHERE rsb.bird_id = b.id
        AND rsb.ringing_group_id = ringing_group_filter
    )
  GROUP BY b.ring_no, sp.species_name
  HAVING COUNT(*) = COUNT(*) FILTER (WHERE e.record_type = 'S')
  ORDER BY b.ring_no;
END;
$$;


ALTER FUNCTION "public"."ring_sequence_controls"("ringing_group_filter" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stats_bird_age_bucket"("species_name_filter" "text" DEFAULT NULL::"text", "from_date" "date" DEFAULT NULL::"date", "to_date" "date" DEFAULT NULL::"date", "ringing_group_filter" bigint DEFAULT NULL::bigint, "group_by_species" boolean DEFAULT false, "group_by_time_period" "text" DEFAULT NULL::"text") RETURNS TABLE("bird_id" bigint, "species_id" bigint, "time_period" "date", "has_new" boolean, "age_bucket" "text")
    LANGUAGE "sql" STABLE
    AS $$
  WITH encounter_age_classification AS (
    SELECT * FROM public.stats_encounter_age_classification(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ), bird_age_flags AS (
    SELECT
      eac.bird_id,
      eac.species_id,
      eac.time_period,
      COALESCE(bool_or(eac.age_bucket = 'pullus'), FALSE) AS has_pullus,
      COALESCE(bool_or(eac.age_bucket = 'juv'), FALSE) AS has_juv,
      COALESCE(bool_or(eac.age_bucket = 'postjuv'), FALSE) AS has_postjuv,
      COALESCE(bool_or(eac.age_bucket = 'adult'), FALSE) AS has_adult,
      COALESCE(bool_or(eac.record_type = 'N'), FALSE) AS has_new
    FROM encounter_age_classification eac
    GROUP BY eac.bird_id, eac.species_id, eac.time_period
  )
  SELECT
    baf.bird_id,
    baf.species_id,
    baf.time_period,
    baf.has_new,
    CASE
      WHEN baf.has_pullus THEN 'pullus'
      WHEN baf.has_juv AND NOT baf.has_adult THEN 'juv'
      WHEN baf.has_postjuv AND NOT baf.has_juv AND NOT baf.has_adult THEN 'postjuv'
      WHEN baf.has_adult AND NOT baf.has_juv AND NOT baf.has_postjuv THEN 'adult'
      ELSE 'unknown'
    END AS age_bucket
  FROM bird_age_flags baf;
$$;


ALTER FUNCTION "public"."stats_bird_age_bucket"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stats_bird_first_encounter_of_year"("species_name_filter" "text" DEFAULT NULL::"text", "from_date" "date" DEFAULT NULL::"date", "to_date" "date" DEFAULT NULL::"date", "ringing_group_filter" bigint DEFAULT NULL::bigint, "group_by_species" boolean DEFAULT false, "group_by_time_period" "text" DEFAULT NULL::"text") RETURNS TABLE("bird_id" bigint, "species_id" bigint, "time_period" "date", "arrival_bucket" "text")
    LANGUAGE "sql" STABLE
    AS $$
  WITH encounter_age_classification AS (
    SELECT * FROM public.stats_encounter_age_classification(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ),
  -- Drop unclassifiable encounters before the first-of-year pick (see header).
  classifiable_encounters AS (
    SELECT
      eac.encounter_id,
      eac.bird_id,
      eac.visit_date,
      eac.species_id,
      eac.time_period,
      eac.age_bucket,
      EXTRACT(YEAR FROM eac.visit_date)::int AS enc_year
    FROM encounter_age_classification eac
    WHERE eac.age_bucket <> 'unknown'
      AND eac.bird_id IS NOT NULL
  ),
  -- One row per (bird, calendar year): that year's earliest encounter. The
  -- encounter_id tiebreak makes same-day ties deterministic.
  first_encounter_of_year AS (
    SELECT DISTINCT ON (ce.bird_id, ce.enc_year)
      ce.bird_id,
      ce.species_id,
      ce.time_period,
      ce.age_bucket,
      ce.enc_year
    FROM classifiable_encounters ce
    ORDER BY ce.bird_id, ce.enc_year, ce.visit_date ASC, ce.encounter_id ASC
  ),
  -- Unwindowed lifetime history for every arriving bird, scoped to
  -- ringing_group_filter but IGNORING from_date/to_date — "first-ever with this
  -- group" can't be answered from a windowed source. Group scoping mirrors
  -- stats_raw_encounters' pattern so a bird's history under a DIFFERENT group
  -- never counts as history with this one.
  lifetime_encounters AS (
    SELECT
      e.bird_id,
      EXTRACT(YEAR FROM sess.visit_date)::int AS enc_year
    FROM public."Encounters" e
    JOIN public."Sessions" sess ON e.session_id = sess.id
    WHERE (ringing_group_filter IS NULL OR sess.ringing_group_id = ringing_group_filter)
      AND e.bird_id IN (SELECT DISTINCT feoy.bird_id FROM first_encounter_of_year feoy)
  ),
  -- First calendar year each bird was ever encountered by this group (unwindowed).
  bird_first_year AS (
    SELECT le.bird_id, MIN(le.enc_year) AS first_year
    FROM lifetime_encounters le
    GROUP BY le.bird_id
  )
  SELECT
    feoy.bird_id,
    feoy.species_id,
    feoy.time_period,
    CASE
      WHEN feoy.age_bucket <> 'adult' THEN feoy.age_bucket
      WHEN bfy.first_year = feoy.enc_year THEN 'new_adult'
      ELSE 'returning_adult'
    END AS arrival_bucket
  FROM first_encounter_of_year feoy
  LEFT JOIN bird_first_year bfy ON bfy.bird_id = feoy.bird_id;
$$;


ALTER FUNCTION "public"."stats_bird_first_encounter_of_year"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stats_encounter_age_classification"("species_name_filter" "text" DEFAULT NULL::"text", "from_date" "date" DEFAULT NULL::"date", "to_date" "date" DEFAULT NULL::"date", "ringing_group_filter" bigint DEFAULT NULL::bigint, "group_by_species" boolean DEFAULT false, "group_by_time_period" "text" DEFAULT NULL::"text") RETURNS TABLE("encounter_id" bigint, "bird_id" bigint, "record_type" "text", "age_code" smallint, "is_juv" boolean, "visit_date" "date", "species_id" bigint, "time_period" "date", "age_bucket" "text")
    LANGUAGE "sql" STABLE
    AS $$
  WITH raw_encounters AS (
    SELECT * FROM public.stats_raw_encounters(species_name_filter, from_date, to_date, ringing_group_filter)
  )
  SELECT
    re.encounter_id,
    re.bird_id,
    re.record_type,
    re.age_code,
    re.is_juv,
    re.visit_date,
    CASE WHEN group_by_species THEN re.species_id ELSE NULL::bigint END AS species_id,
    CASE
      WHEN group_by_time_period = 'day' THEN re.session_day
      WHEN group_by_time_period = 'month' THEN re.session_month
      WHEN group_by_time_period = 'year' THEN re.session_year
      ELSE NULL::date
    END AS time_period,
    CASE
      WHEN re.age_code = 1 AND NOT re.is_juv THEN 'pullus'
      WHEN re.is_juv AND re.age_code IN (1, 3) THEN 'juv'
      WHEN re.age_code = 3 AND NOT re.is_juv THEN 'postjuv'
      WHEN re.age_code > 3 THEN 'adult'
      ELSE 'unknown'
    END AS age_bucket
  FROM raw_encounters re
  WHERE re.encounter_id IS NOT NULL;
$$;


ALTER FUNCTION "public"."stats_encounter_age_classification"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stats_per_day_and_species"("ringing_group_filter" bigint) RETURNS TABLE("species_name" "text", "visit_date" "date", "encounter_count" bigint, "juv_count" bigint, "postjuv_count" bigint, "pullus_count" bigint, "weighed_birds_count" bigint, "min_weight" numeric, "max_weight" numeric)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    sp.species_name AS species_name,
    sess.visit_date AS visit_date,
    COUNT(e.*) AS encounter_count,
    COUNT(e.*) FILTER (WHERE e.is_juv AND e.age_code IN (1, 3)) AS juv_count,
    COUNT(e.*) FILTER (WHERE e.age_code = 3 AND NOT e.is_juv) AS postjuv_count,
    COUNT(e.*) FILTER (WHERE e.age_code = 1 AND NOT e.is_juv) AS pullus_count,
    COUNT(e.*) FILTER (WHERE e.weight IS NOT NULL) AS weighed_birds_count,
    MIN(e.weight::numeric) AS min_weight,
    MAX(e.weight::numeric) AS max_weight
  FROM
    public."Birds" b
    LEFT JOIN public."Encounters" e ON b.id = e.bird_id
    LEFT JOIN public."Sessions" sess ON e.session_id = sess.id
    LEFT JOIN public."Species" sp ON b.species_id = sp.id
  WHERE
    sess.visit_date IS NOT NULL
    AND e.ringing_group_id = ringing_group_filter
    AND sess.ringing_group_id = ringing_group_filter
    AND sess.session_type = 'FULL_GROWN'
  GROUP BY
    sess.visit_date, sp.species_name;
END;
$$;


ALTER FUNCTION "public"."stats_per_day_and_species"("ringing_group_filter" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stats_raw_encounters"("species_name_filter" "text" DEFAULT NULL::"text", "from_date" "date" DEFAULT NULL::"date", "to_date" "date" DEFAULT NULL::"date", "ringing_group_filter" bigint DEFAULT NULL::bigint) RETURNS TABLE("species_id" bigint, "species_name" "text", "bird_id" bigint, "ring_no" "text", "encounter_id" bigint, "weight" real, "wing_length" smallint, "record_type" "text", "age_code" smallint, "is_juv" boolean, "session_id" bigint, "visit_date" "date", "session_type" "text", "max_hatch_year" smallint, "capture_time" time without time zone, "session_day" "date", "session_month" "date", "session_year" "date")
    LANGUAGE "sql" STABLE
    AS $$
  SELECT
    sp.id AS species_id,
    sp.species_name,
    b.id AS bird_id,
    b.ring_no,
    e.id AS encounter_id,
    e.weight,
    e.wing_length,
    e.record_type,
    e.age_code,
    e.is_juv,
    sess.id AS session_id,
    sess.visit_date,
    sess.session_type,
    e.max_hatch_year,
    e.capture_time,
    date_trunc('day', sess.visit_date)::DATE AS session_day,
    date_trunc('month', sess.visit_date)::DATE AS session_month,
    date_trunc('year', sess.visit_date)::DATE AS session_year
  FROM public."Species" sp
  JOIN public."Birds" b ON sp.id = b.species_id
  LEFT JOIN public."Encounters" e ON b.id = e.bird_id
  LEFT JOIN public."Sessions" sess ON e.session_id = sess.id
  WHERE (from_date IS NULL OR sess.visit_date >= from_date)
   AND (to_date IS NULL OR sess.visit_date <= to_date)
   AND (species_name_filter IS NULL OR sp.species_name = species_name_filter)
   AND (ringing_group_filter IS NULL OR sess.ringing_group_id = ringing_group_filter);
$$;


ALTER FUNCTION "public"."stats_raw_encounters"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stats_spine"("species_name_filter" "text" DEFAULT NULL::"text", "from_date" "date" DEFAULT NULL::"date", "to_date" "date" DEFAULT NULL::"date", "ringing_group_filter" bigint DEFAULT NULL::bigint, "group_by_species" boolean DEFAULT false, "group_by_time_period" "text" DEFAULT NULL::"text") RETURNS TABLE("species_id" bigint, "species_name" "text", "time_period" "date")
    LANGUAGE "sql" STABLE
    AS $$
  WITH raw_encounters AS (
    SELECT * FROM public.stats_raw_encounters(species_name_filter, from_date, to_date, ringing_group_filter)
  ), species_spine AS (
    SELECT
      DISTINCT re.species_id, re.species_name
    FROM raw_encounters as re
    WHERE (species_name_filter IS NULL OR re.species_name = species_name_filter)
    AND group_by_species

    UNION ALL

    SELECT NULL::bigint, NULL::text
    WHERE NOT group_by_species
  ), session_date_range AS (
    SELECT
      MIN(sess.visit_date) AS min_date,
      MAX(sess.visit_date) AS max_date
    FROM public."Sessions" as sess
    WHERE (from_date IS NULL OR sess.visit_date >= from_date)
      AND (to_date IS NULL OR sess.visit_date <= to_date)
  ), period_spine AS (
    SELECT date_trunc('month', d)::date AS time_period
    FROM session_date_range sdr,
    LATERAL generate_series(
      date_trunc('month', COALESCE(sdr.min_date, from_date, CURRENT_DATE))::timestamp,
      date_trunc('month', COALESCE(sdr.max_date, to_date, CURRENT_DATE))::timestamp,
      '1 month'::interval
    ) d
    WHERE group_by_time_period = 'month'
      AND sdr.min_date IS NOT NULL
      AND sdr.max_date IS NOT NULL

    UNION ALL

    SELECT date_trunc('year', d)::date AS time_period
    FROM session_date_range sdr,
    LATERAL generate_series(
      date_trunc('year', COALESCE(sdr.min_date, from_date, CURRENT_DATE))::timestamp,
      date_trunc('year', COALESCE(sdr.max_date, to_date, CURRENT_DATE))::timestamp,
      '1 year'::interval
    ) d
    WHERE group_by_time_period = 'year'
      AND sdr.min_date IS NOT NULL
      AND sdr.max_date IS NOT NULL

    UNION ALL

    -- The 'day' spine is sparse: one row per distinct session date actually present
    -- in the filtered data, unlike the dense month/year spines (which span every
    -- period in the min..max range, including empty ones). A dense day spine would
    -- emit a row for every calendar day in range — thousands of mostly-empty rows —
    -- so we key off the encounter data instead, and days with no session never appear.
    SELECT DISTINCT re.session_day AS time_period
    FROM raw_encounters re
    WHERE group_by_time_period = 'day'
      AND re.session_day IS NOT NULL

    UNION ALL

    SELECT NULL::date
    WHERE group_by_time_period IS NULL OR group_by_time_period NOT IN ('month', 'year', 'day')
  )
  SELECT s.species_id, s.species_name, p.time_period
  FROM species_spine s
  CROSS JOIN period_spine p;
$$;


ALTER FUNCTION "public"."stats_spine"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."top_metrics_by_period"("temporal_unit" "text", "metric_name" "text", "result_limit" integer, "filters" "public"."top_metrics_filter_params" DEFAULT NULL::"public"."top_metrics_filter_params") RETURNS TABLE("visit_date" "date", "metric_value" bigint)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
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
    "by_period_and_species"."visit_date",
    SUM("by_period_and_species"."metric_value")::bigint AS metric_value
  FROM
    by_period_and_species
  GROUP BY
    "by_period_and_species"."visit_date"
  ORDER BY
    SUM("by_period_and_species"."metric_value") DESC,
		"by_period_and_species"."visit_date" DESC
  LIMIT result_limit;
END;
$$;


ALTER FUNCTION "public"."top_metrics_by_period"("temporal_unit" "text", "metric_name" "text", "result_limit" integer, "filters" "public"."top_metrics_filter_params") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."top_metrics_by_species_and_period"("temporal_unit" "text", "metric_name" "text", "result_limit" integer, "filters" "public"."top_metrics_filter_params" DEFAULT NULL::"public"."top_metrics_filter_params") RETURNS TABLE("species_name" "text", "visit_date" "date", "metric_value" bigint)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
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


ALTER FUNCTION "public"."top_metrics_by_species_and_period"("temporal_unit" "text", "metric_name" "text", "result_limit" integer, "filters" "public"."top_metrics_filter_params") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_add_bird_ringing_group_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE "public"."Birds"
  SET ringing_group_ids = CASE
    WHEN ringing_group_ids IS NULL THEN
      ARRAY[NEW.ringing_group_id]
    WHEN NOT (NEW.ringing_group_id = ANY(ringing_group_ids)) THEN
      array_append(ringing_group_ids, NEW.ringing_group_id)
    ELSE ringing_group_ids
  END
  WHERE id = NEW.bird_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_add_bird_ringing_group_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_encounters_refresh_bird_proven_age"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_bird_id bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_bird_id := OLD.bird_id;
  ELSE
    v_bird_id := NEW.bird_id;
  END IF;

  UPDATE "public"."Birds" b
  SET proven_age = COALESCE(
    (SELECT
      EXTRACT(YEAR FROM MAX(s.visit_date))::integer - MIN(e.max_hatch_year)
    FROM "public"."Encounters" e
    JOIN "public"."Sessions" s ON s.id = e.session_id
    WHERE e.bird_id = v_bird_id),
    0
  )
  WHERE b.id = v_bird_id;

  IF TG_OP = 'UPDATE'
  AND OLD.bird_id IS DISTINCT FROM NEW.bird_id THEN
    UPDATE "public"."Birds" b
    SET proven_age = COALESCE(
      (SELECT
        EXTRACT(YEAR FROM MAX(s.visit_date))::integer - MIN(e.max_hatch_year)
      FROM "public"."Encounters" e
      JOIN "public"."Sessions" s ON s.id = e.session_id
      WHERE e.bird_id = OLD.bird_id),
      0
    )
    WHERE b.id = OLD.bird_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."trg_encounters_refresh_bird_proven_age"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_prevent_bird_species_id_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- A physical ring number is assigned to one bird of one species for life, so
  -- species_id must never change once set. If a re-imported CSV row reuses an
  -- existing ring_no with a different species it signals a data-quality problem
  -- in the source data — raise rather than silently overwrite species_id, so the
  -- import surfaces the bad row (counted as a failed record) instead of masking it.
  IF NEW.species_id IS DISTINCT FROM OLD.species_id THEN
    RAISE EXCEPTION 'species_id is immutable once set (ring_no=%): cannot change from % to %',
      OLD.ring_no, OLD.species_id, NEW.species_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_prevent_bird_species_id_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_remove_bird_ringing_group_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE "public"."Birds"
  SET ringing_group_ids = COALESCE(array_remove(ringing_group_ids, OLD.ringing_group_id), '{}')
  WHERE id = OLD.bird_id
    AND NOT EXISTS (
      SELECT 1 FROM "public"."Encounters" e
      WHERE e.bird_id = OLD.bird_id
        AND e.ringing_group_id = OLD.ringing_group_id
        AND e.id != OLD.id
      );
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."trg_remove_bird_ringing_group_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_set_encounter_generated_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  SELECT
    l."ringing_group_id",
    CASE
				WHEN NEW.age_code % 2 = 0 THEN EXTRACT(
					YEAR
					FROM
						s.visit_date
				)::INTEGER - (NEW.age_code / 2 - 1)
				WHEN NEW.age_code % 2 = 1
				AND NEW.age_code > 1 THEN EXTRACT(
					YEAR
					FROM
						s.visit_date
				)::INTEGER - ((NEW.age_code - 3) / 2)
				ELSE EXTRACT(
					YEAR
					FROM
						s.visit_date
				)::INTEGER
			END AS max_hatch_year,
			CASE
				WHEN NEW.age_code % 2 = 0 THEN 0
				WHEN NEW.age_code % 2 = 1
				AND NEW.age_code > 1 THEN EXTRACT(
					YEAR
					FROM
						s.visit_date
				)::INTEGER - ((NEW.age_code - 3) / 2)
				ELSE EXTRACT(
					YEAR
					FROM
						s.visit_date
				)::INTEGER
			END AS min_hatch_year
  INTO NEW."ringing_group_id", NEW."max_hatch_year", NEW."min_hatch_year"
  FROM "public"."Sessions" s
  JOIN "public"."Locations" l ON l."id" = s."location_id"
  WHERE s."id" = NEW."session_id";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session % not found or has no location', NEW."session_id";
  END IF;

  -- Update Birds.last_encountered_timestamp when encounter timestamp is newer
  UPDATE "public"."Birds" b
  SET last_encountered_timestamp = (s.visit_date + COALESCE(NEW.capture_time, '00:00:00'::time))
  FROM "public"."Sessions" s
  WHERE b.id = NEW.bird_id
    AND s.id = NEW.session_id
    AND (b.last_encountered_timestamp IS NULL OR (s.visit_date + COALESCE(NEW.capture_time, '00:00:00'::time)) > b.last_encountered_timestamp);

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_set_encounter_generated_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_set_session_generated_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  SELECT
    l."ringing_group_id"
  INTO NEW."ringing_group_id"
  FROM "public"."Locations" l
  WHERE l."id" = NEW."location_id";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Location % not found', NEW."location_id";
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_set_session_generated_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_suppress_same_session_retrap"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.record_type = 'N' AND NEW.record_type != 'N' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_suppress_same_session_retrap"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_update_bird_ringing_group_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Only act when ringing_group_id actually changed
  IF OLD.ringing_group_id IS DISTINCT FROM NEW.ringing_group_id THEN
    -- Remove old group id if no other encounters for this bird in that group
    IF OLD.ringing_group_id IS NOT NULL THEN
      UPDATE "public"."Birds"
      SET ringing_group_ids = COALESCE(array_remove(ringing_group_ids, OLD.ringing_group_id), '{}')
      WHERE id = NEW.bird_id
        AND NOT EXISTS (
          SELECT 1 FROM "public"."Encounters" e
          WHERE e.bird_id = OLD.bird_id
            AND e.ringing_group_id = OLD.ringing_group_id
            AND e.id != OLD.id
        );
    END IF;

    -- Add new group id if not already present
    IF NEW.ringing_group_id IS NOT NULL THEN
      UPDATE "public"."Birds"
      SET ringing_group_ids = CASE
        WHEN ringing_group_ids IS NULL THEN ARRAY[NEW.ringing_group_id]
        WHEN NOT (NEW.ringing_group_id = ANY(ringing_group_ids)) THEN array_append(ringing_group_ids, NEW.ringing_group_id)
        ELSE ringing_group_ids
      END
      WHERE id = NEW.bird_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_update_bird_ringing_group_id"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."Birds" (
    "ring_no" "text" NOT NULL,
    "id" bigint NOT NULL,
    "species_id" bigint NOT NULL,
    "last_encountered_timestamp" timestamp without time zone DEFAULT '0001-01-01 00:00:00'::timestamp without time zone NOT NULL,
    "ringing_group_ids" bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    "proven_age" smallint DEFAULT 0 NOT NULL,
    "ring_index" bigint GENERATED ALWAYS AS (("substring"("ring_no", '[0-9]+$'::"text"))::bigint) STORED,
    "ring_prefix" "text" GENERATED ALWAYS AS ("left"("ring_no", 3)) STORED
);


ALTER TABLE "public"."Birds" OWNER TO "postgres";


COMMENT ON TABLE "public"."Birds" IS '@graphql({"aggregate": {"enabled": true}})';



CREATE SEQUENCE IF NOT EXISTS "public"."Birds_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."Birds_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."Birds_id_seq" OWNED BY "public"."Birds"."id";



CREATE TABLE IF NOT EXISTS "public"."Encounters" (
    "capture_time" time without time zone NOT NULL,
    "record_type" "text" NOT NULL,
    "scheme" "text" NOT NULL,
    "sex" "text" NOT NULL,
    "sexing_method" "text",
    "breeding_condition" "text",
    "wing_length" smallint,
    "weight" real,
    "moult_code" "text",
    "old_greater_coverts" smallint,
    "extra_text" "text",
    "is_juv" boolean DEFAULT false NOT NULL,
    "id" bigint NOT NULL,
    "bird_id" bigint NOT NULL,
    "session_id" bigint NOT NULL,
    "ringing_group_id" bigint NOT NULL,
    "age_code" smallint NOT NULL,
    "max_hatch_year" smallint NOT NULL,
    "min_hatch_year" smallint NOT NULL,
    "finding_condition" "text",
    "finding_circumstances" "text",
    "primary_moult" "text",
    "capture_method" "text",
    "lure_code_1" "text",
    "lure_code_2" "text",
    "fat" "text",
    "pectoral_muscle" smallint
);


ALTER TABLE "public"."Encounters" OWNER TO "postgres";


COMMENT ON TABLE "public"."Encounters" IS 'Encounters with individual birds';



CREATE SEQUENCE IF NOT EXISTS "public"."Encounters_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."Encounters_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."Encounters_id_seq" OWNED BY "public"."Encounters"."id";



CREATE TABLE IF NOT EXISTS "public"."GroupDataSharing" (
    "id" bigint NOT NULL,
    "granter_group_id" bigint NOT NULL,
    "recipient_group_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "no_self_share" CHECK (("granter_group_id" <> "recipient_group_id"))
);


ALTER TABLE "public"."GroupDataSharing" OWNER TO "postgres";


COMMENT ON TABLE "public"."GroupDataSharing" IS 'granter_group_id shares their data with recipient_group_id';



CREATE SEQUENCE IF NOT EXISTS "public"."GroupDataSharing_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."GroupDataSharing_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."GroupDataSharing_id_seq" OWNED BY "public"."GroupDataSharing"."id";



CREATE TABLE IF NOT EXISTS "public"."Locations" (
    "location_name" "text" NOT NULL,
    "ringing_group_id" bigint NOT NULL,
    "id" bigint NOT NULL
);


ALTER TABLE "public"."Locations" OWNER TO "postgres";


COMMENT ON TABLE "public"."Locations" IS 'Ringing locations';



CREATE SEQUENCE IF NOT EXISTS "public"."Locations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."Locations_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."Locations_id_seq" OWNED BY "public"."Locations"."id";



CREATE TABLE IF NOT EXISTS "public"."RingSequences" (
    "id" bigint NOT NULL,
    "size" "public"."ring_size",
    "prefix" "text" NOT NULL,
    "owned_by_group" boolean DEFAULT true NOT NULL,
    "ringing_group_id" bigint NOT NULL,
    "first_ring" "text",
    "last_ring" "text",
    "first_index" bigint GENERATED ALWAYS AS (("substring"("first_ring", '[0-9]+$'::"text"))::bigint) STORED,
    "last_index" bigint GENERATED ALWAYS AS (("substring"("last_ring", '[0-9]+$'::"text"))::bigint) STORED,
    CONSTRAINT "ring_sequences_first_last_ring_prefix_check" CHECK (((("first_ring" IS NULL) OR ("left"("first_ring", "length"("prefix")) = "prefix")) AND (("last_ring" IS NULL) OR ("left"("last_ring", "length"("prefix")) = "prefix")))),
    CONSTRAINT "ring_sequences_prefix_length_check" CHECK (("length"("prefix") = 3))
);


ALTER TABLE "public"."RingSequences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."RingSequences_Birds" (
    "id" bigint NOT NULL,
    "bird_id" bigint NOT NULL,
    "ring_sequence_id" bigint NOT NULL,
    "ringing_group_id" bigint NOT NULL
);


ALTER TABLE "public"."RingSequences_Birds" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."RingSequences_Birds_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."RingSequences_Birds_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."RingSequences_Birds_id_seq" OWNED BY "public"."RingSequences_Birds"."id";



CREATE SEQUENCE IF NOT EXISTS "public"."RingSequences_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."RingSequences_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."RingSequences_id_seq" OWNED BY "public"."RingSequences"."id";



CREATE TABLE IF NOT EXISTS "public"."RingingGroups" (
    "group_name" "text" NOT NULL,
    "id" bigint NOT NULL,
    "password_hash" "text",
    "password_salt" "text",
    "slug" "text" NOT NULL,
    "public_areas" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "RingingGroups_public_areas_allowlist" CHECK (("public_areas" <@ ARRAY['summary'::"text"]))
);


ALTER TABLE "public"."RingingGroups" OWNER TO "postgres";


COMMENT ON TABLE "public"."RingingGroups" IS 'Ringing groups';



CREATE SEQUENCE IF NOT EXISTS "public"."RingingGroups_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."RingingGroups_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."RingingGroups_id_seq" OWNED BY "public"."RingingGroups"."id";



CREATE TABLE IF NOT EXISTS "public"."Sessions" (
    "id" bigint NOT NULL,
    "visit_date" "date" NOT NULL,
    "location_id" bigint NOT NULL,
    "ringing_group_id" bigint NOT NULL,
    "session_type" "text" DEFAULT 'FULL_GROWN'::"text" NOT NULL,
    CONSTRAINT "Sessions_session_type_check" CHECK (("session_type" = ANY (ARRAY['FULL_GROWN'::"text", 'FIELD_OBSERVATION'::"text", 'PULLI'::"text"])))
);


ALTER TABLE "public"."Sessions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."Sessions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."Sessions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."Sessions_id_seq" OWNED BY "public"."Sessions"."id";



CREATE TABLE IF NOT EXISTS "public"."Species" (
    "species_name" "text" NOT NULL,
    "id" bigint NOT NULL
);


ALTER TABLE "public"."Species" OWNER TO "postgres";


COMMENT ON TABLE "public"."Species" IS 'Bird Species';



CREATE SEQUENCE IF NOT EXISTS "public"."Species_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."Species_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."Species_id_seq" OWNED BY "public"."Species"."id";



ALTER TABLE ONLY "public"."Birds" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."Birds_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."Encounters" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."Encounters_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."GroupDataSharing" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."GroupDataSharing_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."Locations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."Locations_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."RingSequences" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."RingSequences_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."RingSequences_Birds" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."RingSequences_Birds_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."RingingGroups" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."RingingGroups_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."Sessions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."Sessions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."Species" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."Species_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."Birds"
    ADD CONSTRAINT "Birds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."Encounters"
    ADD CONSTRAINT "Encounters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."GroupDataSharing"
    ADD CONSTRAINT "GroupDataSharing_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."Locations"
    ADD CONSTRAINT "Locations_location_name_group_id_unique" UNIQUE ("location_name", "ringing_group_id");



ALTER TABLE ONLY "public"."Locations"
    ADD CONSTRAINT "Locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."RingSequences_Birds"
    ADD CONSTRAINT "RingSequences_Birds_bird_id_ring_sequence_id_ringing_group__key" UNIQUE ("bird_id", "ring_sequence_id", "ringing_group_id");



ALTER TABLE ONLY "public"."RingSequences_Birds"
    ADD CONSTRAINT "RingSequences_Birds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."RingSequences"
    ADD CONSTRAINT "RingSequences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."RingSequences"
    ADD CONSTRAINT "RingSequences_prefix_ringing_group_id_key" UNIQUE ("prefix", "ringing_group_id");



ALTER TABLE ONLY "public"."RingingGroups"
    ADD CONSTRAINT "RingingGroups_group_name_unique" UNIQUE ("group_name");



ALTER TABLE ONLY "public"."RingingGroups"
    ADD CONSTRAINT "RingingGroups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."RingingGroups"
    ADD CONSTRAINT "RingingGroups_slug_unique" UNIQUE ("slug");



ALTER TABLE ONLY "public"."Sessions"
    ADD CONSTRAINT "Sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."Sessions"
    ADD CONSTRAINT "Sessions_visit_date_location_id_key" UNIQUE ("visit_date", "location_id", "session_type");



ALTER TABLE ONLY "public"."Species"
    ADD CONSTRAINT "Species_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."Birds"
    ADD CONSTRAINT "birds_ring_no_unique" UNIQUE ("ring_no");



ALTER TABLE ONLY "public"."Encounters"
    ADD CONSTRAINT "encounters_bird_id_session_id_unique" UNIQUE ("bird_id", "session_id");



ALTER TABLE ONLY "public"."Species"
    ADD CONSTRAINT "species_species_name_unique" UNIQUE ("species_name");



ALTER TABLE ONLY "public"."GroupDataSharing"
    ADD CONSTRAINT "unique_share" UNIQUE ("granter_group_id", "recipient_group_id");



CREATE INDEX "idx_birds_ringing_group_ids" ON "public"."Birds" USING "gin" ("ringing_group_ids");



CREATE INDEX "idx_birds_species_id" ON "public"."Birds" USING "btree" ("species_id");



CREATE INDEX "idx_encounters_bird_id" ON "public"."Encounters" USING "btree" ("bird_id");



CREATE INDEX "idx_encounters_ringing_group_id" ON "public"."Encounters" USING "btree" ("ringing_group_id");



CREATE INDEX "idx_encounters_session_id" ON "public"."Encounters" USING "btree" ("session_id");



CREATE INDEX "idx_locations_ringing_group_id" ON "public"."Locations" USING "btree" ("ringing_group_id");



CREATE INDEX "idx_ring_sequences_birds_bird_id" ON "public"."RingSequences_Birds" USING "btree" ("bird_id");



CREATE INDEX "idx_ring_sequences_birds_ringing_group_id" ON "public"."RingSequences_Birds" USING "btree" ("ringing_group_id");



CREATE INDEX "idx_ring_sequences_ringing_group_id" ON "public"."RingSequences" USING "btree" ("ringing_group_id");



CREATE INDEX "idx_sessions_location_id" ON "public"."Sessions" USING "btree" ("location_id");



CREATE INDEX "idx_sessions_ringing_group_id" ON "public"."Sessions" USING "btree" ("ringing_group_id");



CREATE OR REPLACE TRIGGER "trigger_encounters_refresh_bird_proven_age" AFTER INSERT OR DELETE OR UPDATE ON "public"."Encounters" FOR EACH ROW EXECUTE FUNCTION "public"."trg_encounters_refresh_bird_proven_age"();



CREATE OR REPLACE TRIGGER "trigger_trg_add_bird_ringing_group_id" AFTER INSERT ON "public"."Encounters" FOR EACH ROW EXECUTE FUNCTION "public"."trg_add_bird_ringing_group_id"();



CREATE OR REPLACE TRIGGER "trigger_trg_prevent_bird_species_id_change" BEFORE UPDATE ON "public"."Birds" FOR EACH ROW EXECUTE FUNCTION "public"."trg_prevent_bird_species_id_change"();



CREATE OR REPLACE TRIGGER "trigger_trg_remove_bird_ringing_group_id" BEFORE DELETE ON "public"."Encounters" FOR EACH ROW EXECUTE FUNCTION "public"."trg_remove_bird_ringing_group_id"();



CREATE OR REPLACE TRIGGER "trigger_trg_set_encounter_generated_fields" BEFORE INSERT OR UPDATE OF "session_id", "capture_time" ON "public"."Encounters" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_encounter_generated_fields"();



CREATE OR REPLACE TRIGGER "trigger_trg_set_session_generated_fields" BEFORE INSERT OR UPDATE OF "location_id" ON "public"."Sessions" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_session_generated_fields"();



CREATE OR REPLACE TRIGGER "trigger_trg_suppress_same_session_retrap" BEFORE UPDATE ON "public"."Encounters" FOR EACH ROW EXECUTE FUNCTION "public"."trg_suppress_same_session_retrap"();



CREATE OR REPLACE TRIGGER "trigger_trg_update_bird_ringing_group_id" AFTER UPDATE OF "ringing_group_id" ON "public"."Encounters" FOR EACH ROW EXECUTE FUNCTION "public"."trg_update_bird_ringing_group_id"();



ALTER TABLE ONLY "public"."Birds"
    ADD CONSTRAINT "birds_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "public"."Species"("id");



ALTER TABLE ONLY "public"."Encounters"
    ADD CONSTRAINT "encounters_bird_id_fkey" FOREIGN KEY ("bird_id") REFERENCES "public"."Birds"("id");



ALTER TABLE ONLY "public"."Encounters"
    ADD CONSTRAINT "encounters_ringing_group_id_fkey" FOREIGN KEY ("ringing_group_id") REFERENCES "public"."RingingGroups"("id");



ALTER TABLE ONLY "public"."Encounters"
    ADD CONSTRAINT "encounters_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."Sessions"("id");



ALTER TABLE ONLY "public"."GroupDataSharing"
    ADD CONSTRAINT "group_data_sharing_granter_group_id_fkey" FOREIGN KEY ("granter_group_id") REFERENCES "public"."RingingGroups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."GroupDataSharing"
    ADD CONSTRAINT "group_data_sharing_recipient_group_id_fkey" FOREIGN KEY ("recipient_group_id") REFERENCES "public"."RingingGroups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Locations"
    ADD CONSTRAINT "locations_ringing_group_id_fkey" FOREIGN KEY ("ringing_group_id") REFERENCES "public"."RingingGroups"("id");



ALTER TABLE ONLY "public"."RingSequences_Birds"
    ADD CONSTRAINT "ring_sequences_birds_bird_id_fkey" FOREIGN KEY ("bird_id") REFERENCES "public"."Birds"("id");



ALTER TABLE ONLY "public"."RingSequences_Birds"
    ADD CONSTRAINT "ring_sequences_birds_ring_sequence_id_fkey" FOREIGN KEY ("ring_sequence_id") REFERENCES "public"."RingSequences"("id");



ALTER TABLE ONLY "public"."RingSequences_Birds"
    ADD CONSTRAINT "ring_sequences_birds_ringing_group_id_fkey" FOREIGN KEY ("ringing_group_id") REFERENCES "public"."RingingGroups"("id");



ALTER TABLE ONLY "public"."RingSequences"
    ADD CONSTRAINT "ring_sequences_ringing_group_id_fkey" FOREIGN KEY ("ringing_group_id") REFERENCES "public"."RingingGroups"("id");



ALTER TABLE ONLY "public"."Sessions"
    ADD CONSTRAINT "sessions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."Locations"("id");



ALTER TABLE ONLY "public"."Sessions"
    ADD CONSTRAINT "sessions_ringing_group_id_fkey" FOREIGN KEY ("ringing_group_id") REFERENCES "public"."RingingGroups"("id");



ALTER TABLE "public"."Birds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."Encounters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."GroupDataSharing" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."Locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."RingSequences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."RingSequences_Birds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."RingingGroups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."Sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."Species" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "group_birds_access" ON "public"."Birds" FOR SELECT USING (((((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint = ANY ("ringing_group_ids")) OR (("ringing_group_ids" = '{}'::bigint[]) AND (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint IS NOT NULL)) OR (EXISTS ( SELECT 1
   FROM ("public"."GroupDataSharing" "gds"
     JOIN "unnest"("Birds"."ringing_group_ids") "gid"("gid") ON (("gid"."gid" = "gds"."granter_group_id")))
  WHERE ("gds"."recipient_group_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint)))));



CREATE POLICY "group_birds_insert" ON "public"."Birds" FOR INSERT WITH CHECK ((((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint IS NOT NULL));



CREATE POLICY "group_birds_update" ON "public"."Birds" FOR UPDATE USING ((((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint IS NOT NULL)) WITH CHECK ((((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint IS NOT NULL));



CREATE POLICY "group_data_sharing_select" ON "public"."GroupDataSharing" FOR SELECT USING (("recipient_group_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint));



CREATE POLICY "group_encounters_access" ON "public"."Encounters" FOR SELECT USING ((("ringing_group_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint) OR (EXISTS ( SELECT 1
   FROM "public"."GroupDataSharing"
  WHERE (("GroupDataSharing"."granter_group_id" = "Encounters"."ringing_group_id") AND ("GroupDataSharing"."recipient_group_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint))))));



CREATE POLICY "group_encounters_insert" ON "public"."Encounters" FOR INSERT WITH CHECK (("ringing_group_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint));



CREATE POLICY "group_encounters_update" ON "public"."Encounters" FOR UPDATE USING (("ringing_group_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint)) WITH CHECK (("ringing_group_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint));



CREATE POLICY "group_locations_access" ON "public"."Locations" FOR SELECT USING ((("ringing_group_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint) OR (EXISTS ( SELECT 1
   FROM "public"."GroupDataSharing"
  WHERE (("GroupDataSharing"."granter_group_id" = "Locations"."ringing_group_id") AND ("GroupDataSharing"."recipient_group_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint))))));



CREATE POLICY "group_locations_insert" ON "public"."Locations" FOR INSERT WITH CHECK (("ringing_group_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint));



CREATE POLICY "group_locations_update" ON "public"."Locations" FOR UPDATE USING (("ringing_group_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint)) WITH CHECK (("ringing_group_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint));



CREATE POLICY "group_ring_sequences_access" ON "public"."RingSequences" FOR SELECT USING (("ringing_group_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint));



CREATE POLICY "group_ring_sequences_birds_access" ON "public"."RingSequences_Birds" FOR SELECT USING (("ringing_group_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint));



CREATE POLICY "group_ring_sequences_birds_delete" ON "public"."RingSequences_Birds" FOR DELETE USING (("ringing_group_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint));



CREATE POLICY "group_ring_sequences_birds_insert" ON "public"."RingSequences_Birds" FOR INSERT WITH CHECK (("ringing_group_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint));



CREATE POLICY "group_ring_sequences_birds_update" ON "public"."RingSequences_Birds" FOR UPDATE USING (("ringing_group_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint)) WITH CHECK (("ringing_group_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint));



CREATE POLICY "group_ring_sequences_insert" ON "public"."RingSequences" FOR INSERT WITH CHECK (("ringing_group_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint));



CREATE POLICY "group_ring_sequences_update" ON "public"."RingSequences" FOR UPDATE USING (("ringing_group_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint)) WITH CHECK (("ringing_group_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint));



CREATE POLICY "group_sessions_access" ON "public"."Sessions" FOR SELECT USING ((("ringing_group_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint) OR (EXISTS ( SELECT 1
   FROM "public"."GroupDataSharing"
  WHERE (("GroupDataSharing"."granter_group_id" = "Sessions"."ringing_group_id") AND ("GroupDataSharing"."recipient_group_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint))))));



CREATE POLICY "group_sessions_insert" ON "public"."Sessions" FOR INSERT WITH CHECK (("ringing_group_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint));



CREATE POLICY "group_sessions_update" ON "public"."Sessions" FOR UPDATE USING (("ringing_group_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint)) WITH CHECK (("ringing_group_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint));



CREATE POLICY "ringing_groups_access" ON "public"."RingingGroups" FOR SELECT USING (true);



CREATE POLICY "ringing_groups_insert" ON "public"."RingingGroups" FOR INSERT WITH CHECK (true);



CREATE POLICY "ringing_groups_update" ON "public"."RingingGroups" FOR UPDATE USING (("id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint)) WITH CHECK (("id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'ringing_group_id'::"text"))::bigint));



CREATE POLICY "species_access" ON "public"."Species" FOR SELECT USING (true);



CREATE POLICY "species_insert" ON "public"."Species" FOR INSERT WITH CHECK (true);



CREATE POLICY "species_update" ON "public"."Species" FOR UPDATE USING (true) WITH CHECK (true);





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





REVOKE USAGE ON SCHEMA "public" FROM PUBLIC;
GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";































































































































































GRANT ALL ON FUNCTION "public"."aggregate_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."aggregate_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."aggregate_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."arrivals_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."arrivals_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."arrivals_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."biometrics_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."biometrics_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."biometrics_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."core_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."core_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."core_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."daitch_mokotoff"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."daitch_mokotoff"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."daitch_mokotoff"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."daitch_mokotoff"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."demographics_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."demographics_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."demographics_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."difference"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."difference"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."difference"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."difference"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."dmetaphone"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."dmetaphone"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."dmetaphone"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dmetaphone"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."dmetaphone_alt"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."dmetaphone_alt"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."dmetaphone_alt"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dmetaphone_alt"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."find_discrepencies"("ringing_group_filter" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."find_discrepencies"("ringing_group_filter" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_discrepencies"("ringing_group_filter" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."fuzzy_search_rings"("q" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fuzzy_search_rings"("q" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fuzzy_search_rings"("q" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."group_ticks"("ringing_group_filter" bigint, "location_filter" bigint, "result_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."group_ticks"("ringing_group_filter" bigint, "location_filter" bigint, "result_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."group_ticks"("ringing_group_filter" bigint, "location_filter" bigint, "result_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."levenshtein"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."levenshtein"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."levenshtein"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."levenshtein"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."levenshtein"("text", "text", integer, integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."levenshtein"("text", "text", integer, integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."levenshtein"("text", "text", integer, integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."levenshtein"("text", "text", integer, integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."levenshtein_less_equal"("text", "text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."levenshtein_less_equal"("text", "text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."levenshtein_less_equal"("text", "text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."levenshtein_less_equal"("text", "text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."levenshtein_less_equal"("text", "text", integer, integer, integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."levenshtein_less_equal"("text", "text", integer, integer, integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."levenshtein_less_equal"("text", "text", integer, integer, integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."levenshtein_less_equal"("text", "text", integer, integer, integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."long_absence_retraps"("session_date" "date", "ringing_group_filter" bigint, "min_gap_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."long_absence_retraps"("session_date" "date", "ringing_group_filter" bigint, "min_gap_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."long_absence_retraps"("session_date" "date", "ringing_group_filter" bigint, "min_gap_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."metaphone"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."metaphone"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."metaphone"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."metaphone"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."metrics_by_period_and_species"("temporal_unit" "text", "metric_name" "text", "filters" "public"."top_metrics_filter_params") TO "anon";
GRANT ALL ON FUNCTION "public"."metrics_by_period_and_species"("temporal_unit" "text", "metric_name" "text", "filters" "public"."top_metrics_filter_params") TO "authenticated";
GRANT ALL ON FUNCTION "public"."metrics_by_period_and_species"("temporal_unit" "text", "metric_name" "text", "filters" "public"."top_metrics_filter_params") TO "service_role";



GRANT ALL ON FUNCTION "public"."most_caught_birds"("result_limit" integer, "max_per_species" integer, "significance_threshold" integer, "species_filter" "text", "year_filter" integer, "ringing_group_filter" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."most_caught_birds"("result_limit" integer, "max_per_species" integer, "significance_threshold" integer, "species_filter" "text", "year_filter" integer, "ringing_group_filter" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."most_caught_birds"("result_limit" integer, "max_per_species" integer, "significance_threshold" integer, "species_filter" "text", "year_filter" integer, "ringing_group_filter" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."notable_retraps"("result_limit" integer, "result_limit_per_species" integer, "min_proven_age" integer, "min_encounter_count" integer, "species_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."notable_retraps"("result_limit" integer, "result_limit_per_species" integer, "min_proven_age" integer, "min_encounter_count" integer, "species_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."notable_retraps"("result_limit" integer, "result_limit_per_species" integer, "min_proven_age" integer, "min_encounter_count" integer, "species_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."population_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."population_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."population_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."public_aggregate_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."public_aggregate_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."public_aggregate_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."public_core_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."public_core_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."public_core_stats"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ring_sequence_controls"("ringing_group_filter" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."ring_sequence_controls"("ringing_group_filter" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ring_sequence_controls"("ringing_group_filter" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."soundex"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."soundex"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."soundex"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."soundex"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."stats_bird_age_bucket"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."stats_bird_age_bucket"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."stats_bird_age_bucket"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."stats_bird_first_encounter_of_year"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."stats_bird_first_encounter_of_year"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."stats_bird_first_encounter_of_year"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."stats_encounter_age_classification"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."stats_encounter_age_classification"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."stats_encounter_age_classification"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."stats_per_day_and_species"("ringing_group_filter" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."stats_per_day_and_species"("ringing_group_filter" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."stats_per_day_and_species"("ringing_group_filter" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."stats_raw_encounters"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."stats_raw_encounters"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."stats_raw_encounters"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."stats_spine"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."stats_spine"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."stats_spine"("species_name_filter" "text", "from_date" "date", "to_date" "date", "ringing_group_filter" bigint, "group_by_species" boolean, "group_by_time_period" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."text_soundex"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."text_soundex"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."text_soundex"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."text_soundex"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."top_metrics_by_period"("temporal_unit" "text", "metric_name" "text", "result_limit" integer, "filters" "public"."top_metrics_filter_params") TO "anon";
GRANT ALL ON FUNCTION "public"."top_metrics_by_period"("temporal_unit" "text", "metric_name" "text", "result_limit" integer, "filters" "public"."top_metrics_filter_params") TO "authenticated";
GRANT ALL ON FUNCTION "public"."top_metrics_by_period"("temporal_unit" "text", "metric_name" "text", "result_limit" integer, "filters" "public"."top_metrics_filter_params") TO "service_role";



GRANT ALL ON FUNCTION "public"."top_metrics_by_species_and_period"("temporal_unit" "text", "metric_name" "text", "result_limit" integer, "filters" "public"."top_metrics_filter_params") TO "anon";
GRANT ALL ON FUNCTION "public"."top_metrics_by_species_and_period"("temporal_unit" "text", "metric_name" "text", "result_limit" integer, "filters" "public"."top_metrics_filter_params") TO "authenticated";
GRANT ALL ON FUNCTION "public"."top_metrics_by_species_and_period"("temporal_unit" "text", "metric_name" "text", "result_limit" integer, "filters" "public"."top_metrics_filter_params") TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_add_bird_ringing_group_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_add_bird_ringing_group_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_add_bird_ringing_group_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_encounters_refresh_bird_proven_age"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_encounters_refresh_bird_proven_age"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_encounters_refresh_bird_proven_age"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_prevent_bird_species_id_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_prevent_bird_species_id_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_prevent_bird_species_id_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_remove_bird_ringing_group_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_remove_bird_ringing_group_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_remove_bird_ringing_group_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_set_encounter_generated_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_set_encounter_generated_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_set_encounter_generated_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_set_session_generated_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_set_session_generated_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_set_session_generated_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_suppress_same_session_retrap"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_suppress_same_session_retrap"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_suppress_same_session_retrap"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_update_bird_ringing_group_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_update_bird_ringing_group_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_update_bird_ringing_group_id"() TO "service_role";


















GRANT ALL ON TABLE "public"."Birds" TO "anon";
GRANT ALL ON TABLE "public"."Birds" TO "authenticated";
GRANT ALL ON TABLE "public"."Birds" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Birds_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Birds_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Birds_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Encounters" TO "anon";
GRANT ALL ON TABLE "public"."Encounters" TO "authenticated";
GRANT ALL ON TABLE "public"."Encounters" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Encounters_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Encounters_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Encounters_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."GroupDataSharing" TO "anon";
GRANT ALL ON TABLE "public"."GroupDataSharing" TO "authenticated";
GRANT ALL ON TABLE "public"."GroupDataSharing" TO "service_role";



GRANT UPDATE ON SEQUENCE "public"."GroupDataSharing_id_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."GroupDataSharing_id_seq" TO "authenticated";
GRANT UPDATE ON SEQUENCE "public"."GroupDataSharing_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Locations" TO "anon";
GRANT ALL ON TABLE "public"."Locations" TO "authenticated";
GRANT ALL ON TABLE "public"."Locations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Locations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Locations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Locations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."RingSequences" TO "anon";
GRANT ALL ON TABLE "public"."RingSequences" TO "authenticated";
GRANT ALL ON TABLE "public"."RingSequences" TO "service_role";



GRANT ALL ON TABLE "public"."RingSequences_Birds" TO "anon";
GRANT ALL ON TABLE "public"."RingSequences_Birds" TO "authenticated";
GRANT ALL ON TABLE "public"."RingSequences_Birds" TO "service_role";



GRANT ALL ON SEQUENCE "public"."RingSequences_Birds_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."RingSequences_Birds_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."RingSequences_Birds_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."RingSequences_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."RingSequences_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."RingSequences_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."RingingGroups" TO "anon";
GRANT ALL ON TABLE "public"."RingingGroups" TO "authenticated";
GRANT ALL ON TABLE "public"."RingingGroups" TO "service_role";



GRANT ALL ON SEQUENCE "public"."RingingGroups_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."RingingGroups_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."RingingGroups_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Sessions" TO "anon";
GRANT ALL ON TABLE "public"."Sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."Sessions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Sessions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Sessions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Sessions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Species" TO "anon";
GRANT ALL ON TABLE "public"."Species" TO "authenticated";
GRANT ALL ON TABLE "public"."Species" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Species_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Species_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Species_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































--
-- Dumped schema changes for auth and storage
--

