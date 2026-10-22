-- Return shape for stats_cache_encounter_age_metrics (#1149). One of six small,
-- read-only "metric-group" RPCs (see that function's header comment) whose rows
-- a later orchestrator (T8a, refresh_simple_stats_cache) writes into the merged
-- SimpleStatsCache table (T1a) — encounter-level age-bucket counts are
-- period-local, so they land there rather than in the lifetime-relative
-- ComplexStatsCache (T1b).
--
-- Keyed on species_id, not species_name, like every other stats_cache_* result
-- type: these feed a cache-table write keyed on species id, unlike the
-- display-oriented core_stats_result/demographics_stats_result.
--
-- Eight count columns, deliberately DEDUPLICATED across the two RPCs they are
-- drawn from — core_stats and demographics_stats each maintain their own
-- encounter_age_bucket_counts CTE today, and juv_enc_count / postjuv_enc_count
-- appear in BOTH with byte-identical definitions:
--
--   * pullus/juv/postjuv/adult/unknown_age_enc_count — core_stats' five
--     mutually-exclusive, exhaustive buckets (they sum to the cell's
--     encounter_count).
--   * postjuv_juv_enc_count — demographics_stats' 3J-only slice
--     (age_code = 3 AND is_juv). A strict SUBSET of juv_enc_count, which also
--     admits 1J, so it is not a sixth bucket.
--   * new_postjuv_juv_enc_count / new_postjuv_enc_count — demographics_stats'
--     two record_type = 'N' slices of the age-3 cohort, juv and non-juv
--     respectively.
--
-- No top-level encounter_count column: that is a plain count off raw_encounters
-- rather than off the age classification, and belongs to
-- stats_cache_basic_session_metrics (T2).
--
-- Matching stats_cache_encounter_age_metrics.sql's SELECT list order
-- positionally is NOT required here — that function binds its final projection
-- by column NAME via jsonb_populate_record rather than a bare positional
-- SELECT, so the result is correct regardless of this type's physical attribute
-- order in any given environment (see biometrics_stats.sql's header comment for
-- the #800 postmortem that motivated this convention).
CREATE TYPE public.stats_cache_encounter_age_metrics_result AS (
	species_id bigint,
	time_period date,
	pullus_enc_count bigint,
	juv_enc_count bigint,
	postjuv_enc_count bigint,
	adult_enc_count bigint,
	unknown_age_enc_count bigint,
	postjuv_juv_enc_count bigint,
	new_postjuv_juv_enc_count bigint,
	new_postjuv_enc_count bigint
);
