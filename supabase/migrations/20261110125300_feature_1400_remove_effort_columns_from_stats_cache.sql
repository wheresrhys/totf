SET check_function_bodies = false;
ALTER TABLE public."SimpleStatsCache" DROP COLUMN effort_per_encounter;
ALTER TABLE public."SimpleStatsCache" DROP COLUMN effort_per_session;
ALTER TABLE public."SimpleStatsCache" DROP COLUMN total_effort;
ALTER TABLE public."SimpleStatsCacheBySpecies" DROP COLUMN effort_per_encounter;
ALTER TABLE public."SimpleStatsCacheBySpecies" DROP COLUMN effort_per_session;
ALTER TABLE public."SimpleStatsCacheBySpecies" DROP COLUMN total_effort;
ALTER TYPE public.stats_cache_basic_session_metrics_result DROP ATTRIBUTE effort_per_encounter;
ALTER TYPE public.stats_cache_basic_session_metrics_result DROP ATTRIBUTE effort_per_session;
ALTER TYPE public.stats_cache_basic_session_metrics_result DROP ATTRIBUTE total_effort;
CREATE OR REPLACE FUNCTION public.stats_cache_basic_session_metrics(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text, year_filter smallint DEFAULT NULL::smallint, month_filter smallint DEFAULT NULL::smallint)
 RETURNS SETOF public.stats_cache_basic_session_metrics_result
 LANGUAGE sql
 STABLE
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
  SELECT r.*
  FROM (
  WITH raw_encounters AS (
    SELECT * FROM public.stats_raw_encounters(species_name_filter, from_date, to_date, ringing_group_filter, year_filter, month_filter)
  ), spine AS (
    SELECT * FROM public.stats_spine(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
  ),
  session_counts AS (
    -- Count encounters per session — split by species only when the caller asked for
    -- a per-species breakdown, exactly like core_stats' own session_counts CTE.
    --
    -- Grouping by a bare `re.species_id` regardless of group_by_species is the #1049
    -- regression: a group-wide call then produces one row per (species, session) pair
    -- rather than one per session, and the aggregates built on top of it —
    -- max_per_session ("Busiest session"), max_new_per_session and
    -- avg_encounters_per_session — describe the busiest/average SPECIES-within-a-
    -- session instead of the session itself. On prod's /summary/sep the 2026 row
    -- reported 39 (its biggest single species) against a real busiest session of 62.
    -- session_count/species_count/bird_count/encounter_count are computed straight
    -- off raw_encounters and were never affected.
    SELECT
      CASE WHEN group_by_species THEN re.species_id ELSE NULL::bigint END AS species_id,
      re.session_id,
      -- raw_encounters already carries session_day/month/year, precomputed once when
      -- its CTE was materialized — re-deriving them from re.visit_date here would pay
      -- for the same date_trunc calls a second time, per row (#947).
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
  )
  SELECT
    CASE WHEN group_by_species THEN spine.species_id ELSE NULL::bigint END AS "species_id",
    CASE
      WHEN group_by_time_period = 'day' THEN spine.time_period
      WHEN group_by_time_period = 'month' THEN spine.time_period
      WHEN group_by_time_period = 'year' THEN spine.time_period
      WHEN group_by_time_period = 'month-squashed' THEN spine.time_period
      ELSE NULL::date
    END AS "time_period",

    -- The four basic counts, COALESCEd to 0 so an empty spine cell reports zeroes
    -- rather than NULLs (unlike the biometrics metric group, where an empty cell
    -- legitimately has no value at all).
    COALESCE(COUNT(DISTINCT raw_enc.species_id), 0) AS "species_count",
    COALESCE(COUNT(DISTINCT raw_enc.bird_id), 0) AS "bird_count",
    COALESCE(COUNT(DISTINCT raw_enc.encounter_id), 0) AS "encounter_count",
    COALESCE(COUNT(DISTINCT CASE WHEN raw_enc.record_type = 'N' THEN raw_enc.bird_id END), 0) AS "new_bird_count",

    -- One count per distinct date with at least one in-hand encounter in the cell —
    -- a plain COUNT(DISTINCT visit_date) since #1021, on the same session_type-blind
    -- basis as the four counts above.
    COALESCE(COUNT(DISTINCT raw_enc.visit_date), 0) AS "session_count",
    COALESCE(agg_sess.avg_encounters_per_session, 0) AS "avg_encounters_per_session",
    COALESCE(agg_sess.max_per_session, 0) AS "max_per_session",
    COALESCE(agg_sess.max_new_per_session, 0) AS "max_new_per_session"

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
  LEFT JOIN aggregated_session_counts agg_sess ON CASE WHEN group_by_species THEN spine.species_id = agg_sess.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = agg_sess.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = agg_sess.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = agg_sess.time_period
    WHEN group_by_time_period = 'month-squashed' THEN spine.time_period = agg_sess.time_period
    ELSE true
  END
  GROUP BY CASE
    WHEN group_by_species THEN spine.species_id
    ELSE NULL::bigint
  END, CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period
    WHEN group_by_time_period = 'month-squashed' THEN spine.time_period
    ELSE NULL::date
  END, agg_sess.max_per_session, agg_sess.max_new_per_session, agg_sess.avg_encounters_per_session
  ) AS agg
  CROSS JOIN LATERAL jsonb_populate_record(NULL::public.stats_cache_basic_session_metrics_result, to_jsonb(agg)) AS r
  ORDER BY r.species_id ASC, r.time_period ASC;
$function$;
