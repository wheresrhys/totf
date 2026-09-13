-- Shared return shape for population_stats (#800). A companion RPC to
-- aggregate_stats carrying the age-split (new_adult/first_summer/old_timers) and
-- young-trends (postjuv_juv/new_postjuv_juv/new_postjuv) derivations, split into
-- their own RPC rather than folded into aggregate_stats' already-large single
-- query — both for query-plan simplicity and to leave aggregate_stats' existing
-- columns/performance untouched. Shares its input signature with aggregate_stats
-- (species_name_filter, from_date, to_date, ringing_group_filter,
-- group_by_species, group_by_time_period) and much of its underlying plumbing via
-- the agg_raw_encounters / agg_spine / agg_encounter_age_classification /
-- agg_bird_age_bucket utility RPCs both functions build on.
--
-- Matching the SELECT list order in population_stats.sql positionally is NOT
-- required here — population_stats.sql binds its final projection by column NAME
-- via jsonb_populate_record instead of a bare positional RETURN QUERY SELECT, so
-- the result is correct regardless of this type's physical attribute order in any
-- given environment (see population_stats.sql's header comment for the #800
-- postmortem that motivated this).
CREATE TYPE public.demographics_stats_result AS (
	species_name text,
	time_period date,
	-- Context/denominator columns, duplicated from aggregate_stats' own bucket
	-- counts so this RPC's rows are self-contained (e.g. to check the age-split
	-- sanity invariant below without a second RPC call).
	adult_bird_count bigint,
	juv_bird_count bigint,
	juv_enc_count bigint,
	postjuv_enc_count bigint,
	-- Copied from aggregate_stats.new_young_bird_count (#800 follow-up). Kept in
	-- both places for now — aggregate_stats' copy is untouched/authoritative,
	-- this is where young/new-focused derivations belong going forward.
	new_young_bird_count bigint,
	-- Age-split subsets of adult_bird_count. Mutually exclusive and exhaustive over
	-- adult-bucketed birds, so new_adult + first_summer + old_timers = adult_bird_count
	-- for every row. Partition adults by lifetime history with the ringing group.
	new_adult_bird_count bigint,
	first_summer_bird_count bigint,
	old_timers_bird_count bigint,
	-- Young-trends encounter-level counts. The 3J-only slice of juv_enc_count
	-- (which combines 1J and 3J), plus New-record variants.
	postjuv_juv_enc_count bigint,
	new_postjuv_juv_enc_count bigint,
	new_postjuv_enc_count bigint
);
