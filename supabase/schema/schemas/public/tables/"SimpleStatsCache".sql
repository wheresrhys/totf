-- Cache table for every period-local metric column across the legacy
-- core_stats_result / biometrics_stats_result / demographics_stats_result
-- types (#1144): pure aggregates over encounters inside one cell's own time
-- window, with no reference to a bird's history outside it. One row per
-- (group_id, temporal_unit, time_period) — the ALL-SPECIES-COMBINED half of
-- the cache (the group_by_species=false shape of core_stats/biometrics_stats/
-- demographics_stats). Per-species rows live in the sibling
-- "SimpleStatsCacheBySpecies" table.
--
-- WHY TWO TABLES RATHER THAN A NULLABLE species_id (#1169): a NULL species_id
-- meaning "all species combined" is a value, not an unknown, and Postgres
-- unique indexes treat NULLs as distinct — so that one nullable column forced
-- the uniqueness rule across four partial/plain indexes and a four-branch
-- static-SQL upsert RPC to write through them (PostgREST's upsert API can only
-- name a conflict target as a bare column list, never a partial index's WHERE
-- predicate). Splitting the species and non-species grains into their own
-- tables removes the nullability instead of papering over it, and the earlier
-- attempt at the other fix — a sentinel species_id — was already tried and
-- reverted, because there is no defensible FK sentinel for "all species".
--
-- Deliberately excludes the lifetime-relative demographics columns
-- (new_adult_bird_count, returning_age_*) — those needed a stricter
-- always-full-replace recompute policy and lived in a separate
-- "ComplexStatsCache"/"ComplexStatsCacheBySpecies" pair so they didn't drag
-- this table's narrowing-by-affected-dates recompute down with them. That
-- pair's write path had already been disabled before it was removed
-- entirely; mine the history if a lifetime-relative cache is ever needed
-- again.
--
-- With exactly one unique constraint, rows are written with a native
-- supabase-js .upsert() naming that constraint's column list as its conflict
-- target — see lib/stats-cache-refresh.ts. (The non-species half has no writer
-- yet: both refresh functions hardcode group_by_species=true and so only ever
-- write the BySpecies tables.)
CREATE SEQUENCE public."SimpleStatsCache_id_seq";

CREATE TABLE public."SimpleStatsCache" (
	id bigint DEFAULT nextval('public."SimpleStatsCache_id_seq"'::regclass) NOT NULL,
	group_id bigint NOT NULL,
	temporal_unit text NOT NULL,
	-- NOT NULL, with '0001-01-01' as the sentinel for the all-time grain, so one
	-- plain UNIQUE constraint covers every grain — see the table comment above.
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
	new_postjuv_enc_count bigint NOT NULL,
	created_at timestamptz DEFAULT NOW() NOT NULL,
	updated_at timestamptz DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE public."SimpleStatsCache" IS 'One row per (group_id, temporal_unit, time_period): every period-local metric shared between core_stats_result, biometrics_stats_result and demographics_stats_result, for all species combined. Per-species rows live in "SimpleStatsCacheBySpecies".';

COMMENT ON COLUMN public."SimpleStatsCache".time_period IS 'The cell''s period, as the first date in it. NOT NULL: the all-time grain uses the sentinel date ''0001-01-01'' rather than a NULL, so a single plain UNIQUE constraint covers every grain and a native supabase-js .upsert() can name it as a conflict target.';

CREATE INDEX idx_simple_stats_cache_group_id ON public."SimpleStatsCache" (group_id);

-- Keeps updated_at current on every write; see the function's own comment for
-- why this repo needs a trigger rather than a plain DEFAULT NOW() here — the
-- write path's native supabase-js .upsert() never includes updated_at in its
-- payload, so a DEFAULT alone would never refresh it on the ON CONFLICT DO
-- UPDATE path.
CREATE TRIGGER trigger_trg_set_updated_at BEFORE INSERT
OR
UPDATE ON public."SimpleStatsCache" FOR EACH ROW
EXECUTE FUNCTION public.trg_set_updated_at ();

-- SELECT: the same three-way read gate "Encounters" uses, so the summary page's
-- four access levels survive a repoint onto this cache (#1202) —
--   1. the row's own group, by its JWT;
--   2. a group the row's group has granted cross-group access to via
--      "GroupDataSharing" (identical OR-branch to "Encounters"'
--      group_encounters_access, with group_id in place of ringing_group_id);
--   3. anyone at all, including an anonymous no-JWT caller, when the row's group
--      has opted its summary area into public view ('summary' = ANY
--      public_areas) — the same gate public_core_stats applies, enforced here by
--      RLS directly rather than by a SECURITY DEFINER wrapper, so no new read
--      path has to exist for it.
-- Branch 3 is evaluable anonymously because "RingingGroups" is openly readable
-- (ringing_groups_access is USING (TRUE), with GRANT ALL to anon), and branches
-- 1/2 simply evaluate false for such a caller: auth.jwt() is NULL, so the
-- ::bigint cast yields NULL rather than an error and every comparison against it
-- is NULL. No extra anonymous guard is needed.
--
-- INSERT/UPDATE stay strictly own-group, authenticated-only — a widened read
-- gate must not widen the write path. No DELETE policy: there is no DELETE grant
-- below, so a delete is rejected at the grant level before RLS is even evaluated.
CREATE POLICY group_simple_stats_cache_access ON public."SimpleStatsCache" FOR
SELECT
	USING (
		group_id = (
			(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
		)::bigint
		OR EXISTS (
			SELECT
				1
			FROM
				public."GroupDataSharing"
			WHERE
				granter_group_id = group_id
				AND recipient_group_id = (
					(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
				)::bigint
		)
		OR EXISTS (
			SELECT
				1
			FROM
				public."RingingGroups" rg
			WHERE
				rg.id = group_id
				AND 'summary' = ANY (rg.public_areas)
		)
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

-- The one and only uniqueness rule for this table, and the conflict target the
-- write path names verbatim in its .upsert() — keep the two in sync by hand.
ALTER TABLE public."SimpleStatsCache"
ADD CONSTRAINT simple_stats_cache_group_grain_period_key UNIQUE (group_id, temporal_unit, time_period);

ALTER TABLE public."SimpleStatsCache"
ADD CONSTRAINT simple_stats_cache_group_id_fkey FOREIGN KEY (group_id) REFERENCES public."RingingGroups" (id);

-- Writes are authenticated-scoped, not service-role-only — a deliberate
-- departure from this table's original per-RPC-cache design. The write path
-- runs from the stats-cache-refresh queue consumer, which per the repo's
-- Vercel Queues ADR mints a group-scoped authenticated client rather than
-- using the service-role key, so it needs real INSERT/UPDATE grants and RLS
-- policies for authenticated, scoped to the caller's own group. No DELETE
-- grant for authenticated: the upsert-only write pattern never needs to delete
-- a row.
--
-- `anon` gets SELECT and nothing else (#1202): the public-opt-in OR-branch of
-- the SELECT policy above is only reachable if the anon role can get as far as
-- having RLS evaluated at all — without a grant, an anonymous read fails with
-- 42501 before any policy runs. Deliberately not GRANT ALL: an anonymous caller
-- has no business writing a cache row, and only the read gate was widened.
GRANT
SELECT
,
	INSERT,
UPDATE ON public."SimpleStatsCache" TO authenticated;

GRANT
SELECT
	ON public."SimpleStatsCache" TO anon;

GRANT ALL ON public."SimpleStatsCache" TO service_role;
