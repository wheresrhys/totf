SET check_function_bodies = false;
DROP FUNCTION public.stats_raw_encounters(IN species_name_filter text, IN from_date date, IN to_date date, IN ringing_group_filter bigint, IN year_filter smallint, IN month_filter smallint);
ALTER TABLE public."Encounters" DROP CONSTRAINT encounters_bird_id_session_id_unique;
ALTER TABLE public."Sessions" DROP CONSTRAINT "Sessions_session_type_check";
ALTER TABLE public."Sessions" DROP CONSTRAINT "Sessions_visit_date_location_id_key";
ALTER TABLE public."Sessions" DROP COLUMN session_type;
ALTER TABLE public."Sessions" DROP CONSTRAINT sessions_location_id_fkey;
DROP INDEX public.idx_sessions_location_id;
DROP TRIGGER trigger_trg_set_session_generated_fields ON public."Sessions";
DROP FUNCTION public.trg_set_session_generated_fields();
ALTER TABLE public."Sessions" DROP COLUMN location_id;
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
      re.session_month_squashed,
      COUNT(*) AS encounter_count,
      COUNT(CASE WHEN re.record_type = 'N' THEN 1 END) AS new_encounter_count
    FROM raw_encounters re
    WHERE re.session_id IS NOT NULL
    GROUP BY re.species_id, re.session_id, re.session_day, re.session_month, re.session_year, re.session_month_squashed
  ),
  aggregated_session_counts AS (
    -- Get max encounters per session per species
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
CREATE FUNCTION public.stats_raw_encounters(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, year_filter smallint DEFAULT NULL::smallint, month_filter smallint DEFAULT NULL::smallint)
 RETURNS TABLE(species_id bigint, species_name text, bird_id bigint, ring_no text, encounter_id bigint, weight real, wing_length smallint, record_type text, age_code smallint, is_juv boolean, session_id bigint, visit_date date, max_hatch_year smallint, capture_time time without time zone, session_day date, session_month date, session_year date, session_month_squashed date)
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
    date_trunc('year', sess.visit_date::timestamp)::DATE AS session_year,
    -- Year-agnostic join key for the 'month-squashed' group_by_time_period mode
    -- (#996): buckets a row by calendar month alone, using the same 2000-<mm>-01
    -- sentinel-year convention app/lib/month-totals.ts's synthesizeZeroStats
    -- already established, so spine rows and raw-encounter rows join on equal
    -- dates. make_date() and EXTRACT(MONTH FROM date) are both IMMUTABLE (unlike
    -- date_trunc(text, timestamptz) above), so this needs no timestamp cast.
    CASE
      WHEN sess.visit_date IS NULL THEN NULL
      ELSE make_date(2000, EXTRACT(MONTH FROM sess.visit_date)::int, 1)
    END AS session_month_squashed
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
CREATE OR REPLACE FUNCTION public.stats_spine(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text, year_filter smallint DEFAULT NULL::smallint, month_filter smallint DEFAULT NULL::smallint)
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
    -- Every session date in the query window bounds the spine. This used to
    -- exclude 'FIELD_OBSERVATION' sessions (#874) so a passive-resighting-only
    -- date couldn't stretch the month/year range past the real sessions; the
    -- exclusion went in #1021 and the session_type column it read is gone
    -- altogether as of #1024. Passive encounters are excluded at the row level
    -- by stats_raw_encounters' resighting-record_type filter, which is the
    -- single durable fix point.
    SELECT
      MIN(sess.visit_date) AS min_date,
      MAX(sess.visit_date) AS max_date
    FROM public."Sessions" as sess
    WHERE (from_date IS NULL OR sess.visit_date >= from_date)
      AND (to_date IS NULL OR sess.visit_date <= to_date)
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

    -- 'month-squashed' (#996): a dense, always-12-row spine — one row per
    -- calendar month (Jan-Dec), independent of any actual session data —
    -- unlike the month/year branches above, which are dense only within the
    -- group's own min..max date range. Unconditional generate_series(1, 12),
    -- deliberately not gated on session_date_range like the branches above, so
    -- the mode returns all 12 months even when the group's history only spans
    -- one calendar month across every year. Dates use the same 2000-<mm>-01
    -- sentinel-year convention as stats_raw_encounters.session_month_squashed.
    SELECT make_date(2000, m, 1) AS time_period
    FROM generate_series(1, 12) AS m
    WHERE group_by_time_period = 'month-squashed'

    UNION ALL

    SELECT NULL::date
    WHERE group_by_time_period IS NULL OR group_by_time_period NOT IN ('month', 'year', 'day', 'month-squashed')
  )
  SELECT s.species_id, s.species_name, p.time_period
  FROM species_spine s
  CROSS JOIN period_spine p;
$function$;
CREATE OR REPLACE FUNCTION public.trg_encounters_refresh_bird_proven_age()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      EXTRACT(YEAR FROM MAX(e.visit_date))::integer - MIN(e.max_hatch_year)
    FROM "public"."Encounters" e
    WHERE e.bird_id = v_bird_id),
    0
  )
  WHERE b.id = v_bird_id;

  IF TG_OP = 'UPDATE'
  AND OLD.bird_id IS DISTINCT FROM NEW.bird_id THEN
    UPDATE "public"."Birds" b
    SET proven_age = COALESCE(
      (SELECT
        EXTRACT(YEAR FROM MAX(e.visit_date))::integer - MIN(e.max_hatch_year)
      FROM "public"."Encounters" e
      WHERE e.bird_id = OLD.bird_id),
      0
    )
    WHERE b.id = OLD.bird_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
CREATE OR REPLACE FUNCTION public.trg_set_encounter_generated_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  SELECT
    l."ringing_group_id",
    CASE
				WHEN NEW.age_code % 2 = 0 THEN EXTRACT(
					YEAR
					FROM
						NEW.visit_date
				)::INTEGER - (NEW.age_code / 2 - 1)
				WHEN NEW.age_code % 2 = 1
				AND NEW.age_code > 1 THEN EXTRACT(
					YEAR
					FROM
						NEW.visit_date
				)::INTEGER - ((NEW.age_code - 3) / 2)
				ELSE EXTRACT(
					YEAR
					FROM
						NEW.visit_date
				)::INTEGER
			END AS max_hatch_year,
			CASE
				WHEN NEW.age_code % 2 = 0 THEN 0
				WHEN NEW.age_code % 2 = 1
				AND NEW.age_code > 1 THEN EXTRACT(
					YEAR
					FROM
						NEW.visit_date
				)::INTEGER - ((NEW.age_code - 3) / 2)
				ELSE EXTRACT(
					YEAR
					FROM
						NEW.visit_date
				)::INTEGER
			END AS min_hatch_year
  INTO NEW."ringing_group_id", NEW."max_hatch_year", NEW."min_hatch_year"
  FROM "public"."Locations" l
  WHERE l."id" = NEW."location_id";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Location % not found', NEW."location_id";
  END IF;

  -- Update Birds.last_encountered_timestamp when encounter timestamp is newer
  UPDATE "public"."Birds" b
  SET last_encountered_timestamp = (NEW.visit_date + COALESCE(NEW.capture_time, '00:00:00'::time))
  WHERE b.id = NEW.bird_id
    AND (b.last_encountered_timestamp IS NULL OR (NEW.visit_date + COALESCE(NEW.capture_time, '00:00:00'::time)) > b.last_encountered_timestamp);

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE TRIGGER trigger_trg_set_encounter_generated_fields BEFORE INSERT OR UPDATE OF location_id, visit_date, capture_time ON public."Encounters" FOR EACH ROW EXECUTE FUNCTION public.trg_set_encounter_generated_fields();

-- ===========================================================================
-- HAND-WRITTEN BACKFILL DML — everything above this marker is generated DDL
-- from `npm run db:schema:apply` and is unmodified. Declarative sync only ever
-- emits DDL, so a shape change that needs existing rows migrated gets its
-- backfill written by hand (see supabase/CLAUDE.md, "Schema files").
--
-- Collapse Sessions down to one row per (ringing_group_id, visit_date). Until
-- now a Session was (visit_date, location_id, session_type), so one group-day
-- could hold several Session rows — one per site visited, and one per
-- FULL_GROWN / PULLI / FIELD_OBSERVATION bucket within a site. Both of those
-- columns are dropped by the DDL above, which leaves those rows as exact
-- duplicates on the surviving key.
--
-- For each group-day the lowest id survives; every Encounter pointing at a
-- loser is repointed onto the survivor, then the losers are deleted. No
-- location or date information is lost: each Encounter has carried its own
-- location_id/visit_date since #1015, and those are what every read path now
-- uses.
--
-- Ordering is load-bearing in both directions:
--   * It runs AFTER the DDL's two constraint drops (Sessions' old
--     (visit_date, location_id, session_type) key and Encounters'
--     (bird_id, session_id) key), so the repoint can move two encounters of one
--     bird onto a single Session without tripping either.
--   * It runs BEFORE the two new unique constraints, which are therefore
--     deliberately moved down here out of the generated block — the Sessions one
--     cannot be created while the duplicate group-days still exist.
--
-- `trigger_trg_set_encounter_generated_fields` does not fire on the repoint: it
-- is scoped to UPDATE OF location_id, visit_date, capture_time, none of which
-- this touches.
-- ===========================================================================
WITH session_survivors AS (
	SELECT
		id AS loser_id,
		MIN(id) OVER (
			PARTITION BY
				ringing_group_id,
				visit_date
		) AS survivor_id
	FROM public."Sessions"
)
UPDATE public."Encounters" e
SET
	session_id = ss.survivor_id
FROM session_survivors ss
WHERE
	e.session_id = ss.loser_id
	AND ss.loser_id <> ss.survivor_id;

DELETE FROM public."Sessions" s
WHERE
	s.id <> (
		SELECT
			MIN(s2.id)
		FROM public."Sessions" s2
		WHERE
			s2.ringing_group_id = s.ringing_group_id
			AND s2.visit_date = s.visit_date
	);

-- The two new unique constraints, moved here from the generated block above so
-- they are created against the already-collapsed data (see the ordering note).
ALTER TABLE public."Encounters" ADD CONSTRAINT encounters_bird_id_location_id_visit_date_unique UNIQUE (bird_id, location_id, visit_date);
ALTER TABLE public."Sessions" ADD CONSTRAINT "Sessions_visit_date_ringing_group_id_key" UNIQUE (visit_date, ringing_group_id);
