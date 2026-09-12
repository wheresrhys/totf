-- Shared return shape for biometrics_stats (#822). A companion RPC to
-- aggregate_stats carrying the wing/weight summary statistics (max/avg/min/median
-- for both), split into its own RPC rather than left folded into aggregate_stats'
-- already-large single query — both for query-plan simplicity and to leave
-- aggregate_stats' existing columns/performance untouched (those columns are
-- removed from aggregate_stats in a later ticket, once consumers migrate). Shares
-- its input signature with aggregate_stats / population_stats (species_name_filter,
-- from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
-- and reuses the stats_raw_encounters / stats_spine utility RPCs. The eight metric
-- columns and their rounding mirror aggregate_stats.sql's final SELECT exactly
-- (ROUND(..., 1) for avg/median weight, ROUND(..., 0) for median wing); the two
-- grouping/identity columns (species_name, time_period) mirror aggregate_stats_result.
--
-- Matching the SELECT list order in biometrics_stats.sql positionally is NOT
-- required here — biometrics_stats.sql binds its final projection by column NAME via
-- jsonb_populate_record instead of a bare positional RETURN QUERY SELECT, so the
-- result is correct regardless of this type's physical attribute order in any given
-- environment (see biometrics_stats.sql's header comment for the #800 postmortem
-- that motivated this).
CREATE TYPE public.biometrics_stats_result AS (
	species_name text,
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
