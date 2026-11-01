-- The granularity a stats cell is bucketed at: a calendar day, month or year;
-- 'month-squashed' (every January across the group's whole history collapsed
-- into one cell, and likewise for the other eleven months); or 'all-time' (the
-- whole history as a single cell). The single source of truth for that value
-- set, which until now was hand-copied into an independent CHECK constraint on
-- each of the three stats-cache tables ("SimpleStatsCache",
-- "SimpleStatsCacheBySpecies" and "FailedStatsCacheRefreshes" — the last of
-- which carried a comment admitting the copies had to be kept in sync by hand)
-- and into several separate TypeScript unions besides.
--
-- Deliberately NOT the type of the stats RPC family's `group_by_time_period`
-- parameter, which stays text on all 14 of them: Postgres has no implicit
-- enum→text cast, so retyping even one would force explicit ::text casts at
-- every call-through site into its still-text-typed callees, for a narrow payoff
-- against a recently perf-tuned RPC family.
--
-- Mirrors the ring_size.sql enum-file convention, and is the generated-types
-- anchor for app/models/temporal-unit.ts's StatsTemporalUnit.
CREATE TYPE public.temporal_unit AS ENUM(
	'day',
	'month',
	'year',
	'month-squashed',
	'all-time'
);
