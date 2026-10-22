-- Cache table for every period-local metric column across the legacy
-- core_stats_result / biometrics_stats_result / demographics_stats_result
-- types (#1144): pure aggregates over encounters inside one cell's own time
-- window, with no reference to a bird's history outside it. One row per
-- (group_id, species_id, temporal_unit, time_period).
--
-- Deliberately excludes the lifetime-relative demographics columns
-- (new_adult_bird_count, returning_age_*) — those need a stricter
-- always-full-replace recompute policy and live in a separate
-- ComplexStatsCache table (a sibling, independent ticket) so they don't drag
-- this table's narrowing-by-affected-dates recompute down with them.
--
-- This ticket adds the table only — no refresh function yet. The function
-- that (re)populates it (refresh_simple_stats_cache) is a separate,
-- blocked-ON-this ticket.
CREATE SEQUENCE public."SimpleStatsCache_id_seq";

CREATE TABLE public."SimpleStatsCache" (
	id bigint DEFAULT nextval('public."SimpleStatsCache_id_seq"'::regclass) NOT NULL,
	group_id bigint NOT NULL,
	species_id bigint NOT NULL,
	temporal_unit text NOT NULL,
	-- NOT NULL with a sentinel for the 'all-time' grain (see column comment
	-- below) rather than NULL-for-all-time (core_stats/biometrics_stats/
	-- demographics_stats' own convention) — a NOT NULL column lets this table
	-- use one plain UNIQUE constraint instead of two partial indexes, which in
	-- turn lets the write path (a later ticket) do a native supabase-js
	-- .upsert() with no custom SQL function: PostgREST's upsert API can
	-- target a plain unique constraint by column list, but has no way to
	-- express a partial index's WHERE predicate.
	time_period date NOT NULL,
	-- Basic counts, from core_stats_result.
	species_count bigint NOT NULL,
	bird_count bigint NOT NULL,
	encounter_count bigint NOT NULL,
	new_bird_count bigint NOT NULL,
	-- Session/effort metrics, from core_stats_result.
	session_count bigint NOT NULL,
	total_effort interval NOT NULL,
	effort_per_session interval NOT NULL,
	effort_per_encounter interval NOT NULL,
	avg_encounters_per_session numeric NOT NULL,
	max_per_session bigint NOT NULL,
	max_new_per_session bigint NOT NULL,
	-- Biometric columns, from biometrics_stats_result. Deliberately NULLable,
	-- not COALESCEd to 0, matching the source RPC's own nullability on an
	-- empty cell.
	max_weight real,
	avg_weight numeric,
	min_weight real,
	median_weight numeric,
	max_wing smallint,
	avg_wing numeric,
	min_wing smallint,
	median_wing numeric,
	-- Bird-age-bucket columns: core_stats_result's five buckets plus
	-- demographics_stats_result.new_young_bird_count.
	pullus_bird_count bigint NOT NULL,
	juv_bird_count bigint NOT NULL,
	postjuv_bird_count bigint NOT NULL,
	adult_bird_count bigint NOT NULL,
	unknown_age_bird_count bigint NOT NULL,
	new_young_bird_count bigint NOT NULL,
	-- Encounter-age-bucket columns: core_stats_result's five buckets plus
	-- demographics_stats_result's three young-trends encounter counts.
	pullus_enc_count bigint NOT NULL,
	juv_enc_count bigint NOT NULL,
	postjuv_enc_count bigint NOT NULL,
	adult_enc_count bigint NOT NULL,
	unknown_age_enc_count bigint NOT NULL,
	postjuv_juv_enc_count bigint NOT NULL,
	new_postjuv_juv_enc_count bigint NOT NULL,
	new_postjuv_enc_count bigint NOT NULL
);

COMMENT ON TABLE public."SimpleStatsCache" IS 'One row per (group_id, species_id, temporal_unit, time_period): every period-local metric shared between core_stats_result, biometrics_stats_result and demographics_stats_result. Lifetime-relative demographics columns live in the separate ComplexStatsCache table instead.';

COMMENT ON COLUMN public."SimpleStatsCache".time_period IS 'Sentinel value 0001-01-01 for the all-time grain, never real data. This table uses a fixed sentinel instead of NULL (unlike core_stats/biometrics_stats/demographics_stats) so a single plain UNIQUE constraint covers every grain.';

CREATE INDEX idx_simple_stats_cache_group_id ON public."SimpleStatsCache" (group_id);

-- SELECT/INSERT/UPDATE: strictly own-group only — no cross-group sharing via
-- GroupDataSharing (nothing reads this table cross-group yet). No DELETE
-- policy: there is no DELETE grant below, so a delete is rejected at the
-- grant level before RLS is even evaluated.
CREATE POLICY group_simple_stats_cache_access ON public."SimpleStatsCache" FOR
SELECT
	USING (
		group_id = (
			(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
		)::bigint
	);

CREATE POLICY group_simple_stats_cache_insert ON public."SimpleStatsCache" FOR INSERT
WITH
	CHECK (
		group_id = (
			(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
		)::bigint
	);

CREATE POLICY group_simple_stats_cache_update ON public."SimpleStatsCache"
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

ALTER SEQUENCE public."SimpleStatsCache_id_seq" OWNED BY public."SimpleStatsCache".id;

ALTER TABLE public."SimpleStatsCache" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."SimpleStatsCache"
ADD CONSTRAINT "SimpleStatsCache_pkey" PRIMARY KEY (id);

ALTER TABLE public."SimpleStatsCache"
ADD CONSTRAINT simple_stats_cache_temporal_unit_check CHECK (
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
ALTER TABLE public."SimpleStatsCache"
ADD CONSTRAINT simple_stats_cache_group_species_grain_period_key UNIQUE (group_id, species_id, temporal_unit, time_period);

ALTER TABLE public."SimpleStatsCache"
ADD CONSTRAINT simple_stats_cache_group_id_fkey FOREIGN KEY (group_id) REFERENCES public."RingingGroups" (id);

ALTER TABLE public."SimpleStatsCache"
ADD CONSTRAINT simple_stats_cache_species_id_fkey FOREIGN KEY (species_id) REFERENCES public."Species" (id);

-- Writes are authenticated-scoped, not service-role-only — a deliberate
-- departure from this table's original per-RPC-cache design. The write path
-- (a later ticket) runs from the stats-cache-refresh queue consumer, which
-- per the repo's Vercel Queues ADR mints a group-scoped authenticated client
-- rather than using the service-role key, so it needs real INSERT/UPDATE
-- grants and RLS policies for authenticated, scoped to the caller's own
-- group — no SECURITY DEFINER function involved. No DELETE grant for
-- authenticated: the upsert-only write pattern never needs to delete a row.
-- Nothing reads or writes this table on behalf of an anonymous caller, so
-- `anon` is left with no grant at all here — unlike "ImportJobs".sql, which
-- explicitly grants `anon` SELECT/INSERT/UPDATE/DELETE because its own RLS
-- test suite asserts an anonymous request gets an RLS-filtered empty result
-- rather than a permission error. No such test exists for this table, so
-- there's nothing forcing the same explicit grant here.
GRANT
SELECT
,
	INSERT,
UPDATE ON public."SimpleStatsCache" TO authenticated;

GRANT ALL ON public."SimpleStatsCache" TO service_role;
