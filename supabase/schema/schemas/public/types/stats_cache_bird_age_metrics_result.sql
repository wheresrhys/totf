-- Return shape for stats_cache_bird_age_metrics (#1148). One of six small,
-- read-only "metric-group" RPCs (see that function's header comment) whose rows
-- a later orchestrator (T8a, refresh_simple_stats_cache) writes into the merged
-- SimpleStatsCache table (T1a) — bird-level age-bucket counts are period-local,
-- so they land there.
--
-- Keyed on species_id, not species_name, like every other stats_cache_* result
-- type: these feed a cache-table write keyed on species id, unlike the
-- display-oriented core_stats_result/demographics_stats_result.
--
-- The first five count columns are core_stats' five mutually-exclusive,
-- exhaustive bird-level buckets (they sum to the cell's bird_count);
-- new_young_bird_count is demographics_stats' derived column and is a
-- non-exhaustive SUBSET of pullus + juv + postjuv, not a sixth bucket.
--
-- Matching stats_cache_bird_age_metrics.sql's SELECT list order positionally is
-- NOT required here — that function binds its final projection by column NAME
-- via jsonb_populate_record rather than a bare positional SELECT, so the result
-- is correct regardless of this type's physical attribute order in any given
-- environment (see biometrics_stats.sql's header comment for the #800
-- postmortem that motivated this convention).
CREATE TYPE public.stats_cache_bird_age_metrics_result AS (
	species_id bigint,
	time_period date,
	pullus_bird_count bigint,
	juv_bird_count bigint,
	postjuv_bird_count bigint,
	adult_bird_count bigint,
	unknown_age_bird_count bigint,
	new_young_bird_count bigint
);
