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
-- Rows are written exclusively through the upsert_complex_stats_cache_rows RPC
-- (see that function's own file) — never a native supabase-js .upsert(), which
-- cannot name a partial index's WHERE predicate as its conflict target. The
-- orchestrator that calls it is a separate, blocked-ON-this ticket.
CREATE SEQUENCE public."ComplexStatsCache_id_seq";

CREATE TABLE public."ComplexStatsCache" (
	id bigint DEFAULT nextval('public."ComplexStatsCache_id_seq"'::regclass) NOT NULL,
	group_id bigint NOT NULL,
	-- NULL means "all species combined", matching demographics_stats' own
	-- group_by_species=false convention (and every stats_cache_*_metrics RPC,
	-- which already emit a real NULL here). An earlier revision of this table
	-- made both this column and time_period NOT NULL with a '0001-01-01'
	-- sentinel for the all-time grain, so one plain UNIQUE constraint could
	-- cover every grain and the write path could be a native supabase-js
	-- .upsert(). That was reversed before anything wrote to the table: there
	-- was never a defensible sentinel for "all species", and the sentinel
	-- scheme forced every reader to translate between two conventions. Matches
	-- "SimpleStatsCache".sql, which made the identical correction.
	species_id bigint,
	temporal_unit text NOT NULL,
	-- NULL for the 'all-time' grain, matching demographics_stats' own
	-- convention — see the species_id comment above for why the original
	-- NOT NULL + '0001-01-01' sentinel was dropped.
	time_period date,
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

COMMENT ON COLUMN public."ComplexStatsCache".species_id IS 'NULL means "all species combined" (the group_by_species=false shape of demographics_stats and every stats_cache_*_metrics RPC). Uniqueness across the NULL and non-NULL cases is split over four indexes — see the unique-index block in the table''s schema file.';

COMMENT ON COLUMN public."ComplexStatsCache".time_period IS 'NULL for the all-time grain (the group_by_time_period IS NULL shape of demographics_stats). Uniqueness across the NULL and non-NULL cases is split over four indexes — see the unique-index block in the table''s schema file.';

CREATE INDEX idx_complex_stats_cache_group_id ON public."ComplexStatsCache" (group_id);

-- Uniqueness is "one row per (group_id, species_id, temporal_unit,
-- time_period)" where a NULL species_id/time_period is a VALUE ("all species" /
-- "all time"), not an unknown. Postgres's unique indexes treat NULLs as
-- distinct from each other, so that rule takes four indexes rather than one —
-- the plain UNIQUE constraint below covers the both-non-null case (it narrows
-- to exactly that case automatically, for the same NULL-distinctness reason),
-- and these three partial indexes cover the rest.
--
-- Each partial index OMITS the column its predicate pins to NULL. Keeping an
-- always-NULL column in the key would make the index enforce nothing at all
-- (every pair of rows would differ on it), which is precisely the trap the
-- NULL-distinctness rule sets. The predicates are mutually exclusive and,
-- together with the plain constraint, exhaustive: every row is policed by
-- exactly one of the four.
--
-- The write path (upsert_complex_stats_cache_rows) names these column lists and
-- predicates verbatim in its four ON CONFLICT clauses — change one and you must
-- change the other. Mirrors "SimpleStatsCache".sql exactly.
CREATE UNIQUE INDEX complex_stats_cache_group_period_allspecies_key ON public."ComplexStatsCache" (group_id, temporal_unit, time_period)
WHERE
	species_id IS NULL
	AND time_period IS NOT NULL;

CREATE UNIQUE INDEX complex_stats_cache_group_species_alltime_key ON public."ComplexStatsCache" (group_id, species_id, temporal_unit)
WHERE
	species_id IS NOT NULL
	AND time_period IS NULL;

CREATE UNIQUE INDEX complex_stats_cache_group_alltime_allspecies_key ON public."ComplexStatsCache" (group_id, temporal_unit)
WHERE
	species_id IS NULL
	AND time_period IS NULL;

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

-- The per-species, per-period case of the four-index uniqueness rule described
-- above the three partial indexes. Both columns being NULL-able is what narrows
-- it to that case, so it needs no predicate of its own.
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
-- group. upsert_complex_stats_cache_rows, the only thing that writes here, is
-- deliberately SECURITY INVOKER for the same reason — a SECURITY DEFINER
-- function would let any caller write another group's rows. No DELETE grant
-- for authenticated: the upsert-only write pattern never needs to delete a row.
-- Nothing reads or writes this table on behalf of an anonymous caller, so
-- `anon` is left with no grant at all here, matching "SimpleStatsCache".sql.
GRANT
SELECT
,
	INSERT,
UPDATE ON public."ComplexStatsCache" TO authenticated;

GRANT ALL ON public."ComplexStatsCache" TO service_role;
