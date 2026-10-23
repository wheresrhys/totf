-- One of six small, read-only "metric-group" RPCs (#1145) a later orchestrator
-- (T8a, refresh_simple_stats_cache) calls to populate the merged SimpleStatsCache
-- table (T1a) — the replacement design for the standalone BiometricsStatsCache +
-- refresh function #955 originally specced (closed, superseded). This RPC only
-- returns rows; writing into SimpleStatsCache is T8a's job.
--
-- An almost-direct port of biometrics_stats.sql's final SELECT, keyed on
-- species_id rather than species_name (this RPC feeds a cache-table write keyed
-- on species id, unlike biometrics_stats_result's display-oriented
-- species_name) and with no encounter_count column (that's core_stats'
-- concern, not this cache-feeding RPC's). Shares core_stats' / biometrics_stats'
-- / population_stats' 8-arg input signature and reuses the stats_raw_encounters
-- / stats_spine utility RPCs, each called exactly once and materialized into a
-- local CTE — no age-dimension utility RPC, since biometrics has no age
-- dimension (consistent with biometrics_stats itself).
--
-- The eight metric columns and their rounding are exactly biometrics_stats'
-- (ROUND(..., 1) for avg/median weight, ROUND(..., 0) for median wing, no
-- rounding on max/min). Deliberately no COALESCE on these eight columns —
-- MAX/AVG/MIN/PERCENTILE_CONT over an empty set is NULL, not 0, and a spine
-- cell with zero matching encounters must yield NULL across all eight columns,
-- matching biometrics_stats' own documented behaviour.
--
-- LANGUAGE sql STABLE, not plpgsql, like stats_spine/stats_raw_encounters
-- themselves — this is a plain single-SELECT utility RPC, not one of the
-- plpgsql orchestrators (T8a/T8b). This function has no RETURN QUERY plan
-- cache of its own, but that turned out to be beside the point: because it
-- carries no SET config, Postgres INLINES it into the caller's query (no
-- Function Scan node in EXPLAIN — its CTEs/joins appear flattened directly in
-- the outer plan), which exposes its own shape-parameterized CASE/OR-guarded
-- join (keyed on group_by_time_period) to whichever CALLER's prepared
-- statement gets reused across requests on a pooled PostgREST connection —
-- exactly the mechanism #953 already fixed for the plpgsql family
-- (core_stats/biometrics_stats/demographics_stats/arrivals_stats), just
-- arriving here via the caller's plan cache rather than a cache of this
-- function's own. Measured on a synthetic 180-Session/8650-Encounter/
-- 6164-Bird fixture sized to the actual failing prod group:
-- stats_cache_basic_session_metrics ran custom-plan executions 1-5 at
-- 81-259ms, then the pooled backend's plan cache flipped to generic on
-- execution 6 and executions 6-10 took 645ms-7.3s (~40x);
-- stats_cache_new_adult_metrics' sibling benchmark showed custom-plan
-- executions at 51-76ms against generic-plan executions at 16.2s-23.1s
-- (~400x). SET plan_cache_mode TO 'force_custom_plan' fixes this not by
-- giving a non-existent RETURN QUERY cache a custom-plan escape hatch, but by
-- disqualifying the function from inlining in the first place (any function
-- carrying a SET clause is ineligible for inlining) — confirmed via EXPLAIN
-- (COSTS OFF): before the fix this function's body is flattened into the
-- caller's plan, after it there's a bare opaque Function Scan. See
-- supabase/CLAUDE.md's "plpgsql generic-plan-cliff audit" section.
--
-- The final projection is wrapped in jsonb_populate_record rather than
-- returned as a bare positional SELECT, for the same reason as every sibling
-- RPC in this family: a bare `RETURN QUERY SELECT ...` (or, for a LANGUAGE sql
-- function, a bare final SELECT) binds to the composite return type's columns
-- by ORDINAL POSITION, not by the "AS" alias names below — and that position
-- is only as stable as whatever DDL a given environment's schema-diff run
-- happens to emit for the type's physical attribute order (confirmed while
-- building population_stats: two db:schema:apply runs on the same source files
-- produced two different physical attribute orders, silently scrambling values
-- into the wrong named columns with no error). Routing through
-- to_jsonb(...)/jsonb_populate_record binds every column by NAME instead.
-- jsonb_populate_record is evaluated via CROSS JOIN LATERAL (once per outer
-- row) rather than as a bare `(...).* ` projection, for the same reason as
-- biometrics_stats.sql: Postgres does not common-subexpression-eliminate a
-- repeated function call across SELECT target-list entries, so a bare
-- `(jsonb_populate_record(...)).* ` gets expanded at parse time into one
-- independent call PER OUTPUT COLUMN.
CREATE FUNCTION public.stats_cache_biometrics_metrics (
	species_name_filter text DEFAULT NULL::text,
	from_date date DEFAULT NULL::date,
	to_date date DEFAULT NULL::date,
	ringing_group_filter bigint DEFAULT NULL::bigint,
	group_by_species boolean DEFAULT FALSE,
	group_by_time_period text DEFAULT NULL::text,
	year_filter smallint DEFAULT NULL::smallint,
	month_filter smallint DEFAULT NULL::smallint
) RETURNS SETOF public.stats_cache_biometrics_metrics_result LANGUAGE sql STABLE
SET
	plan_cache_mode TO 'force_custom_plan' AS $function$
  SELECT r.*
  FROM (
  WITH raw_encounters AS (
    SELECT * FROM public.stats_raw_encounters(species_name_filter, from_date, to_date, ringing_group_filter, year_filter, month_filter)
  ), spine AS (
    SELECT * FROM public.stats_spine(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
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
    OR (group_by_time_period = 'month-squashed' AND spine.time_period = raw_enc.session_month_squashed)
    OR (group_by_time_period IS NULL OR group_by_time_period NOT IN ('month', 'year', 'day', 'month-squashed'))
  )
  GROUP BY CASE
    WHEN group_by_species THEN spine.species_id
    ELSE NULL::bigint
  END, CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period
    WHEN group_by_time_period = 'month-squashed' THEN spine.time_period
    ELSE NULL::date
  END
  ) AS agg
  CROSS JOIN LATERAL jsonb_populate_record(NULL::public.stats_cache_biometrics_metrics_result, to_jsonb(agg)) AS r
  ORDER BY r.species_id ASC, r.time_period ASC;
$function$;

GRANT ALL ON FUNCTION public.stats_cache_biometrics_metrics (
	text,
	date,
	date,
	bigint,
	boolean,
	text,
	smallint,
	smallint
) TO anon;

GRANT ALL ON FUNCTION public.stats_cache_biometrics_metrics (
	text,
	date,
	date,
	bigint,
	boolean,
	text,
	smallint,
	smallint
) TO authenticated;

GRANT ALL ON FUNCTION public.stats_cache_biometrics_metrics (
	text,
	date,
	date,
	bigint,
	boolean,
	text,
	smallint,
	smallint
) TO service_role;
