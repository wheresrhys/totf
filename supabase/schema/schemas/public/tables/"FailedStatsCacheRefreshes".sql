-- Dead-letter log for stats-cache refresh anomalies (#1167): one row per cell
-- a refresh pass could not write, so the failure survives past the log line
-- that used to be the only record of it.
--
-- Written by lib/stats-cache-refresh.ts's refreshSimpleStatsCache when a cell
-- is present in some but not all of the stats_cache_*_metrics RPCs it merges
-- (reason = 'missing_from_metric_rpc'). The cache_table column distinguishes
-- its species-grouped pass from its all-species-combined one.
--
-- Deliberately NOT shaped like "SimpleStatsCache": this is a pure append-only
-- log, so it has no unique constraint and no partial-index scheme. The same
-- cell can legitimately fail on every refresh pass, and each of those
-- failures is its own fact worth keeping.
CREATE SEQUENCE public."FailedStatsCacheRefreshes_id_seq";

CREATE TABLE public."FailedStatsCacheRefreshes" (
	id bigint DEFAULT nextval(
		'public."FailedStatsCacheRefreshes_id_seq"'::regclass
	) NOT NULL,
	group_id bigint NOT NULL,
	-- Which cache table the failed refresh was targeting. Text + CHECK rather
	-- than a Postgres enum type, matching this schema's existing convention
	-- (see temporal_unit below and "SimpleStatsCache".sql).
	cache_table text NOT NULL,
	temporal_unit text NOT NULL,
	-- NULL means "all species combined", the same value-not-missing convention
	-- "SimpleStatsCache".species_id uses.
	species_id bigint,
	-- NULL for the 'all-time' temporal unit, same convention as
	-- "SimpleStatsCache".time_period.
	time_period date,
	reason text NOT NULL,
	details jsonb,
	created_at timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public."FailedStatsCacheRefreshes" IS 'Append-only dead-letter log of stats-cache refresh failures: one row per cell a refresh pass could not write. Not deduplicated — a cell that fails on every pass gets a row per pass.';

COMMENT ON COLUMN public."FailedStatsCacheRefreshes".reason IS 'Why the cell could not be written. Deliberately plain text with no CHECK constraint, so a new failure kind never needs a migration. The only value in use today is ''missing_from_metric_rpc'': the cell was present in some but not all of the stats_cache_*_metrics RPC results the refresh merges.';

COMMENT ON COLUMN public."FailedStatsCacheRefreshes".details IS 'Free-form structured context for the failure, shaped per reason. For ''missing_from_metric_rpc'': { missingFromRpc: string[] }, the RPC names whose results omitted the cell.';

CREATE INDEX idx_failed_stats_cache_refreshes_group_id ON public."FailedStatsCacheRefreshes" (group_id);

-- SELECT/INSERT: strictly own-group only, mirroring "SimpleStatsCache"'s own
-- policies. No UPDATE or DELETE policy, and no grant for either (see the grants
-- at the bottom) — an append-only log is never amended or pruned by the app.
CREATE POLICY group_failed_stats_cache_refreshes_access ON public."FailedStatsCacheRefreshes" FOR
SELECT
	USING (
		group_id = (
			(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
		)::bigint
	);

CREATE POLICY group_failed_stats_cache_refreshes_insert ON public."FailedStatsCacheRefreshes" FOR INSERT
WITH
	CHECK (
		group_id = (
			(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
		)::bigint
	);

ALTER SEQUENCE public."FailedStatsCacheRefreshes_id_seq" OWNED BY public."FailedStatsCacheRefreshes".id;

ALTER TABLE public."FailedStatsCacheRefreshes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."FailedStatsCacheRefreshes"
ADD CONSTRAINT "FailedStatsCacheRefreshes_pkey" PRIMARY KEY (id);

ALTER TABLE public."FailedStatsCacheRefreshes"
ADD CONSTRAINT failed_stats_cache_refreshes_cache_table_check CHECK (
	cache_table IN ('SimpleStatsCache', 'SimpleStatsCacheBySpecies')
);

-- Same value set as simple_stats_cache_temporal_unit_check — keep the two in
-- sync by hand if a temporal unit is ever added.
ALTER TABLE public."FailedStatsCacheRefreshes"
ADD CONSTRAINT failed_stats_cache_refreshes_temporal_unit_check CHECK (
	temporal_unit IN (
		'day',
		'month',
		'year',
		'month-squashed',
		'all-time'
	)
);

ALTER TABLE public."FailedStatsCacheRefreshes"
ADD CONSTRAINT failed_stats_cache_refreshes_group_id_fkey FOREIGN KEY (group_id) REFERENCES public."RingingGroups" (id);

ALTER TABLE public."FailedStatsCacheRefreshes"
ADD CONSTRAINT failed_stats_cache_refreshes_species_id_fkey FOREIGN KEY (species_id) REFERENCES public."Species" (id);

-- Writes are authenticated-scoped for the same reason "SimpleStatsCache"'s are:
-- the stats-cache-refresh queue consumer mints a group-scoped authenticated
-- client rather than using the service-role key, so it needs a real INSERT
-- grant plus an own-group RLS policy. SELECT is granted because the whole point
-- of the table is to be queryable later; UPDATE/DELETE are not, so an append-only
-- log cannot be rewritten or silently cleared. Nothing reads or writes this
-- table on behalf of an anonymous caller, so `anon` gets no grant at all.
GRANT
SELECT
,
	INSERT ON public."FailedStatsCacheRefreshes" TO authenticated;

GRANT ALL ON public."FailedStatsCacheRefreshes" TO service_role;
