-- Return shape for stats_cache_biometrics_metrics (#1145). One of six small,
-- read-only "metric-group" RPCs (see that function's header comment) whose rows
-- a later orchestrator (T8a, refresh_simple_stats_cache) writes into the merged
-- SimpleStatsCache table (T1a) — biometrics columns are period-local, so they
-- land there.
--
-- Keyed on species_id, not species_name, unlike biometrics_stats_result: this
-- RPC feeds a cache-table write keyed on species id, whereas biometrics_stats
-- itself is display-oriented. No encounter_count column either — that's
-- core_stats_result's job; this type carries only the eight biometric metric
-- columns the SimpleStatsCache row needs.
--
-- Matching stats_cache_biometrics_metrics.sql's SELECT list order positionally
-- is NOT required here — that function binds its final projection by column
-- NAME via jsonb_populate_record rather than a bare positional RETURN QUERY
-- SELECT, so the result is correct regardless of this type's physical
-- attribute order in any given environment (see biometrics_stats.sql's header
-- comment for the #800 postmortem that motivated this convention).
CREATE TYPE public.stats_cache_biometrics_metrics_result AS (
	species_id bigint,
	time_period date,
	max_weight real,
	avg_weight numeric,
	min_weight real,
	median_weight numeric,
	max_wing smallint,
	avg_wing numeric,
	min_wing smallint,
	median_wing numeric
);
