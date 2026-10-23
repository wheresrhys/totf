-- One of six small, read-only "metric-group" RPCs (#1148, sibling of #1145's
-- stats_cache_biometrics_metrics) a later orchestrator (T8a,
-- refresh_simple_stats_cache) calls to populate the merged SimpleStatsCache
-- table (T1a). This RPC only returns rows; writing into SimpleStatsCache is
-- T8a's job.
--
-- It collapses into one place the bird-level age-bucket projection core_stats
-- and demographics_stats each derive independently today: core_stats' five
-- mutually-exclusive, exhaustive buckets (pullus/juv/postjuv/adult/unknown_age,
-- which sum to the cell's bird_count) plus demographics_stats'
-- new_young_bird_count (a young-bucket bird with any 'N'-record_type encounter
-- anywhere in the cell — bucket membership and "has an N encounter" are checked
-- INDEPENDENTLY, so the N record need not be the encounter that provided the
-- young-bucket evidence). All six come off ONE shared bird_age_bucket CTE.
--
-- The bucket resolution and its two precedence rules (pullus always wins; juv
-- wins over postjuv) are NOT reimplemented here — they live in the
-- stats_bird_age_bucket utility RPC, which already returns one row per
-- (bird, cell) with age_bucket and has_new resolved, and whose
-- species_id/time_period are already NULL'd out per the caller's
-- group_by_species/group_by_time_period shape. Keep those rules hand-synced
-- with app/models/encounter.ts's getAgeClass() in that file, not this one.
--
-- The spine is still joined, exactly as core_stats and
-- stats_cache_biometrics_metrics do: a cell with no matching birds must appear
-- with zero counts rather than vanish, so this RPC's rows line up row-for-row
-- with core_stats' for identical filters (and so T8a writes a cache row per
-- cell, not just per non-empty cell). No COALESCE is needed on the six count
-- columns — COUNT(*) FILTER over a LEFT JOIN's unmatched row is already 0, not
-- NULL, unlike biometrics' MAX/AVG/MIN.
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
-- The final projection is wrapped in jsonb_populate_record rather than returned
-- as a bare positional SELECT, for the same reason as every sibling RPC in this
-- family: a bare final SELECT binds to the composite return type's columns by
-- ORDINAL POSITION, not by the "AS" alias names below, and that position is
-- only as stable as whatever DDL a given environment's schema-diff run happens
-- to emit for the type's physical attribute order (two db:schema:apply runs on
-- the same source files produced two different orders — see biometrics_stats.sql's
-- header for the #800 postmortem). Routing through
-- to_jsonb(...)/jsonb_populate_record binds every column by NAME instead, and it
-- is evaluated via CROSS JOIN LATERAL (once per outer row) rather than as a bare
-- `(...).*` projection, which Postgres would expand at parse time into one
-- independent call PER OUTPUT COLUMN.
CREATE FUNCTION public.stats_cache_bird_age_metrics (
	species_name_filter text DEFAULT NULL::text,
	from_date date DEFAULT NULL::date,
	to_date date DEFAULT NULL::date,
	ringing_group_filter bigint DEFAULT NULL::bigint,
	group_by_species boolean DEFAULT FALSE,
	group_by_time_period text DEFAULT NULL::text,
	year_filter smallint DEFAULT NULL::smallint,
	month_filter smallint DEFAULT NULL::smallint
) RETURNS SETOF public.stats_cache_bird_age_metrics_result LANGUAGE sql STABLE
SET
	plan_cache_mode TO 'force_custom_plan' AS $function$
  SELECT r.*
  FROM (
  WITH spine AS (
    SELECT * FROM public.stats_spine(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
  ), bird_age_bucket AS (
    SELECT * FROM public.stats_bird_age_bucket(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
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

    COUNT(*) FILTER (WHERE bab.age_bucket = 'pullus') AS "pullus_bird_count",
    COUNT(*) FILTER (WHERE bab.age_bucket = 'juv') AS "juv_bird_count",
    COUNT(*) FILTER (WHERE bab.age_bucket = 'postjuv') AS "postjuv_bird_count",
    COUNT(*) FILTER (WHERE bab.age_bucket = 'adult') AS "adult_bird_count",
    COUNT(*) FILTER (WHERE bab.age_bucket = 'unknown') AS "unknown_age_bird_count",

    -- Demographics' derived column: a young-bucket bird that also has any 'N'
    -- encounter in the cell. bab.has_new is bool_or'd across the bird's whole
    -- cell, so the two conditions are independent by construction.
    COUNT(*) FILTER (
      WHERE bab.age_bucket IN ('pullus', 'juv', 'postjuv') AND bab.has_new
    ) AS "new_young_bird_count"

  FROM spine
  -- bab.species_id / bab.time_period are already resolved to the same cell axis
  -- the spine uses (stats_bird_age_bucket applies the same group_by_* CASEs), so
  -- this joins on them directly rather than re-deriving session_day/month/year.
  LEFT JOIN bird_age_bucket bab ON
  (NOT group_by_species OR spine.species_id = bab.species_id)
  AND (
    (group_by_time_period IN ('day', 'month', 'year', 'month-squashed') AND spine.time_period = bab.time_period)
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
  CROSS JOIN LATERAL jsonb_populate_record(NULL::public.stats_cache_bird_age_metrics_result, to_jsonb(agg)) AS r
  ORDER BY r.species_id ASC, r.time_period ASC;
$function$;

GRANT ALL ON FUNCTION public.stats_cache_bird_age_metrics (
	text,
	date,
	date,
	bigint,
	boolean,
	text,
	smallint,
	smallint
) TO anon;

GRANT ALL ON FUNCTION public.stats_cache_bird_age_metrics (
	text,
	date,
	date,
	bigint,
	boolean,
	text,
	smallint,
	smallint
) TO authenticated;

GRANT ALL ON FUNCTION public.stats_cache_bird_age_metrics (
	text,
	date,
	date,
	bigint,
	boolean,
	text,
	smallint,
	smallint
) TO service_role;
