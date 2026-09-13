-- Shared return shape for core_stats and its public, group-gated wrapper
-- public_core_stats. Both functions RETURN SETOF this type so the
-- 29-column result shape is defined in exactly one place; the wrapper is
-- guaranteed to stay row-for-row identical to what it forwards.
-- core_stats.sql binds its final projection to these columns by NAME (via
-- jsonb_populate_record — see CLAUDE.md's "Composite-type RETURN QUERY binds by
-- position, not name" section), not by physical attribute order, so this file's
-- declared column order need not match core_stats.sql's SELECT list order.
--
-- Byte-for-byte the same column list as aggregate_stats_result (#828, step 1 of
-- the aggregate_stats -> core_stats rename: create new, migrate app, delete
-- old). aggregate_stats/aggregate_stats_result/public_aggregate_stats are left
-- untouched and keep serving all existing app call sites until the migration
-- ticket lands.
CREATE TYPE public.core_stats_result AS (
	species_name text,
	time_period date,
	session_count bigint,
	total_effort interval,
	effort_per_session interval,
	effort_per_encounter interval,
	avg_encounters_per_session numeric,
	max_per_session bigint,
	species_count bigint,
	bird_count bigint,
	encounter_count bigint,
	new_bird_count bigint,
	pullus_bird_count bigint,
	juv_bird_count bigint,
	postjuv_bird_count bigint,
	adult_bird_count bigint,
	unknown_age_bird_count bigint,
	pullus_enc_count bigint,
	juv_enc_count bigint,
	postjuv_enc_count bigint,
	adult_enc_count bigint,
	unknown_age_enc_count bigint,
	max_new_per_session bigint
);
