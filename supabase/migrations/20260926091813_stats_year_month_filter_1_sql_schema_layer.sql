SET check_function_bodies = false;
DROP FUNCTION public.arrivals_stats(species_name_filter text, from_date date, to_date date, ringing_group_filter bigint, group_by_species boolean, group_by_time_period text);
DROP FUNCTION public.biometrics_stats(species_name_filter text, from_date date, to_date date, ringing_group_filter bigint, group_by_species boolean, group_by_time_period text);
DROP FUNCTION public.core_stats(species_name_filter text, from_date date, to_date date, ringing_group_filter bigint, group_by_species boolean, group_by_time_period text);
DROP FUNCTION public.demographics_stats(species_name_filter text, from_date date, to_date date, ringing_group_filter bigint, group_by_species boolean, group_by_time_period text);
DROP FUNCTION public.public_core_stats(species_name_filter text, from_date date, to_date date, ringing_group_filter bigint, group_by_species boolean, group_by_time_period text);
DROP FUNCTION public.stats_bird_age_bucket(IN species_name_filter text, IN from_date date, IN to_date date, IN ringing_group_filter bigint, IN group_by_species boolean, IN group_by_time_period text);
DROP FUNCTION public.stats_bird_first_encounter_of_year(IN species_name_filter text, IN from_date date, IN to_date date, IN ringing_group_filter bigint, IN group_by_species boolean, IN group_by_time_period text);
DROP FUNCTION public.stats_bird_returning_age_bucket(IN species_name_filter text, IN from_date date, IN to_date date, IN ringing_group_filter bigint, IN group_by_species boolean, IN group_by_time_period text);
DROP FUNCTION public.stats_encounter_age_classification(IN species_name_filter text, IN from_date date, IN to_date date, IN ringing_group_filter bigint, IN group_by_species boolean, IN group_by_time_period text);
DROP FUNCTION public.stats_raw_encounters(IN species_name_filter text, IN from_date date, IN to_date date, IN ringing_group_filter bigint);
DROP FUNCTION public.stats_spine(IN species_name_filter text, IN from_date date, IN to_date date, IN ringing_group_filter bigint, IN group_by_species boolean, IN group_by_time_period text);
CREATE FUNCTION public.arrivals_stats(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text, year_filter smallint DEFAULT NULL::smallint, month_filter smallint DEFAULT NULL::smallint)
 RETURNS SETOF public.arrivals_stats_result
 LANGUAGE plpgsql
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
  BEGIN
  RETURN QUERY
  -- jsonb_populate_record is evaluated via CROSS JOIN LATERAL (once per outer
  -- row) rather than as a bare `(...).* ` projection: Postgres does not
  -- common-subexpression-eliminate a repeated function call across SELECT
  -- target-list entries, so `(jsonb_populate_record(...)).* ` gets expanded at
  -- parse time into one independent call PER output column — each re-running
  -- to_jsonb(agg) and jsonb_populate_record from scratch just to extract one
  -- field, multiplying cost by column count for no benefit (see core_stats.sql,
  -- where this was measured at ~90% of total runtime). The LATERAL form still
  -- binds by NAME (see above) but computes the populated record exactly once
  -- per row.
  SELECT r.*
  FROM (
  WITH spine AS (
    SELECT * FROM public.stats_spine(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
  ), bird_first_encounter_of_year AS (
    SELECT * FROM public.stats_bird_first_encounter_of_year(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
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
  CROSS JOIN LATERAL jsonb_populate_record(NULL::public.arrivals_stats_result, to_jsonb(agg)) AS r
  ORDER BY r.species_name ASC, r.time_period ASC;

END;
$function$;
GRANT ALL ON FUNCTION public.arrivals_stats(text, date, date, bigint, boolean, text, smallint, smallint) TO anon;
GRANT ALL ON FUNCTION public.arrivals_stats(text, date, date, bigint, boolean, text, smallint, smallint) TO authenticated;
GRANT ALL ON FUNCTION public.arrivals_stats(text, date, date, bigint, boolean, text, smallint, smallint) TO service_role;
CREATE FUNCTION public.biometrics_stats(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text, year_filter smallint DEFAULT NULL::smallint, month_filter smallint DEFAULT NULL::smallint)
 RETURNS SETOF public.biometrics_stats_result
 LANGUAGE plpgsql
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
  BEGIN
  RETURN QUERY
  -- jsonb_populate_record is evaluated via CROSS JOIN LATERAL (once per outer
  -- row) rather than as a bare `(...).* ` projection: Postgres does not
  -- common-subexpression-eliminate a repeated function call across SELECT
  -- target-list entries, so `(jsonb_populate_record(...)).* ` gets expanded at
  -- parse time into one independent call PER output column — each re-running
  -- to_jsonb(agg) and jsonb_populate_record from scratch just to extract one
  -- field, multiplying cost by column count for no benefit (see core_stats.sql,
  -- where this was measured at ~90% of total runtime). The LATERAL form still
  -- binds by NAME (see above) but computes the populated record exactly once
  -- per row.
  SELECT r.*
  FROM (
  WITH raw_encounters AS (
    SELECT * FROM public.stats_raw_encounters(species_name_filter, from_date, to_date, ringing_group_filter, year_filter, month_filter)
  ), spine AS (
    SELECT * FROM public.stats_spine(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
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
  CROSS JOIN LATERAL jsonb_populate_record(NULL::public.biometrics_stats_result, to_jsonb(agg)) AS r
  ORDER BY r.species_name ASC, r.time_period ASC;

END;
$function$;
GRANT ALL ON FUNCTION public.biometrics_stats(text, date, date, bigint, boolean, text, smallint, smallint) TO anon;
GRANT ALL ON FUNCTION public.biometrics_stats(text, date, date, bigint, boolean, text, smallint, smallint) TO authenticated;
GRANT ALL ON FUNCTION public.biometrics_stats(text, date, date, bigint, boolean, text, smallint, smallint) TO service_role;
CREATE FUNCTION public.core_stats(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text, year_filter smallint DEFAULT NULL::smallint, month_filter smallint DEFAULT NULL::smallint)
 RETURNS SETOF public.core_stats_result
 LANGUAGE plpgsql
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
  BEGIN
  RETURN QUERY
  -- The final projection below is wrapped in jsonb_populate_record rather than
  -- returned as a bare positional SELECT, so it binds to core_stats_result's
  -- columns by NAME instead of ordinal attribute position — see CLAUDE.md's
  -- "Composite-type RETURN QUERY binds by position, not name" section for why
  -- (confirmed empirically while building population_stats: two db:schema:apply
  -- runs on identical schema files produced two different physical attribute
  -- orders for the same composite type).
  -- jsonb_populate_record is evaluated via CROSS JOIN LATERAL (once per outer
  -- row) rather than as a bare `(...).* ` projection: Postgres does not
  -- common-subexpression-eliminate a repeated function call across SELECT
  -- target-list entries, so `(jsonb_populate_record(...)).* ` gets expanded at
  -- parse time into one independent call PER output column — each re-running
  -- to_jsonb(agg) and jsonb_populate_record from scratch just to extract one
  -- field. Measured on prod: this accounted for ~90% of core_stats' total
  -- runtime (462ms of real aggregate work vs. 4457ms total) on a grouped,
  -- ~8640-row x 23-column result. The LATERAL form still binds by NAME (see
  -- above) but computes the populated record exactly once per row.
  SELECT r.*
  FROM (
  -- Base windowed row source and grouping-cell spine, delegated to the shared
  -- stats_raw_encounters / stats_spine utility RPCs (#800) so this logic isn't
  -- duplicated between core_stats and population_stats. Each utility RPC is
  -- called exactly once here and materialized into a local CTE (reused by every
  -- downstream reference below), so the base tables aren't rescanned per use.
  WITH raw_encounters AS (
    SELECT * FROM public.stats_raw_encounters(species_name_filter, from_date, to_date, ringing_group_filter, year_filter, month_filter)
  ), spine AS (
    SELECT * FROM public.stats_spine(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
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
    SELECT * FROM public.stats_encounter_age_classification(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
  ),
  bird_age_bucket AS (
    SELECT * FROM public.stats_bird_age_bucket(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
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
      -- raw_encounters already carries session_day/month/year, precomputed once when
      -- its CTE was materialized. Re-deriving them from re.visit_date here just paid
      -- for the same date_trunc calls a second time, per row.
      re.session_day,
      re.session_month,
      re.session_year,
      COUNT(*) AS encounter_count,
      COUNT(CASE WHEN re.record_type = 'N' THEN 1 END) AS new_encounter_count
    FROM raw_encounters re
    WHERE re.session_id IS NOT NULL
      AND re.session_type = 'FULL_GROWN'
    GROUP BY re.species_id, re.session_id, re.session_day, re.session_month, re.session_year
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
      -- session_day/month/year come straight off raw_encounters rather than being
      -- re-derived from re.visit_date — same values, computed once (see session_counts).
      SELECT DISTINCT re.session_id,
            re.session_day,
            re.session_month,
            re.session_year
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
  CROSS JOIN LATERAL jsonb_populate_record(NULL::public.core_stats_result, to_jsonb(agg)) AS r
  ORDER BY r.species_name ASC, r.time_period ASC;

END;
$function$;
GRANT ALL ON FUNCTION public.core_stats(text, date, date, bigint, boolean, text, smallint, smallint) TO anon;
GRANT ALL ON FUNCTION public.core_stats(text, date, date, bigint, boolean, text, smallint, smallint) TO authenticated;
GRANT ALL ON FUNCTION public.core_stats(text, date, date, bigint, boolean, text, smallint, smallint) TO service_role;
CREATE FUNCTION public.demographics_stats(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text, year_filter smallint DEFAULT NULL::smallint, month_filter smallint DEFAULT NULL::smallint)
 RETURNS SETOF public.demographics_stats_result
 LANGUAGE plpgsql
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
  BEGIN
  RETURN QUERY
  -- jsonb_populate_record is evaluated via CROSS JOIN LATERAL (once per outer
  -- row) rather than as a bare `(...).* ` projection: Postgres does not
  -- common-subexpression-eliminate a repeated function call across SELECT
  -- target-list entries, so `(jsonb_populate_record(...)).* ` gets expanded at
  -- parse time into one independent call PER output column — each re-running
  -- to_jsonb(agg) and jsonb_populate_record from scratch just to extract one
  -- field, multiplying cost by column count for no benefit (see core_stats.sql,
  -- where this was measured at ~90% of total runtime). The LATERAL form still
  -- binds by NAME (see above) but computes the populated record exactly once
  -- per row.
  SELECT r.*
  FROM (
  WITH spine AS (
    SELECT * FROM public.stats_spine(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
  ), encounter_age_classification AS (
    SELECT * FROM public.stats_encounter_age_classification(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
  ), bird_age_bucket AS (
    SELECT * FROM public.stats_bird_age_bucket(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
  ), bird_returning_age_bucket AS (
    SELECT * FROM public.stats_bird_returning_age_bucket(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
  ),
  -- Bird-level bucket counts (context columns + the new_young_bird_count copy).
  -- Mirrors core_stats' age_bucket_counts, restricted to the columns this RPC
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
      -- derivation to core_stats.new_young_bird_count.
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
  -- source in this RPC that is NOT limited to the query window —
  -- new_adult_bird_count needs a bird's full history with this group ("is this
  -- cell's year the bird's first-ever year with the group?"), which a windowed
  -- source can't answer. Group scoping mirrors stats_raw_encounters' pattern so a
  -- bird's history under a DIFFERENT group never counts as history with this one.
  lifetime_encounters AS (
    SELECT
      e.bird_id,
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
  -- Resolve the calendar year each (species, time_period) cell represents, for the
  -- new-adult classification. period_year resolution rule: use the cell's
  -- own time_period when the query is grouped by day/month/year (EXTRACT(YEAR) of
  -- the truncated date is the calendar year); when ungrouped (time_period IS
  -- NULL), fall back to the latest visit date actually present in the cell. This
  -- column is primarily meaningful under a time-period grouping; the fallback
  -- merely keeps it well-defined and non-throwing in the ungrouped mode rather
  -- than special-casing.
  cell_period_year AS (
    SELECT
      eac.species_id,
      eac.time_period,
      EXTRACT(YEAR FROM COALESCE(eac.time_period, MAX(eac.visit_date)))::int AS period_year
    FROM encounter_age_classification eac
    GROUP BY eac.species_id, eac.time_period
  ),
  -- Flag each adult-bucketed bird (per cell) as a new adult or not: new_adult iff
  -- the bird's first-ever-with-group year equals this cell's period_year. Only
  -- bab.age_bucket = 'adult' birds are considered, so new_adult_bird_count is a
  -- subset of adult_bird_count (the rest of the adult cohort is simply unlabelled
  -- — #856 removed the first_summer/old_timers arms that used to name it). IS NOT
  -- DISTINCT FROM makes the cell join NULL-safe for the ungrouped case
  -- (species_id / time_period are NULL). The LEFT JOIN keeps every adult bird
  -- represented exactly once even in the (data-impossible) event a lifetime row is
  -- missing — such a bird reads as not-new, since NULL = period_year is not true.
  adult_age_split AS (
    SELECT
      bab.species_id,
      bab.time_period,
      bfy.first_year = py.period_year AS is_new_adult
    FROM bird_age_bucket bab
    JOIN cell_period_year py
      ON py.species_id IS NOT DISTINCT FROM bab.species_id
     AND py.time_period IS NOT DISTINCT FROM bab.time_period
    LEFT JOIN bird_first_year bfy ON bfy.bird_id = bab.bird_id
    WHERE bab.age_bucket = 'adult'
  ),
  adult_split_counts AS (
    SELECT
      aas.species_id,
      aas.time_period,
      COUNT(*) FILTER (WHERE aas.is_new_adult) AS new_adult_bird_count
    FROM adult_age_split aas
    GROUP BY aas.species_id, aas.time_period
  ),
  -- Returning-age subsets of adult_bird_count (#843). Each adult-bucketed bird in
  -- a cell carries exactly one bucket from stats_bird_returning_age_bucket, or
  -- NULL when its period-relative proven age is 0 (not yet proven to have
  -- returned). So these four counts are mutually exclusive but NOT exhaustive over
  -- the adult cohort: they sum to adult_bird_count MINUS this cell's
  -- proven_age-0 adults, not to adult_bird_count itself.
  returning_age_counts AS (
    SELECT
      brab.species_id,
      brab.time_period,
      COUNT(*) FILTER (WHERE brab.returning_age_bucket = '1') AS returning_age_1_bird_count,
      COUNT(*) FILTER (WHERE brab.returning_age_bucket = '2') AS returning_age_2_bird_count,
      COUNT(*) FILTER (WHERE brab.returning_age_bucket = '3_plus') AS returning_age_3_plus_bird_count,
      COUNT(*) FILTER (WHERE brab.returning_age_bucket = 'new_unknown_age') AS returning_new_unknown_age_bird_count
    FROM bird_returning_age_bucket brab
    GROUP BY brab.species_id, brab.time_period
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

    -- Subset of adult_bird_count: adults first encountered by this group in this
    -- cell's own period_year.
    COALESCE(asc2.new_adult_bird_count, 0) AS "new_adult_bird_count",

    -- Young-trends encounter-level counts; 3J-only slice of juv_enc_count + New variants.
    COALESCE(eabc.postjuv_juv_enc_count, 0) AS "postjuv_juv_enc_count",
    COALESCE(eabc.new_postjuv_juv_enc_count, 0) AS "new_postjuv_juv_enc_count",
    COALESCE(eabc.new_postjuv_enc_count, 0) AS "new_postjuv_enc_count",

    -- Returning-age subsets of adult_bird_count; these four sum to
    -- adult_bird_count MINUS this cell's proven_age-0 adults, NOT to
    -- adult_bird_count (see returning_age_counts above).
    COALESCE(rac.returning_age_1_bird_count, 0) AS "returning_age_1_bird_count",
    COALESCE(rac.returning_age_2_bird_count, 0) AS "returning_age_2_bird_count",
    COALESCE(rac.returning_age_3_plus_bird_count, 0) AS "returning_age_3_plus_bird_count",
    COALESCE(rac.returning_new_unknown_age_bird_count, 0) AS "returning_new_unknown_age_bird_count"

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
  LEFT JOIN returning_age_counts rac ON CASE WHEN group_by_species THEN spine.species_id = rac.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = rac.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = rac.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = rac.time_period
    ELSE true
  END
  ) AS agg
  CROSS JOIN LATERAL jsonb_populate_record(NULL::public.demographics_stats_result, to_jsonb(agg)) AS r
  ORDER BY r.species_name ASC, r.time_period ASC;

END;
$function$;
GRANT ALL ON FUNCTION public.demographics_stats(text, date, date, bigint, boolean, text, smallint, smallint) TO anon;
GRANT ALL ON FUNCTION public.demographics_stats(text, date, date, bigint, boolean, text, smallint, smallint) TO authenticated;
GRANT ALL ON FUNCTION public.demographics_stats(text, date, date, bigint, boolean, text, smallint, smallint) TO service_role;
CREATE FUNCTION public.public_core_stats(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text, year_filter smallint DEFAULT NULL::smallint, month_filter smallint DEFAULT NULL::smallint)
 RETURNS SETOF public.core_stats_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
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
    group_by_time_period,
    year_filter,
    month_filter
  );
END;
$function$;
GRANT ALL ON FUNCTION public.public_core_stats(text, date, date, bigint, boolean, text, smallint, smallint) TO anon;
GRANT ALL ON FUNCTION public.public_core_stats(text, date, date, bigint, boolean, text, smallint, smallint) TO authenticated;
GRANT ALL ON FUNCTION public.public_core_stats(text, date, date, bigint, boolean, text, smallint, smallint) TO service_role;
CREATE FUNCTION public.stats_bird_age_bucket(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text, year_filter smallint DEFAULT NULL::smallint, month_filter smallint DEFAULT NULL::smallint)
 RETURNS TABLE(bird_id bigint, species_id bigint, time_period date, has_new boolean, age_bucket text)
 LANGUAGE sql
 STABLE
AS $function$
  WITH encounter_age_classification AS (
    SELECT * FROM public.stats_encounter_age_classification(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
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
$function$;
GRANT ALL ON FUNCTION public.stats_bird_age_bucket(text, date, date, bigint, boolean, text, smallint, smallint) TO anon;
GRANT ALL ON FUNCTION public.stats_bird_age_bucket(text, date, date, bigint, boolean, text, smallint, smallint) TO authenticated;
GRANT ALL ON FUNCTION public.stats_bird_age_bucket(text, date, date, bigint, boolean, text, smallint, smallint) TO service_role;
CREATE FUNCTION public.stats_bird_first_encounter_of_year(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text, year_filter smallint DEFAULT NULL::smallint, month_filter smallint DEFAULT NULL::smallint)
 RETURNS TABLE(bird_id bigint, species_id bigint, time_period date, arrival_bucket text)
 LANGUAGE sql
 STABLE
AS $function$
  WITH encounter_age_classification AS (
    SELECT * FROM public.stats_encounter_age_classification(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
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
$function$;
GRANT ALL ON FUNCTION public.stats_bird_first_encounter_of_year(text, date, date, bigint, boolean, text, smallint, smallint) TO anon;
GRANT ALL ON FUNCTION public.stats_bird_first_encounter_of_year(text, date, date, bigint, boolean, text, smallint, smallint) TO authenticated;
GRANT ALL ON FUNCTION public.stats_bird_first_encounter_of_year(text, date, date, bigint, boolean, text, smallint, smallint) TO service_role;
CREATE FUNCTION public.stats_bird_returning_age_bucket(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text, year_filter smallint DEFAULT NULL::smallint, month_filter smallint DEFAULT NULL::smallint)
 RETURNS TABLE(bird_id bigint, species_id bigint, time_period date, returning_age_bucket text)
 LANGUAGE sql
 STABLE
AS $function$
  WITH encounter_age_classification AS (
    SELECT * FROM public.stats_encounter_age_classification(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
  ), bird_age_bucket AS (
    SELECT * FROM public.stats_bird_age_bucket(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
  ),
  -- Resolve the calendar year each (species, time_period) cell represents.
  -- Identical rule to demographics_stats' own cell_period_year CTE (keep the two
  -- in sync by hand): use the cell's own time_period when grouped by day/month/
  -- year, else fall back to the latest visit date present in the cell.
  cell_period_year AS (
    SELECT
      eac.species_id,
      eac.time_period,
      EXTRACT(YEAR FROM COALESCE(eac.time_period, MAX(eac.visit_date)))::int AS period_year
    FROM encounter_age_classification eac
    GROUP BY eac.species_id, eac.time_period
  ),
  -- Every adult-bucketed bird in every cell, carrying that cell's period_year.
  --
  -- This used to be a plain JOIN of bird_age_bucket to cell_period_year with
  -- `py.species_id IS NOT DISTINCT FROM bab.species_id AND py.time_period IS NOT
  -- DISTINCT FROM bab.time_period` (NULL-safe, because both columns are NULL on
  -- EVERY row in the ungrouped case). It is now a NULL-safe window PARTITION over
  -- a merged stream of the same two relations — same rows out, no join at all.
  -- Why (plan stability, 2026-09-20; performance only, every classification rule
  -- above is unchanged and output is byte-identical):
  --
  --   * IS NOT DISTINCT FROM is neither hashable nor mergeable, so that join could
  --     only ever be a NESTED LOOP with a join filter: O(cells x adult-bird-cells)
  --     comparisons, nearly all of them discarded. Measured on a synthetic 164k-
  --     encounter / 4-group / 4,000-bird / 60-species fixture, the group-wide
  --     monthly shape evaluated 111 x 41,143 pairs to emit 41,143 rows.
  --   * Worse, its row estimate is chronically, unfixably wrong — both inputs are
  --     SQL-function-backed relations and the IS NOT DISTINCT FROM clauses carry no
  --     usable selectivity, so the loop is planned at `rows=1` when it really
  --     returns tens of thousands (this is the "adult_birds is estimated at 1 row"
  --     note in CLAUDE.md). At that estimate the planner is free to put
  --     cell_period_year on the INNER side WITHOUT a Materialize, re-running its
  --     whole aggregate once per outer row. Today's data happens not to trigger
  --     that; a small selectivity change upstream does. Reproduced by applying the
  --     (unshipped) ringing_group_filter pushdown to stats_raw_encounters: the
  --     species+month shape went 21ms -> 383ms, with the cell_period_year
  --     GroupAggregate showing `loops=2689` in EXPLAIN ANALYZE. The underestimate
  --     gets worse, not better, as more groups land in prod.
  --   * And the catastrophic side was already reachable WITHOUT that pushdown, by
  --     the most ordinary route there is: demographics_stats is LANGUAGE plpgsql,
  --     so its RETURN QUERY statement is plan-cached per backend and switches to a
  --     GENERIC plan on the 6th execution in a session — a plan built with no
  --     parameter values at all, i.e. the worst estimate available. On the fixture
  --     above, group-wide monthly demographics_stats ran ~670ms for executions 1-5
  --     (custom plans) and 77,000ms from execution 6 onward. PostgREST pools
  --     connections, so a busy backend reaches execution 6 routinely. That cliff is
  --     the real motivation here; the pushdown experiment merely made it easy to
  --     reproduce on demand.
  --
  -- The replacement has no join to mis-plan: cell_events UNION ALLs the one
  -- period_year row per cell (cell_event_ord 0) with the adult-bird rows that need
  -- it (cell_event_ord 1) on the same (species_id, time_period) axis, and a single
  -- MAX(...) OVER (PARTITION BY species_id, time_period) hands every bird row its
  -- cell's period_year. PARTITION BY groups NULLs together, so this is NULL-safe in
  -- exactly the way IS NOT DISTINCT FROM was, with no sentinel value needed — and
  -- because bird rows carry a NULL period_year they can never perturb the MAX.
  -- (Same merge-the-streams trick as the #932 history pass below, applied to the
  -- cell axis instead of the year axis.) Cost is one sort of (cells + adult-bird-
  -- cells) rows, which no row estimate can turn quadratic. Measured on the fixture
  -- above: species+month 21ms -> 12.6ms good-estimate and 383ms -> 9.9ms under the
  -- induced bad estimate; group-wide month 301ms -> 144ms; end-to-end
  -- demographics_stats group-wide month 670ms -> 520ms on a custom plan and
  -- 77,000ms -> 1,110ms on the generic plan. Note the shape of that last pair: the
  -- rewrite does not make the generic plan as good as the custom one, it makes the
  -- gap between them a factor of 2 instead of a factor of 115.
  --
  -- period_year IS NOT NULL restores the old inner join's drop semantics for an
  -- adult-bird cell with no cell_period_year row of its own. Unreachable —
  -- bird_age_bucket and cell_period_year are grouped from the same
  -- encounter_age_classification rows, so every cell in one exists in the other —
  -- but it keeps the rewrite exactly equivalent rather than merely equivalent in
  -- practice.
  cell_events AS (
    SELECT
      py.species_id,
      py.time_period,
      0 AS cell_event_ord,
      NULL::bigint AS bird_id,
      py.period_year
    FROM cell_period_year py
    UNION ALL
    SELECT
      bab.species_id,
      bab.time_period,
      1,
      bab.bird_id,
      NULL::int
    FROM bird_age_bucket bab
    WHERE bab.age_bucket = 'adult'
      AND bab.bird_id IS NOT NULL
  ),
  adult_birds AS (
    SELECT ce.bird_id, ce.species_id, ce.time_period, ce.period_year
    FROM (
      SELECT
        c.bird_id,
        c.species_id,
        c.time_period,
        c.cell_event_ord,
        MAX(c.period_year) OVER (PARTITION BY c.species_id, c.time_period) AS period_year
      FROM cell_events c
    ) ce
    WHERE ce.cell_event_ord = 1
      AND ce.period_year IS NOT NULL
  ),
  -- Unwindowed lifetime history for every adult bird above, scoped to
  -- ringing_group_filter but IGNORING from_date/to_date — a period-relative age
  -- can't be answered from a windowed source. Mirrors (and extends, with
  -- max_hatch_year/min_hatch_year) demographics_stats' own lifetime_encounters CTE,
  -- but pre-collapsed to ONE ROW PER (bird, calendar year): each year's own
  -- contribution to the three "to date" values, ready to be accumulated once per
  -- bird by the window pass below. Both hatch-year columns are NOT NULL, so a
  -- non-empty year group always yields a non-null min/bool_or.
  lifetime_encounters_by_year AS (
    SELECT
      e.bird_id,
      EXTRACT(YEAR FROM sess.visit_date)::int AS enc_year,
      COUNT(*) AS year_encounter_count,
      MIN(e.max_hatch_year) AS year_min_max_hatch_year,
      bool_or(e.min_hatch_year <> 0) AS year_was_precisely_aged
    FROM public."Encounters" e
    JOIN public."Sessions" sess ON e.session_id = sess.id
    WHERE (ringing_group_filter IS NULL OR sess.ringing_group_id = ringing_group_filter)
      AND e.bird_id IN (SELECT DISTINCT ab.bird_id FROM adult_birds ab)
    GROUP BY e.bird_id, EXTRACT(YEAR FROM sess.visit_date)::int
  ),
  -- One merged stream per bird: its per-year history rows (event_ord 0) and the
  -- cells that need to read that history (event_ord 1), both keyed on a year.
  -- History rows carry no cell identity; cell rows carry no history payload — the
  -- NULL payload is what makes a cell row invisible to the running aggregates.
  bird_year_events AS (
    SELECT
      ley.bird_id,
      ley.enc_year AS event_year,
      0 AS event_ord,
      NULL::bigint AS species_id,
      NULL::date AS time_period,
      ley.year_encounter_count,
      ley.year_min_max_hatch_year,
      ley.year_was_precisely_aged
    FROM lifetime_encounters_by_year ley
    UNION ALL
    SELECT
      ab.bird_id,
      ab.period_year,
      1,
      ab.species_id,
      ab.time_period,
      NULL::bigint,
      NULL::smallint,
      NULL::boolean
    FROM adult_birds ab
  ),
  -- Per (bird, cell): that bird's history as it stood at the end of the cell's
  -- period_year, read straight off the running window aggregates. Ordering by
  -- (event_year, event_ord) puts a year's history row before any cell row for that
  -- same year, so a cell's frame covers exactly enc_year <= period_year.
  bird_history_to_date AS (
    SELECT
      ev.bird_id,
      ev.species_id,
      ev.time_period,
      ev.event_ord,
      COALESCE(SUM(ev.year_encounter_count) OVER w, 0) AS encounters_to_date,
      ev.event_year - MIN(ev.year_min_max_hatch_year) OVER w AS period_relative_proven_age,
      COALESCE(bool_or(ev.year_was_precisely_aged) OVER w, FALSE) AS was_ever_precisely_aged_to_date
    FROM bird_year_events ev
    WINDOW w AS (PARTITION BY ev.bird_id ORDER BY ev.event_year, ev.event_ord
                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
  )
  SELECT
    h.bird_id,
    h.species_id,
    h.time_period,
    CASE
      WHEN h.period_relative_proven_age IS NULL OR h.period_relative_proven_age <= 0 THEN NULL
      WHEN h.encounters_to_date = 1
        AND NOT h.was_ever_precisely_aged_to_date
        AND h.period_relative_proven_age = 1 THEN 'new_unknown_age'
      WHEN h.period_relative_proven_age = 1 THEN '1'
      WHEN h.period_relative_proven_age = 2 THEN '2'
      ELSE '3_plus'
    END AS returning_age_bucket
  FROM bird_history_to_date h
  -- Only the cell rows are output; the history rows existed solely to feed the
  -- window frames above.
  WHERE h.event_ord = 1;
$function$;
GRANT ALL ON FUNCTION public.stats_bird_returning_age_bucket(text, date, date, bigint, boolean, text, smallint, smallint) TO anon;
GRANT ALL ON FUNCTION public.stats_bird_returning_age_bucket(text, date, date, bigint, boolean, text, smallint, smallint) TO authenticated;
GRANT ALL ON FUNCTION public.stats_bird_returning_age_bucket(text, date, date, bigint, boolean, text, smallint, smallint) TO service_role;
CREATE FUNCTION public.stats_encounter_age_classification(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text, year_filter smallint DEFAULT NULL::smallint, month_filter smallint DEFAULT NULL::smallint)
 RETURNS TABLE(encounter_id bigint, bird_id bigint, record_type text, age_code smallint, is_juv boolean, visit_date date, species_id bigint, time_period date, age_bucket text)
 LANGUAGE sql
 STABLE
AS $function$
  WITH raw_encounters AS (
    SELECT * FROM public.stats_raw_encounters(species_name_filter, from_date, to_date, ringing_group_filter, year_filter, month_filter)
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
$function$;
GRANT ALL ON FUNCTION public.stats_encounter_age_classification(text, date, date, bigint, boolean, text, smallint, smallint) TO anon;
GRANT ALL ON FUNCTION public.stats_encounter_age_classification(text, date, date, bigint, boolean, text, smallint, smallint) TO authenticated;
GRANT ALL ON FUNCTION public.stats_encounter_age_classification(text, date, date, bigint, boolean, text, smallint, smallint) TO service_role;
CREATE FUNCTION public.stats_raw_encounters(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, year_filter smallint DEFAULT NULL::smallint, month_filter smallint DEFAULT NULL::smallint)
 RETURNS TABLE(species_id bigint, species_name text, bird_id bigint, ring_no text, encounter_id bigint, weight real, wing_length smallint, record_type text, age_code smallint, is_juv boolean, session_id bigint, visit_date date, session_type text, max_hatch_year smallint, capture_time time without time zone, session_day date, session_month date, session_year date)
 LANGUAGE sql
 STABLE
AS $function$
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
    -- visit_date is already a DATE, so truncating it to a day is the identity — and
    -- the ::timestamp casts on month/year are load-bearing, not cosmetic. Postgres has
    -- no date_trunc(text, date) overload, so a bare `date_trunc('month', sess.visit_date)`
    -- resolves to date_trunc(text, timestamptz), which is STABLE (timezone-dependent)
    -- rather than IMMUTABLE and measurably slower to evaluate per row. Casting to
    -- timestamp picks the IMMUTABLE overload. Verified identical output for every
    -- session date in the seed data; it is also strictly more deterministic, since the
    -- timestamptz form would depend on the connection's TimeZone setting.
    sess.visit_date AS session_day,
    date_trunc('month', sess.visit_date::timestamp)::DATE AS session_month,
    date_trunc('year', sess.visit_date::timestamp)::DATE AS session_year
  FROM public."Species" sp
  JOIN public."Birds" b ON sp.id = b.species_id
  -- Resighting/recovery record_types (public.resighting_record_type: U/F/D) are
  -- passive encounters with no bird in the hand, and must not surface in any stats
  -- RPC (#874). Filtering in the LEFT JOIN's ON clause (not the WHERE) preserves the
  -- NULL-preserving semantics: a bird whose only encounters are resightings still
  -- appears with encounter_id IS NULL rather than being dropped entirely.
  --
  -- The exclusion list is spelled as an `IN (SELECT unnest(...))` sublink rather than
  -- the equivalent `= ANY (enum_range(...)::text[])` array expression on purpose.
  -- enum_range() is STABLE, not IMMUTABLE, so Postgres cannot constant-fold it at plan
  -- time; written inline as an array it is re-evaluated (catalog lookups and all) once
  -- PER ROW of Encounters. Measured on a 40k-row Encounters table that cost 81,782
  -- shared buffer hits and ~36-56ms for the scan, versus 1,601 hits and ~7ms with the
  -- value resolved once. The sublink form plans as a single hashed SubPlan evaluated
  -- once per query instead. Because every stats RPC derives this row source (and
  -- core_stats derives it 4x via its utility-RPC layering), that per-row cost was ~29%
  -- of core_stats' total runtime. Do NOT "simplify" this back to the array form, and
  -- keep the enum itself as the source of truth — don't inline a literal 'U'/'F'/'D'
  -- list here (see CLAUDE.md on keeping RESIGHTING_RECORD_TYPES in sync by hand).
  LEFT JOIN public."Encounters" e ON b.id = e.bird_id
    AND NOT (e.record_type IN (SELECT unnest(enum_range(NULL::public.resighting_record_type)::text[])))
  LEFT JOIN public."Sessions" sess ON e.session_id = sess.id
  WHERE (from_date IS NULL OR sess.visit_date >= from_date)
   AND (to_date IS NULL OR sess.visit_date <= to_date)
   AND (species_name_filter IS NULL OR sp.species_name = species_name_filter)
   AND (ringing_group_filter IS NULL OR sess.ringing_group_id = ringing_group_filter)
   AND (year_filter IS NULL OR EXTRACT(YEAR FROM sess.visit_date) = year_filter)
   AND (month_filter IS NULL OR EXTRACT(MONTH FROM sess.visit_date) = month_filter);
$function$;
GRANT ALL ON FUNCTION public.stats_raw_encounters(text, date, date, bigint, smallint, smallint) TO anon;
GRANT ALL ON FUNCTION public.stats_raw_encounters(text, date, date, bigint, smallint, smallint) TO authenticated;
GRANT ALL ON FUNCTION public.stats_raw_encounters(text, date, date, bigint, smallint, smallint) TO service_role;
CREATE FUNCTION public.stats_spine(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text, year_filter smallint DEFAULT NULL::smallint, month_filter smallint DEFAULT NULL::smallint)
 RETURNS TABLE(species_id bigint, species_name text, time_period date)
 LANGUAGE sql
 STABLE
AS $function$
  WITH raw_encounters AS (
    SELECT * FROM public.stats_raw_encounters(species_name_filter, from_date, to_date, ringing_group_filter, year_filter, month_filter)
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
      -- Field-observation-only sessions are passive resightings (#874): their dates
      -- must not stretch the month/year spine's min..max range. session_type is NOT
      -- NULL (default 'FULL_GROWN'), so a plain <> is safe here.
      AND sess.session_type <> 'FIELD_OBSERVATION'
      AND (year_filter IS NULL OR EXTRACT(YEAR FROM sess.visit_date) = year_filter)
      -- month_filter is deliberately applied here too, for consistency with
      -- from_date/to_date/year_filter's treatment above — but note the accepted
      -- edge case documented in CLAUDE.md: combined with group_by_time_period =
      -- 'month' this narrows min/max to month_filter-matching dates without making
      -- the dense month generate_series below skip non-matching months in between.
      -- Combining year-grouping with month_filter is unaffected (year-truncation
      -- smooths over the narrowing); day-grouping is unaffected (sparse, driven off
      -- raw_encounters' actual distinct days).
      AND (month_filter IS NULL OR EXTRACT(MONTH FROM sess.visit_date) = month_filter)
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
$function$;
GRANT ALL ON FUNCTION public.stats_spine(text, date, date, bigint, boolean, text, smallint, smallint) TO anon;
GRANT ALL ON FUNCTION public.stats_spine(text, date, date, bigint, boolean, text, smallint, smallint) TO authenticated;
GRANT ALL ON FUNCTION public.stats_spine(text, date, date, bigint, boolean, text, smallint, smallint) TO service_role;
