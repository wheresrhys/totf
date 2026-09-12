-- Shared return shape for aggregate_stats and its public, group-gated wrapper
-- public_aggregate_stats (#768). Both functions RETURN SETOF this type so the
-- 29-column result shape is defined in exactly one place; the wrapper is
-- guaranteed to stay row-for-row identical to what it forwards.
-- aggregate_stats.sql binds its final projection to these columns by NAME (via
-- jsonb_populate_record — see CLAUDE.md's "Composite-type RETURN QUERY binds by
-- position, not name" section), not by physical attribute order, so this file's
-- declared column order need not match aggregate_stats.sql's SELECT list order.
CREATE TYPE public.aggregate_stats_result AS (
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
