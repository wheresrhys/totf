-- Cache table for the lifetime-relative demographics columns of
-- demographics_stats_result (#1147): new_adult_bird_count and the four
-- returning_age_* columns. One row per (group_id, temporal_unit, time_period) —
-- the ALL-SPECIES-COMBINED half of the cache (the group_by_species=false shape
-- of demographics_stats). Per-species rows live in the sibling
-- "ComplexStatsCacheBySpecies" table.
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
-- The species/non-species split and the time_period sentinel mirror
-- "SimpleStatsCache".sql exactly — see that file's comment for why (#1169).
-- Rows are written with a native supabase-js .upsert() naming this table's one
-- unique constraint as its conflict target; see lib/stats-cache-refresh.ts.
-- (The non-species half has no writer yet: both refresh functions hardcode
-- group_by_species=true and so only ever write the BySpecies tables.)
CREATE SEQUENCE public."ComplexStatsCache_id_seq";

CREATE TABLE public."ComplexStatsCache" (
	id bigint DEFAULT nextval('public."ComplexStatsCache_id_seq"'::regclass) NOT NULL,
	group_id bigint NOT NULL,
	temporal_unit text NOT NULL,
	-- NOT NULL, with '0001-01-01' as the sentinel for the all-time grain, so one
	-- plain UNIQUE constraint covers every grain — see the table comment above.
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

COMMENT ON TABLE public."ComplexStatsCache" IS 'One row per (group_id, temporal_unit, time_period), for all species combined: the lifetime-relative demographics_stats_result metrics (new_adult_bird_count and the four returning_age_* columns), which read a bird''s whole unwindowed history and so must be fully replaced on refresh rather than narrowed to affected dates. Per-species rows live in "ComplexStatsCacheBySpecies"; period-local metrics live in "SimpleStatsCache".';

COMMENT ON COLUMN public."ComplexStatsCache".time_period IS 'The cell''s period, as the first date in it. NOT NULL: the all-time grain uses the sentinel date ''0001-01-01'' rather than a NULL, so a single plain UNIQUE constraint covers every grain and a native supabase-js .upsert() can name it as a conflict target.';

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

-- The one and only uniqueness rule for this table, and the conflict target the
-- write path names verbatim in its .upsert() — keep the two in sync by hand.
ALTER TABLE public."ComplexStatsCache"
ADD CONSTRAINT complex_stats_cache_group_grain_period_key UNIQUE (group_id, temporal_unit, time_period);

ALTER TABLE public."ComplexStatsCache"
ADD CONSTRAINT complex_stats_cache_group_id_fkey FOREIGN KEY (group_id) REFERENCES public."RingingGroups" (id);

-- Writes are authenticated-scoped, not service-role-only — a deliberate
-- departure from this table's original per-RPC-cache design. The write path
-- runs from the stats-cache-refresh queue consumer, which per the repo's
-- Vercel Queues ADR mints a group-scoped authenticated client rather than
-- using the service-role key, so it needs real INSERT/UPDATE grants and RLS
-- policies for authenticated, scoped to the caller's own group. No DELETE
-- grant for authenticated: the upsert-only write pattern never needs to delete
-- a row. Nothing reads or writes this table on behalf of an anonymous caller,
-- so `anon` is left with no grant at all here, matching "SimpleStatsCache".sql.
GRANT
SELECT
,
	INSERT,
UPDATE ON public."ComplexStatsCache" TO authenticated;

GRANT ALL ON public."ComplexStatsCache" TO service_role;
