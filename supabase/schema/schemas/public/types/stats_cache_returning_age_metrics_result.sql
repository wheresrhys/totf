-- Return shape for stats_cache_returning_age_metrics (#1151). One of six small,
-- read-only "metric-group" RPCs (see that function's header comment), sibling
-- of #1145's stats_cache_biometrics_metrics / #1148's stats_cache_bird_age_metrics
-- / #1149's stats_cache_encounter_age_metrics / #1150's stats_cache_new_adult_metrics.
-- Unlike the first three (which feed T8a's period-local SimpleStatsCache), this
-- one feeds T8b's lifetime-relative ComplexStatsCache (T1b), same as
-- stats_cache_new_adult_metrics — each bird's bucket is a period-relative
-- proven age computed over its entire group-scoped encounter history, so a
-- cell's answer can change on any future encounter and must always be fully
-- recomputed (that enforcement is T8b's job, not this type's).
--
-- Keyed on species_id, not species_name, like every other stats_cache_* result
-- type: these feed a cache-table write keyed on species id, unlike the
-- display-oriented demographics_stats_result. The four columns are the same
-- returning-age subsets of adult_bird_count demographics_stats_result carries
-- (#843) — mutually exclusive but NOT exhaustive over the adult cohort: they
-- sum to adult_bird_count MINUS the cell's proven-age-0 adults (birds not yet
-- proven to have returned — those belong to the "new adults" metric group,
-- T6/stats_cache_new_adult_metrics), not to adult_bird_count itself. See
-- stats_bird_returning_age_bucket.sql for the full period-relative-age
-- derivation and demographics_stats.sql's returning_age_counts CTE for the
-- aggregation this type's producing function replicates.
--
-- Matching stats_cache_returning_age_metrics.sql's SELECT list order
-- positionally is NOT required here — that function binds its final
-- projection by column NAME via jsonb_populate_record rather than a bare
-- positional SELECT, so the result is correct regardless of this type's
-- physical attribute order in any given environment (see biometrics_stats.sql's
-- header comment for the #800 postmortem that motivated this convention).
CREATE TYPE public.stats_cache_returning_age_metrics_result AS (
	species_id bigint,
	time_period date,
	returning_age_1_bird_count bigint,
	returning_age_2_bird_count bigint,
	returning_age_3_plus_bird_count bigint,
	returning_new_unknown_age_bird_count bigint
);
