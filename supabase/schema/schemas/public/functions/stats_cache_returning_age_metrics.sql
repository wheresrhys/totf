-- One of six small, read-only "metric-group" RPCs (#1151, sibling of #1145's
-- stats_cache_biometrics_metrics / #1148's stats_cache_bird_age_metrics /
-- #1149's stats_cache_encounter_age_metrics / #1150's stats_cache_new_adult_metrics)
-- a later orchestrator calls to populate a stats cache table. Like
-- stats_cache_new_adult_metrics, this one feeds T8b (refresh_complex_stats_cache
-- / ComplexStatsCache, T1b) rather than T8a (refresh_simple_stats_cache /
-- SimpleStatsCache, T1a): each bird's returning-age bucket is a
-- PERIOD-RELATIVE proven age resolved over the bird's entire group-scoped
-- encounter history up to that cell's year, not just the history inside this
-- query's from_date/to_date window — so the answer for a given cell can
-- change on any future encounter and there is no way to cache this metric
-- group incrementally per affected date range. That enforcement
-- (always-full-replace, never incremental) is T8b's job, not this RPC's — this
-- RPC only wraps the read query.
--
-- This is a direct port of demographics_stats' own returning_age_counts CTE
-- (#843), keyed on species_id rather than species_name like every other
-- stats_cache_* result, with every other demographics_stats column dropped
-- (those are stats_cache_bird_age_metrics'/stats_cache_encounter_age_metrics'
-- concern, not this one's). The bucket resolution itself is NOT reimplemented
-- here — it lives entirely in the stats_bird_returning_age_bucket utility RPC,
-- which already returns one row per (bird, cell) with returning_age_bucket
-- resolved ('1' / '2' / '3_plus' / 'new_unknown_age', or NULL for a
-- not-yet-proven-to-have-returned adult). This RPC does nothing more than
-- GROUP BY (species_id, time_period) + COUNT(*) FILTER over that output —
-- deliberately so: stats_bird_returning_age_bucket is the single most
-- perf-sensitive utility RPC in the whole stats_cache_*/demographics_stats/
-- core_stats family (see its own header for the #932 "merge the streams"
-- rewrite — 23.4s -> 1.2s on a synthetic fixture — and its
-- 2026-09-20 plan-stability fix for the IS NOT DISTINCT FROM join that used to
-- get adult_birds estimated at 1 row when it actually returns tens of
-- thousands). Any new join, filter, or call shape against its output beyond a
-- plain GROUP BY + COUNT(*) FILTER risks reintroducing a bad-row-estimate join
-- exactly like the one #932 removed — don't add one.
--
-- The spine is still joined, exactly as demographics_stats and every sibling
-- in this RPC family do: a cell with no matching adult birds (or none proven
-- to have returned) must appear with zero counts rather than vanish, so this
-- RPC's rows line up row-for-row with demographics_stats' for identical
-- filters (and so T8b writes a cache row per cell, not just per non-empty
-- cell). COALESCE to 0 restores that for all four count columns, since a LEFT
-- JOIN with no match yields NULL here (the aggregation happens in a CTE
-- joined onto the spine afterwards, not as a direct COUNT(*) FILTER over the
-- spine join itself — mirroring stats_cache_new_adult_metrics.sql's
-- new_adult_counts CTE shape, not stats_cache_bird_age_metrics.sql's).
--
-- LANGUAGE sql STABLE, not plpgsql, like stats_spine/stats_bird_age_bucket
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
-- RPC in this family: a bare final SELECT binds to the composite return
-- type's columns by ORDINAL POSITION, not by the "AS" alias names below, and
-- that position is only as stable as whatever DDL a given environment's
-- schema-diff run happens to emit for the type's physical attribute order
-- (two db:schema:apply runs on the same source files produced two different
-- orders — see biometrics_stats.sql's header for the #800 postmortem).
-- Routing through to_jsonb(...)/jsonb_populate_record binds every column by
-- NAME instead, and it is evaluated via CROSS JOIN LATERAL (once per outer
-- row) rather than as a bare `(...).*` projection, which Postgres would
-- expand at parse time into one independent call PER OUTPUT COLUMN.
CREATE FUNCTION public.stats_cache_returning_age_metrics (
	species_name_filter text DEFAULT NULL::text,
	from_date date DEFAULT NULL::date,
	to_date date DEFAULT NULL::date,
	ringing_group_filter bigint DEFAULT NULL::bigint,
	group_by_species boolean DEFAULT FALSE,
	group_by_time_period text DEFAULT NULL::text,
	year_filter smallint DEFAULT NULL::smallint,
	month_filter smallint DEFAULT NULL::smallint
) RETURNS SETOF public.stats_cache_returning_age_metrics_result LANGUAGE sql STABLE
SET
	plan_cache_mode TO 'force_custom_plan' AS $function$
  SELECT r.*
  FROM (
  WITH spine AS (
    SELECT * FROM public.stats_spine(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
  ), bird_returning_age_bucket AS (
    SELECT * FROM public.stats_bird_returning_age_bucket(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
  ),
  -- Returning-age subsets of adult_bird_count (#843). Each adult-bucketed bird
  -- in a cell carries exactly one bucket from stats_bird_returning_age_bucket,
  -- or NULL when its period-relative proven age is 0 (not yet proven to have
  -- returned). So these four counts are mutually exclusive but NOT exhaustive
  -- over the adult cohort — replicated verbatim from demographics_stats.sql's
  -- own returning_age_counts CTE.
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
    CASE WHEN group_by_species THEN spine.species_id ELSE NULL::bigint END AS "species_id",
    CASE
      WHEN group_by_time_period = 'day' THEN spine.time_period
      WHEN group_by_time_period = 'month' THEN spine.time_period
      WHEN group_by_time_period = 'year' THEN spine.time_period
      WHEN group_by_time_period = 'month-squashed' THEN spine.time_period
      ELSE NULL::date
    END AS "time_period",

    COALESCE(rac.returning_age_1_bird_count, 0) AS "returning_age_1_bird_count",
    COALESCE(rac.returning_age_2_bird_count, 0) AS "returning_age_2_bird_count",
    COALESCE(rac.returning_age_3_plus_bird_count, 0) AS "returning_age_3_plus_bird_count",
    COALESCE(rac.returning_new_unknown_age_bird_count, 0) AS "returning_new_unknown_age_bird_count"

  FROM spine
  LEFT JOIN returning_age_counts rac ON
  (NOT group_by_species OR spine.species_id = rac.species_id)
  AND (
    (group_by_time_period IN ('day', 'month', 'year', 'month-squashed') AND spine.time_period = rac.time_period)
    OR (group_by_time_period IS NULL OR group_by_time_period NOT IN ('month', 'year', 'day', 'month-squashed'))
  )
  ) AS agg
  CROSS JOIN LATERAL jsonb_populate_record(NULL::public.stats_cache_returning_age_metrics_result, to_jsonb(agg)) AS r
  ORDER BY r.species_id ASC, r.time_period ASC;
$function$;

GRANT ALL ON FUNCTION public.stats_cache_returning_age_metrics (
	text,
	date,
	date,
	bigint,
	boolean,
	text,
	smallint,
	smallint
) TO anon;

GRANT ALL ON FUNCTION public.stats_cache_returning_age_metrics (
	text,
	date,
	date,
	bigint,
	boolean,
	text,
	smallint,
	smallint
) TO authenticated;

GRANT ALL ON FUNCTION public.stats_cache_returning_age_metrics (
	text,
	date,
	date,
	bigint,
	boolean,
	text,
	smallint,
	smallint
) TO service_role;
