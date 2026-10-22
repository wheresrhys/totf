-- Cache table for the lifetime-relative demographics columns of
-- demographics_stats_result (#1147): new_adult_bird_count and the four
-- returning_age_* columns. One row per
-- (group_id, species_id, temporal_unit, time_period).
--
-- These five are "complex" because they read a bird's whole UNWINDOWED
-- history with the group, not just the window its own cell covers — see
-- supabase/CLAUDE.md's "Companion stats RPCs and shared plumbing" (the
-- stats_bird_returning_age_bucket / #932 "merge the streams" notes) for the
-- exact mechanics. Any backdated encounter anywhere in a bird's history can
-- retroactively change which year counts as its first-ever year with the
-- group, or its period-relative proven age, regardless of which dates an
-- import actually touched — so beyond the 'day' grain these columns must
-- always be fully replaced on a refresh, never narrowed to just the affected
-- dates.
--
-- That stricter recompute policy is the whole reason they live here rather
-- than in "SimpleStatsCache".sql: every column in that table is period-local
-- (a pure aggregate over encounters inside one cell's own window), so its
-- refresh CAN narrow by affected dates, and merging these five in would drag
-- it down to this table's always-full-replace rule.
--
-- This ticket adds the table only — no refresh function yet. The write path
-- that (re)populates it is a separate, blocked-ON-this ticket, implemented as
-- plain TypeScript calling the metric-group RPCs and a native supabase-js
-- .upsert(), not a SQL function.
CREATE SEQUENCE public."ComplexStatsCache_id_seq";

CREATE TABLE public."ComplexStatsCache" (
	id bigint DEFAULT nextval('public."ComplexStatsCache_id_seq"'::regclass) NOT NULL,
	group_id bigint NOT NULL,
	species_id bigint NOT NULL,
	temporal_unit text NOT NULL,
	-- NOT NULL with a sentinel for the 'all-time' grain (see column comment
	-- below) rather than NULL-for-all-time (demographics_stats' own
	-- convention) — a NOT NULL column lets this table use one plain UNIQUE
	-- constraint instead of two partial indexes, which in turn lets the write
	-- path (a later ticket) do a native supabase-js .upsert() with no custom
	-- SQL function: PostgREST's upsert API can target a plain unique
	-- constraint by column list, but has no way to express a partial index's
	-- WHERE predicate. Matches "SimpleStatsCache".sql, which made the
	-- identical departure.
	time_period date NOT NULL,
	-- The five lifetime-relative columns, lifted verbatim from
	-- demographics_stats_result. NOT NULL matches that RPC's own COALESCE
	-- contract — unlike SimpleStatsCache's biometric columns, none of these
	-- is ever null on an empty cell.
	new_adult_bird_count bigint NOT NULL,
	returning_age_1_bird_count bigint NOT NULL,
	returning_age_2_bird_count bigint NOT NULL,
	returning_age_3_plus_bird_count bigint NOT NULL,
	returning_new_unknown_age_bird_count bigint NOT NULL
);

COMMENT ON TABLE public."ComplexStatsCache" IS 'One row per (group_id, species_id, temporal_unit, time_period): the lifetime-relative demographics_stats_result metrics (new_adult_bird_count and the four returning_age_* columns), which read a bird''s whole unwindowed history and so must be fully replaced on refresh rather than narrowed to affected dates. Period-local metrics live in the separate SimpleStatsCache table instead.';

COMMENT ON COLUMN public."ComplexStatsCache".time_period IS 'Sentinel value 0001-01-01 for the all-time grain, never real data. This table uses a fixed sentinel instead of NULL (unlike demographics_stats) so a single plain UNIQUE constraint covers every grain.';

CREATE INDEX idx_complex_stats_cache_group_id ON public."ComplexStatsCache" (group_id);

-- SELECT/INSERT/UPDATE: strictly own-group only — no cross-group sharing via
-- GroupDataSharing (this is an internal cache table, not user-facing shared
-- data). No DELETE policy: there is no DELETE grant below, so a delete is
-- rejected at the grant level before RLS is even evaluated.
CREATE POLICY group_complex_stats_cache_access ON public."ComplexStatsCache" FOR
SELECT
	USING (
		group_id = (
			(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
		)::bigint
	);

CREATE POLICY group_complex_stats_cache_insert ON public."ComplexStatsCache" FOR INSERT
WITH
	CHECK (
		group_id = (
			(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
		)::bigint
	);

CREATE POLICY group_complex_stats_cache_update ON public."ComplexStatsCache"
FOR UPDATE
	USING (
		group_id = (
			(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
		)::bigint
	)
WITH
	CHECK (
		group_id = (
			(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
		)::bigint
	);

ALTER SEQUENCE public."ComplexStatsCache_id_seq" OWNED BY public."ComplexStatsCache".id;

ALTER TABLE public."ComplexStatsCache" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."ComplexStatsCache"
ADD CONSTRAINT "ComplexStatsCache_pkey" PRIMARY KEY (id);

ALTER TABLE public."ComplexStatsCache"
ADD CONSTRAINT complex_stats_cache_temporal_unit_check CHECK (
	temporal_unit IN (
		'day',
		'month',
		'year',
		'month-squashed',
		'all-time'
	)
);

-- One row per (group_id, species_id, temporal_unit, time_period). A plain
-- unique constraint (rather than two partial indexes) is correct because
-- time_period is NOT NULL (sentinel-valued for all-time, see column comment
-- above) — see this file's header comment for why that matters to the write
-- path.
ALTER TABLE public."ComplexStatsCache"
ADD CONSTRAINT complex_stats_cache_group_species_grain_period_key UNIQUE (group_id, species_id, temporal_unit, time_period);

ALTER TABLE public."ComplexStatsCache"
ADD CONSTRAINT complex_stats_cache_group_id_fkey FOREIGN KEY (group_id) REFERENCES public."RingingGroups" (id);

ALTER TABLE public."ComplexStatsCache"
ADD CONSTRAINT complex_stats_cache_species_id_fkey FOREIGN KEY (species_id) REFERENCES public."Species" (id);

-- Writes are authenticated-scoped, not service-role-only — a deliberate
-- departure from this table's original per-RPC-cache design. The write path
-- (a later ticket) runs from the stats-cache-refresh queue consumer, which
-- per the repo's Vercel Queues ADR mints a group-scoped authenticated client
-- rather than using the service-role key, so it needs real INSERT/UPDATE
-- grants and RLS policies for authenticated, scoped to the caller's own
-- group — no SECURITY DEFINER function involved. No DELETE grant for
-- authenticated: the upsert-only write pattern never needs to delete a row.
-- Nothing reads or writes this table on behalf of an anonymous caller, so
-- `anon` is left with no grant at all here, matching "SimpleStatsCache".sql.
GRANT
SELECT
,
	INSERT,
UPDATE ON public."ComplexStatsCache" TO authenticated;

GRANT ALL ON public."ComplexStatsCache" TO service_role;
