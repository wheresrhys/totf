-- Return shape for stats_cache_new_adult_metrics (#1150). One of six small,
-- read-only "metric-group" RPCs (see that function's header comment) whose rows
-- a later orchestrator (T8b, refresh_complex_stats_cache) writes into the
-- lifetime-relative ComplexStatsCache table (T1b) — new_adult_bird_count can
-- never be computed incrementally from a windowed delta (a backdated encounter
-- anywhere in a bird's history can retroactively change which year is
-- "first-ever" for it), so it belongs there rather than in the period-local
-- SimpleStatsCache the rest of this RPC family feeds.
--
-- Keyed on species_id, not species_name, like every other stats_cache_* result
-- type: these feed a cache-table write keyed on species id, unlike the
-- display-oriented demographics_stats_result. new_adult_bird_count is a
-- non-exhaustive SUBSET of adult_bird_count (stats_cache_bird_age_metrics'
-- column) — the adults whose first-ever-with-group year is this cell's own
-- period_year.
--
-- Matching stats_cache_new_adult_metrics.sql's SELECT list order positionally
-- is NOT required here — that function binds its final projection by column
-- NAME via jsonb_populate_record rather than a bare positional SELECT, so the
-- result is correct regardless of this type's physical attribute order in any
-- given environment (see biometrics_stats.sql's header comment for the #800
-- postmortem that motivated this convention).
CREATE TYPE public.stats_cache_new_adult_metrics_result AS (
	species_id bigint,
	time_period date,
	new_adult_bird_count bigint
);
