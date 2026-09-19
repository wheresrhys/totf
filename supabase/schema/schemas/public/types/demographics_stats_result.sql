-- Shared return shape for demographics_stats (#800, renamed from
-- population_stats in #877). A companion RPC to core_stats carrying the
-- new-adult (new_adult_bird_count), young-trends
-- (postjuv_juv/new_postjuv_juv/new_postjuv) and returning-age (#843)
-- derivations, split into their own RPC rather than folded into core_stats'
-- already-large single query — both for query-plan simplicity and to leave
-- core_stats' existing columns/performance untouched. Shares its input
-- signature with core_stats (species_name_filter, from_date, to_date,
-- ringing_group_filter, group_by_species, group_by_time_period) and much of its
-- underlying plumbing via the stats_raw_encounters / stats_spine /
-- stats_encounter_age_classification / stats_bird_age_bucket utility RPCs both
-- functions build on.
--
-- Matching the SELECT list order in demographics_stats.sql positionally is NOT
-- required here — demographics_stats.sql binds its final projection by column NAME
-- via jsonb_populate_record instead of a bare positional RETURN QUERY SELECT, so
-- the result is correct regardless of this type's physical attribute order in any
-- given environment (see demographics_stats.sql's header comment for the #800
-- postmortem that motivated this).
CREATE TYPE public.demographics_stats_result AS (
	species_name text,
	time_period date,
	-- Context/denominator columns, duplicated from core_stats' own bucket
	-- counts so this RPC's rows are self-contained (e.g. to read the adult
	-- subsets below as proportions without a second RPC call).
	adult_bird_count bigint,
	juv_bird_count bigint,
	juv_enc_count bigint,
	postjuv_enc_count bigint,
	-- Copied from core_stats.new_young_bird_count (#800 follow-up). Kept in
	-- both places for now — core_stats' copy is untouched/authoritative,
	-- this is where young/new-focused derivations belong going forward.
	new_young_bird_count bigint,
	-- Subset of adult_bird_count: adults whose first-ever year with the ringing
	-- group is this cell's own period_year, i.e. birds with no prior lifetime
	-- history with the group. Drives the "Returning vs new" chart's new-adults
	-- series (#854). The first_summer_bird_count / old_timers_bird_count columns
	-- that once partitioned the rest of the adult cohort alongside it were
	-- removed in #856 — "old timers" no longer exists as a concept at any layer,
	-- so this column no longer belongs to an exhaustive three-way split.
	new_adult_bird_count bigint,
	-- Young-trends encounter-level counts. The 3J-only slice of juv_enc_count
	-- (which combines 1J and 3J), plus New-record variants.
	postjuv_juv_enc_count bigint,
	new_postjuv_juv_enc_count bigint,
	new_postjuv_enc_count bigint,
	-- Returning-age subsets of adult_bird_count (#843), driving the "Returning
	-- ages" chart. Mutually exclusive over adult-bucketed birds, but NOT
	-- exhaustive: the four sum to adult_bird_count MINUS this cell's adults whose
	-- period-relative proven age is 0 (birds not yet proven to have returned —
	-- they belong to the "New adults" series instead). The age is computed as of
	-- each cell's own period_year, never from the live Birds.proven_age column —
	-- see stats_bird_returning_age_bucket.sql for the full derivation.
	returning_age_1_bird_count bigint,
	returning_age_2_bird_count bigint,
	returning_age_3_plus_bird_count bigint,
	returning_new_unknown_age_bird_count bigint
);
