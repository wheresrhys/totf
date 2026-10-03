SET check_function_bodies = false;
CREATE OR REPLACE FUNCTION public.core_stats(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text, year_filter smallint DEFAULT NULL::smallint, month_filter smallint DEFAULT NULL::smallint)
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
      re.session_month_squashed,
      COUNT(*) AS encounter_count,
      MIN(re.visit_date) AS first_visit,
      MAX(re.visit_date) AS last_visit,
      MIN(re.max_hatch_year) AS min_max_hatch_year,
      EXTRACT(EPOCH FROM (MAX(re.visit_date)::timestamp - MIN(re.visit_date)::timestamp)) / 86400.0 AS time_span_days
    FROM raw_encounters re
    WHERE re.encounter_id IS NOT NULL
    GROUP BY re.species_id, re.bird_id, re.session_day, re.session_month, re.session_year, re.session_month_squashed
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
        WHEN group_by_time_period = 'month-squashed' THEN spbm.session_month_squashed
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
      WHEN group_by_time_period = 'month-squashed' THEN spbm.session_month_squashed
      ELSE NULL::date
    END
  ),
  session_counts AS (
    -- Count encounters per session — split by species only when the caller asked for
    -- a per-species breakdown, exactly like every other CTE in this function.
    --
    -- This used to group by a bare `re.species_id` regardless of group_by_species
    -- (#1049). A group-wide call therefore produced one row per (species, session)
    -- pair rather than one per session, and the aggregates built on top of it —
    -- max_per_session ("Busiest session"), max_new_per_session and
    -- avg_encounters_per_session — described the busiest/average SPECIES-within-a-
    -- session instead of the session itself. On prod's /summary/sep the 2026 row
    -- reported 39 (its biggest single species) against a real busiest session of 62.
    -- session_count/species_count/bird_count/encounter_count were always computed
    -- straight off raw_encounters and so were never affected; this brings the
    -- per-session columns onto the same footing.
    SELECT
      CASE WHEN group_by_species THEN re.species_id ELSE NULL::bigint END AS species_id,
      re.session_id,
      -- raw_encounters already carries session_day/month/year, precomputed once when
      -- its CTE was materialized. Re-deriving them from re.visit_date here just paid
      -- for the same date_trunc calls a second time, per row.
      re.session_day,
      re.session_month,
      re.session_year,
      re.session_month_squashed,
      COUNT(*) AS encounter_count,
      COUNT(CASE WHEN re.record_type = 'N' THEN 1 END) AS new_encounter_count
    FROM raw_encounters re
    WHERE re.session_id IS NOT NULL
    GROUP BY CASE
      WHEN group_by_species THEN re.species_id
      ELSE NULL::bigint
    END, re.session_id, re.session_day, re.session_month, re.session_year, re.session_month_squashed
  ),
  aggregated_session_counts AS (
    -- Get max encounters per session, per species when grouping by species.
    -- session_counts has already collapsed species_id to NULL when it isn't wanted,
    -- so this CASE is a no-op there — kept so the column's shape is stated at the
    -- point it is joined on below.
    SELECT
      CASE WHEN group_by_species THEN sc.species_id ELSE NULL::bigint END AS species_id,
      CASE
        WHEN group_by_time_period = 'day' THEN sc.session_day
        WHEN group_by_time_period = 'month' THEN sc.session_month
        WHEN group_by_time_period = 'year' THEN sc.session_year
        WHEN group_by_time_period = 'month-squashed' THEN sc.session_month_squashed
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
      WHEN group_by_time_period = 'month-squashed' THEN sc.session_month_squashed
      ELSE NULL::date
    END
  ), session_effort AS (
    SELECT
      re.session_id,
      -- realistically the minimum effort per session is 2 hours
      GREATEST(MAX(re.capture_time) - MIN(re.capture_time), '02:00:00'::interval) AS total_effort
    FROM raw_encounters re
    GROUP BY re.session_id
  ), effort_per_period AS (
    SELECT
      CASE
        WHEN group_by_time_period = 'day' THEN re.session_day
        WHEN group_by_time_period = 'month' THEN re.session_month
        WHEN group_by_time_period = 'year' THEN re.session_year
        WHEN group_by_time_period = 'month-squashed' THEN re.session_month_squashed
        ELSE NULL::date
      END AS time_period,
      SUM(sess_effort.total_effort) AS total_effort,
      SUM(sess_effort.total_effort) / COUNT(DISTINCT re.session_id) AS effort_per_session
    FROM (
      -- session_day/month/year/session_month_squashed come straight off
      -- raw_encounters rather than being re-derived from re.visit_date — same
      -- values, computed once (see session_counts).
      SELECT DISTINCT re.session_id,
            re.session_day,
            re.session_month,
            re.session_year,
            re.session_month_squashed
      FROM raw_encounters as re
    ) re
    JOIN session_effort sess_effort ON re.session_id = sess_effort.session_id
    GROUP BY
      CASE
        WHEN group_by_time_period = 'day' THEN re.session_day
        WHEN group_by_time_period = 'month' THEN re.session_month
        WHEN group_by_time_period = 'year' THEN re.session_year
        WHEN group_by_time_period = 'month-squashed' THEN re.session_month_squashed
        ELSE NULL::date
      END
  )
  SELECT

	  CASE WHEN group_by_species THEN spine.species_name ELSE NULL::text END AS "species_name",
    CASE
      WHEN group_by_time_period = 'day' THEN spine.time_period
      WHEN group_by_time_period = 'month' THEN spine.time_period
      WHEN group_by_time_period = 'year' THEN spine.time_period
      WHEN group_by_time_period = 'month-squashed' THEN spine.time_period
    ELSE NULL::date END AS "time_period",

    -- One count per distinct date with at least one in-hand encounter in the cell.
    -- This used to be wrapped in a `CASE WHEN raw_enc.session_type = 'FULL_GROWN'
    -- THEN ... END`, which made it the odd one out among the count columns below:
    -- species_count/bird_count/encounter_count have always counted encounters from
    -- any session_type (passive resightings being excluded at the row level by
    -- stats_raw_encounters, #874). #1021 dropped the CASE; #1024 then dropped the
    -- session_type column itself, and with it the matching
    -- `session_type = 'FULL_GROWN'` filters that used to sit in the
    -- session_counts/session_effort CTEs above. So total_effort /
    -- effort_per_session / avg_encounters_per_session / max_per_session /
    -- max_new_per_session are now computed over every session in the cell, on the
    -- same session_type-blind basis as session_count — no more pulli-only date
    -- reporting a session_count of 1 against zero effort.
    COALESCE(COUNT(DISTINCT raw_enc.visit_date), 0) AS "session_count",
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
    OR (group_by_time_period = 'month-squashed' AND spine.time_period = raw_enc.session_month_squashed)
    OR (group_by_time_period IS NULL OR group_by_time_period NOT IN ('month', 'year', 'day', 'month-squashed'))
  )
  -- LEFT JOIN stats_per_bird_month bm_stats ON raw_enc.bird_id = bm_stats.bird_id
  LEFT JOIN effort_per_period effort ON
  CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = effort.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = effort.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = effort.time_period
    WHEN group_by_time_period = 'month-squashed' THEN spine.time_period = effort.time_period
    ELSE true
  END
  LEFT JOIN stats_per_species_period agg_sta ON CASE WHEN group_by_species THEN spine.species_id = agg_sta.species_id ELSE true END
  AND
  CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = agg_sta.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = agg_sta.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = agg_sta.time_period
    WHEN group_by_time_period = 'month-squashed' THEN spine.time_period = agg_sta.time_period
    ELSE true
  END
  LEFT JOIN aggregated_session_counts agg_sess ON CASE WHEN group_by_species THEN spine.species_id = agg_sess.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = agg_sess.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = agg_sess.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = agg_sess.time_period
    WHEN group_by_time_period = 'month-squashed' THEN spine.time_period = agg_sess.time_period
    ELSE true
  END
  LEFT JOIN age_bucket_counts abc ON CASE WHEN group_by_species THEN spine.species_id = abc.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = abc.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = abc.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = abc.time_period
    WHEN group_by_time_period = 'month-squashed' THEN spine.time_period = abc.time_period
    ELSE true
  END
  LEFT JOIN encounter_age_bucket_counts eabc ON CASE WHEN group_by_species THEN spine.species_id = eabc.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = eabc.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = eabc.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = eabc.time_period
    WHEN group_by_time_period = 'month-squashed' THEN spine.time_period = eabc.time_period
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
    WHEN group_by_time_period = 'month-squashed' THEN spine.time_period
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
