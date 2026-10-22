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
-- Rows are written exclusively through the upsert_simple_stats_cache_rows RPC
-- (see that function's own file) — never a native supabase-js .upsert(), which
-- cannot name a partial index's WHERE predicate as its conflict target. The
-- orchestrator that calls it (refresh_simple_stats_cache) is a separate,
-- blocked-ON-this ticket.
CREATE SEQUENCE public."SimpleStatsCache_id_seq";

CREATE TABLE public."SimpleStatsCache" (
	id bigint DEFAULT nextval('public."SimpleStatsCache_id_seq"'::regclass) NOT NULL,
	group_id bigint NOT NULL,
	-- NULL means "all species combined", matching core_stats/biometrics_stats/
	-- demographics_stats' own group_by_species=false convention (and every
	-- stats_cache_*_metrics RPC, which already emit a real NULL here). An
	-- earlier revision of this table made both this column and time_period
	-- NOT NULL with a '0001-01-01' sentinel for the all-time grain, so one
	-- plain UNIQUE constraint could cover every grain and the write path could
	-- be a native supabase-js .upsert(). That was reversed before anything
	-- wrote to the table: there was never a defensible sentinel for "all
	-- species", and the sentinel scheme forced every reader to translate
	-- between two conventions. See the unique-index block further down.
	species_id bigint,
	temporal_unit text NOT NULL,
	-- NULL for the 'all-time' grain, matching core_stats/biometrics_stats/
	-- demographics_stats' own convention — see the species_id comment above for
	-- why the original NOT NULL + '0001-01-01' sentinel was dropped.
	time_period date,
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

COMMENT ON COLUMN public."SimpleStatsCache".species_id IS 'NULL means "all species combined" (the group_by_species=false shape of core_stats/biometrics_stats/demographics_stats and every stats_cache_*_metrics RPC). Uniqueness across the NULL and non-NULL cases is split over four indexes — see the unique-index block in the table''s schema file.';

COMMENT ON COLUMN public."SimpleStatsCache".time_period IS 'NULL for the all-time grain (the group_by_time_period IS NULL shape of core_stats/biometrics_stats/demographics_stats). Uniqueness across the NULL and non-NULL cases is split over four indexes — see the unique-index block in the table''s schema file.';

CREATE INDEX idx_simple_stats_cache_group_id ON public."SimpleStatsCache" (group_id);

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
-- The write path (upsert_simple_stats_cache_rows) names these column lists and
-- predicates verbatim in its four ON CONFLICT clauses — change one and you must
-- change the other.
CREATE UNIQUE INDEX simple_stats_cache_group_period_allspecies_key ON public."SimpleStatsCache" (group_id, temporal_unit, time_period)
WHERE
	species_id IS NULL
	AND time_period IS NOT NULL;

CREATE UNIQUE INDEX simple_stats_cache_group_species_alltime_key ON public."SimpleStatsCache" (group_id, species_id, temporal_unit)
WHERE
	species_id IS NOT NULL
	AND time_period IS NULL;

CREATE UNIQUE INDEX simple_stats_cache_group_alltime_allspecies_key ON public."SimpleStatsCache" (group_id, temporal_unit)
WHERE
	species_id IS NULL
	AND time_period IS NULL;

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

-- The per-species, per-period case of the four-index uniqueness rule described
-- above the three partial indexes. Both columns being NULL-able is what narrows
-- it to that case, so it needs no predicate of its own.
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
-- group. upsert_simple_stats_cache_rows, the only thing that writes here, is
-- deliberately SECURITY INVOKER for the same reason — a SECURITY DEFINER
-- function would let any caller write another group's rows. No DELETE grant
-- for authenticated: the upsert-only write pattern never needs to delete a row.
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
