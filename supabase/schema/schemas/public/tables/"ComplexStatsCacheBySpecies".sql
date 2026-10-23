-- The per-species half of the lifetime-relative stats cache (#1169):
-- column-for-column "ComplexStatsCache" plus a NOT NULL species_id. One row
-- per (group_id, temporal_unit, time_period, species_id) — the
-- group_by_species=true shape of demographics_stats and of every
-- stats_cache_*_metrics RPC.
--
-- See "ComplexStatsCache".sql for what makes these five columns "complex" (and
-- why they can't share "SimpleStatsCache"'s narrowing recompute policy), and
-- "SimpleStatsCache".sql for why the two species grains are separate tables
-- rather than one table with a nullable species_id. This is the half both of
-- lib/stats-cache-refresh.ts's refresh functions actually write today, since
-- they hardcode group_by_species=true on every metric RPC call.
CREATE SEQUENCE public."ComplexStatsCacheBySpecies_id_seq";

CREATE TABLE public."ComplexStatsCacheBySpecies" (
	id bigint DEFAULT nextval(
		'public."ComplexStatsCacheBySpecies_id_seq"'::regclass
	) NOT NULL,
	group_id bigint NOT NULL,
	temporal_unit text NOT NULL,
	-- NOT NULL, with '0001-01-01' as the sentinel for the all-time grain, so one
	-- plain UNIQUE constraint covers every grain — see "SimpleStatsCache".sql.
	time_period date NOT NULL,
	-- NOT NULL: the all-species-combined grain is the sibling
	-- "ComplexStatsCache" table, not a NULL in this column.
	species_id bigint NOT NULL,
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

COMMENT ON TABLE public."ComplexStatsCacheBySpecies" IS 'One row per (group_id, temporal_unit, time_period, species_id): the lifetime-relative demographics_stats_result metrics (new_adult_bird_count and the four returning_age_* columns), per species. All-species-combined rows live in "ComplexStatsCache"; period-local metrics live in "SimpleStatsCacheBySpecies".';

COMMENT ON COLUMN public."ComplexStatsCacheBySpecies".time_period IS 'The cell''s period, as the first date in it. NOT NULL: the all-time grain uses the sentinel date ''0001-01-01'' rather than a NULL, so a single plain UNIQUE constraint covers every grain and a native supabase-js .upsert() can name it as a conflict target.';

COMMENT ON COLUMN public."ComplexStatsCacheBySpecies".species_id IS 'NOT NULL — unlike this table''s predecessor, there is no "all species combined" sentinel or NULL here. Those rows live in the "ComplexStatsCache" table instead.';

CREATE INDEX idx_complex_stats_cache_by_species_group_id ON public."ComplexStatsCacheBySpecies" (group_id);

-- SELECT/INSERT/UPDATE: strictly own-group only, mirroring
-- "ComplexStatsCache"'s own policies. No DELETE policy: there is no DELETE
-- grant below, so a delete is rejected at the grant level before RLS is even
-- evaluated.
CREATE POLICY group_complex_stats_cache_by_species_access ON public."ComplexStatsCacheBySpecies" FOR
SELECT
	USING (
		group_id = (
			(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
		)::bigint
	);

CREATE POLICY group_complex_stats_cache_by_species_insert ON public."ComplexStatsCacheBySpecies" FOR INSERT
WITH
	CHECK (
		group_id = (
			(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
		)::bigint
	);

CREATE POLICY group_complex_stats_cache_by_species_update ON public."ComplexStatsCacheBySpecies"
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

ALTER SEQUENCE public."ComplexStatsCacheBySpecies_id_seq" OWNED BY public."ComplexStatsCacheBySpecies".id;

ALTER TABLE public."ComplexStatsCacheBySpecies" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."ComplexStatsCacheBySpecies"
ADD CONSTRAINT "ComplexStatsCacheBySpecies_pkey" PRIMARY KEY (id);

ALTER TABLE public."ComplexStatsCacheBySpecies"
ADD CONSTRAINT complex_stats_cache_by_species_temporal_unit_check CHECK (
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
ALTER TABLE public."ComplexStatsCacheBySpecies"
ADD CONSTRAINT complex_stats_cache_by_species_grain_period_species_key UNIQUE (group_id, temporal_unit, time_period, species_id);

ALTER TABLE public."ComplexStatsCacheBySpecies"
ADD CONSTRAINT complex_stats_cache_by_species_group_id_fkey FOREIGN KEY (group_id) REFERENCES public."RingingGroups" (id);

ALTER TABLE public."ComplexStatsCacheBySpecies"
ADD CONSTRAINT complex_stats_cache_by_species_species_id_fkey FOREIGN KEY (species_id) REFERENCES public."Species" (id);

-- Same grant rationale as "ComplexStatsCache".sql: authenticated-scoped
-- SELECT/INSERT/UPDATE for the queue consumer's group-scoped client, no DELETE,
-- and no grant at all for `anon`.
GRANT
SELECT
,
	INSERT,
UPDATE ON public."ComplexStatsCacheBySpecies" TO authenticated;

GRANT ALL ON public."ComplexStatsCacheBySpecies" TO service_role;
