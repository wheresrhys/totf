-- The per-species half of the period-local stats cache (#1169): column-for-
-- column "SimpleStatsCache" plus a NOT NULL species_id. One row per
-- (group_id, temporal_unit, time_period, species_id) — the
-- group_by_species=true shape of core_stats/biometrics_stats/
-- demographics_stats and of every stats_cache_*_metrics RPC.
--
-- See "SimpleStatsCache".sql's own comment for why the two grains are separate
-- tables rather than one table with a nullable species_id, and for what the
-- time_period sentinel is for. This is the half both of
-- lib/stats-cache-refresh.ts's refresh functions actually write today, since
-- they hardcode group_by_species=true on every metric RPC call.
CREATE SEQUENCE public."SimpleStatsCacheBySpecies_id_seq";

CREATE TABLE public."SimpleStatsCacheBySpecies" (
	id bigint DEFAULT nextval(
		'public."SimpleStatsCacheBySpecies_id_seq"'::regclass
	) NOT NULL,
	group_id bigint NOT NULL,
	temporal_unit text NOT NULL,
	-- NOT NULL, with '0001-01-01' as the sentinel for the all-time grain, so one
	-- plain UNIQUE constraint covers every grain — see "SimpleStatsCache".sql.
	time_period date NOT NULL,
	-- NOT NULL: the all-species-combined grain is the sibling
	-- "SimpleStatsCache" table, not a NULL in this column.
	species_id bigint NOT NULL,
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

COMMENT ON TABLE public."SimpleStatsCacheBySpecies" IS 'One row per (group_id, temporal_unit, time_period, species_id): every period-local metric shared between core_stats_result, biometrics_stats_result and demographics_stats_result, per species. All-species-combined rows live in "SimpleStatsCache"; lifetime-relative demographics columns live in "ComplexStatsCacheBySpecies".';

COMMENT ON COLUMN public."SimpleStatsCacheBySpecies".time_period IS 'The cell''s period, as the first date in it. NOT NULL: the all-time grain uses the sentinel date ''0001-01-01'' rather than a NULL, so a single plain UNIQUE constraint covers every grain and a native supabase-js .upsert() can name it as a conflict target.';

COMMENT ON COLUMN public."SimpleStatsCacheBySpecies".species_id IS 'NOT NULL — unlike this table''s predecessor, there is no "all species combined" sentinel or NULL here. Those rows live in the "SimpleStatsCache" table instead.';

CREATE INDEX idx_simple_stats_cache_by_species_group_id ON public."SimpleStatsCacheBySpecies" (group_id);

-- Keeps updated_at current on every write; see trg_set_updated_at's own
-- comment for why this repo needs a trigger rather than a plain DEFAULT
-- NOW() here — the write path's native supabase-js .upsert() never includes
-- updated_at in its payload, so a DEFAULT alone would never refresh it on
-- the ON CONFLICT DO UPDATE path.
CREATE TRIGGER trigger_trg_set_updated_at BEFORE INSERT
OR
UPDATE ON public."SimpleStatsCacheBySpecies" FOR EACH ROW
EXECUTE FUNCTION public.trg_set_updated_at ();

-- SELECT/INSERT/UPDATE: strictly own-group only, mirroring "SimpleStatsCache"'s
-- own policies. No DELETE policy: there is no DELETE grant below, so a delete
-- is rejected at the grant level before RLS is even evaluated.
CREATE POLICY group_simple_stats_cache_by_species_access ON public."SimpleStatsCacheBySpecies" FOR
SELECT
	USING (
		group_id = (
			(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
		)::bigint
	);

CREATE POLICY group_simple_stats_cache_by_species_insert ON public."SimpleStatsCacheBySpecies" FOR INSERT
WITH
	CHECK (
		group_id = (
			(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
		)::bigint
	);

CREATE POLICY group_simple_stats_cache_by_species_update ON public."SimpleStatsCacheBySpecies"
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

ALTER SEQUENCE public."SimpleStatsCacheBySpecies_id_seq" OWNED BY public."SimpleStatsCacheBySpecies".id;

ALTER TABLE public."SimpleStatsCacheBySpecies" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."SimpleStatsCacheBySpecies"
ADD CONSTRAINT "SimpleStatsCacheBySpecies_pkey" PRIMARY KEY (id);

ALTER TABLE public."SimpleStatsCacheBySpecies"
ADD CONSTRAINT simple_stats_cache_by_species_temporal_unit_check CHECK (
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
ALTER TABLE public."SimpleStatsCacheBySpecies"
ADD CONSTRAINT simple_stats_cache_by_species_group_grain_period_species_key UNIQUE (group_id, temporal_unit, time_period, species_id);

ALTER TABLE public."SimpleStatsCacheBySpecies"
ADD CONSTRAINT simple_stats_cache_by_species_group_id_fkey FOREIGN KEY (group_id) REFERENCES public."RingingGroups" (id);

ALTER TABLE public."SimpleStatsCacheBySpecies"
ADD CONSTRAINT simple_stats_cache_by_species_species_id_fkey FOREIGN KEY (species_id) REFERENCES public."Species" (id);

-- Same grant rationale as "SimpleStatsCache".sql: authenticated-scoped
-- SELECT/INSERT/UPDATE for the queue consumer's group-scoped client, no DELETE,
-- and no grant at all for `anon`.
GRANT
SELECT
,
	INSERT,
UPDATE ON public."SimpleStatsCacheBySpecies" TO authenticated;

GRANT ALL ON public."SimpleStatsCacheBySpecies" TO service_role;
