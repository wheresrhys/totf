-- Return shape for arrivals_stats (#858) — the "arrivals" companion to
-- aggregate_stats/population_stats. Shares their input signature
-- (species_name_filter, from_date, to_date, ringing_group_filter,
-- group_by_species, group_by_time_period) and their stats_* utility-RPC plumbing,
-- but counts each bird exactly ONCE per calendar year (at its first classifiable
-- encounter of that year) rather than once per (species, time_period) cell.
--
-- Matching the SELECT list order in arrivals_stats.sql positionally is NOT
-- required here — arrivals_stats.sql binds its final projection by column NAME
-- via jsonb_populate_record instead of a bare positional RETURN QUERY SELECT, so
-- the result is correct regardless of this type's physical attribute order in any
-- given environment (see population_stats.sql's header comment for the #800
-- postmortem that motivated this).
CREATE TYPE public.arrivals_stats_result AS (
	species_name text,
	time_period date,
	-- Mutually exclusive and exhaustive over classifiable arriving birds, so the
	-- five counts sum to the cell's total distinct-arriving-bird count. Adults are
	-- split by lifetime history with the ringing group (first-ever year == this
	-- arrival's year => new_adult, else returning_adult); pullus/juv/postjuv come
	-- straight from the arrival encounter's own age bucket.
	new_adult_bird_count bigint,
	returning_adult_bird_count bigint,
	pullus_bird_count bigint,
	juv_bird_count bigint,
	postjuv_bird_count bigint
);
