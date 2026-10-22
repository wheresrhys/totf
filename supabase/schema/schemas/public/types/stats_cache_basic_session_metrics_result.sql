-- Return shape for stats_cache_basic_session_metrics (#1146). One of six small,
-- read-only "metric-group" RPCs (see that function's header comment) whose rows
-- a later orchestrator (T8a, refresh_simple_stats_cache) writes into the merged
-- SimpleStatsCache table (T1a) — every column here is period-local (counts and
-- effort within the cell's own window), so they land there rather than in the
-- lifetime-relative ComplexStatsCache (T1b).
--
-- Keyed on species_id, not species_name, unlike core_stats_result: this RPC
-- feeds a cache-table write keyed on species id, whereas core_stats itself is
-- display-oriented. The eleven metric columns are exactly core_stats' four
-- basic-count columns plus its seven session/effort columns — no age-dimension
-- columns of any kind, those belong to the other metric-group RPCs.
--
-- Matching stats_cache_basic_session_metrics.sql's SELECT list order
-- positionally is NOT required here — that function binds its final projection
-- by column NAME via jsonb_populate_record rather than a bare positional
-- SELECT, so the result is correct regardless of this type's physical
-- attribute order in any given environment (see CLAUDE.md's "Composite-type
-- RETURN QUERY binds by position, not name" for the #800 postmortem that
-- motivated this convention).
CREATE TYPE public.stats_cache_basic_session_metrics_result AS (
	species_id bigint,
	time_period date,
	species_count bigint,
	bird_count bigint,
	encounter_count bigint,
	new_bird_count bigint,
	session_count bigint,
	total_effort interval,
	effort_per_session interval,
	effort_per_encounter interval,
	avg_encounters_per_session numeric,
	max_per_session bigint,
	max_new_per_session bigint
);
