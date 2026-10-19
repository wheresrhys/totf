-- One row per CSV import run, written by both import entry points
-- (supabase/scripts/import-csv.ts and app/api/import/route.ts) via
-- lib/demon-import.ts's `createImportJobTracker`. A failed or partially-applied
-- import used to leave no trace at all — the web route's 280s abort in particular
-- only ever reported to the browser — so there was nothing to recover from or even
-- notice afterwards.
--
-- The three `*_stats_refresh_status` columns deliberately track each stats-cache
-- refresh **independently** of `status` and of each other: "every row imported fine
-- but the biometrics cache never refreshed" has to be a distinguishable state rather
-- than being folded into "import succeeded". They reuse the same
-- `import_job_status` enum as `status` (see that type's own file), defaulting to
-- `'in_progress'` meaning "not yet attempted".
CREATE SEQUENCE public."ImportJobs_id_seq";

CREATE TABLE public."ImportJobs" (
	id bigint DEFAULT nextval('public."ImportJobs_id_seq"'::regclass) NOT NULL,
	ringing_group_id bigint NOT NULL,
	status public.import_job_status NOT NULL DEFAULT 'in_progress',
	started_at timestamptz NOT NULL DEFAULT NOW(),
	-- Null until the job reaches a terminal state. A timed-out job sets it too: the
	-- 280s abort is an end, just not a successful one.
	finished_at timestamptz,
	-- The same three numbers both entry points already compute, under one naming:
	-- the route's ImportCompleteMessage `{processed, successful, failed}` and the
	-- script's ImportRowCounts `{totalRecords, successfulRecords, failedRecords}`
	-- both map onto these. Null until known.
	rows_processed integer,
	rows_successful integer,
	rows_failed integer,
	-- Partial-progress date range, mirroring ImportTimeoutMessage's
	-- startDate/endDate, so an aborted job's range survives even though it never
	-- reaches a successful completion.
	start_date date,
	end_date date,
	-- Mirrors ImportErrorMessage.message for the unhandled-error branch.
	error_message text,
	-- The distinct dates actually present in the imported batch, written mid-run
	-- (right after the staging rows are written, before domain-table import begins)
	-- rather than at completion — so it is set by its own helper, independent of
	-- the complete/fail/timeout transitions.
	affected_dates date[],
	core_stats_refresh_status public.import_job_status NOT NULL DEFAULT 'in_progress',
	biometrics_stats_refresh_status public.import_job_status NOT NULL DEFAULT 'in_progress',
	demographics_stats_refresh_status public.import_job_status NOT NULL DEFAULT 'in_progress'
);

COMMENT ON TABLE public."ImportJobs" IS 'One row per CSV import run: row counts, start/finish, overall outcome, dates covered, and the outcome of each stats-cache refresh tracked independently';

CREATE INDEX idx_import_jobs_ringing_group_id ON public."ImportJobs" (ringing_group_id);

-- Plain `ringing_group_id = jwt` on all three verbs. Unlike Sessions/Locations
-- there is no GroupDataSharing clause: a sharing grant exposes a group's *bird
-- data*, not the operational record of how that data got loaded, and an import run
-- is only ever created and updated by the group that performed it.
CREATE POLICY group_import_jobs_access ON public."ImportJobs" FOR
SELECT
	USING (
		ringing_group_id = (
			(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
		)::bigint
	);

CREATE POLICY group_import_jobs_insert ON public."ImportJobs" FOR INSERT
WITH
	CHECK (
		ringing_group_id = (
			(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
		)::bigint
	);

CREATE POLICY group_import_jobs_update ON public."ImportJobs"
FOR UPDATE
	USING (
		ringing_group_id = (
			(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
		)::bigint
	)
WITH
	CHECK (
		ringing_group_id = (
			(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
		)::bigint
	);

ALTER SEQUENCE public."ImportJobs_id_seq" OWNED BY public."ImportJobs".id;

ALTER TABLE public."ImportJobs" ENABLE ROW LEVEL SECURITY;

-- A plain serial PK, stable enough for DemonRecords.import_job_id to reference
-- (#960).
ALTER TABLE public."ImportJobs"
ADD CONSTRAINT "ImportJobs_pkey" PRIMARY KEY (id);

ALTER TABLE public."ImportJobs"
ADD CONSTRAINT import_jobs_ringing_group_id_fkey FOREIGN KEY (ringing_group_id) REFERENCES public."RingingGroups" (id) ON DELETE CASCADE;

-- `anon` is deliberately not granted here, but schema.sql's ALTER DEFAULT PRIVILEGES
-- hands it SELECT/INSERT/UPDATE/DELETE on every new public table regardless. That is
-- harmless: none of the three policies above has a `TO` clause, so they apply to
-- `anon` too, and an anonymous request has no `app_metadata.ringing_group_id` claim —
-- the comparison is NULL, so it reads no rows and can write none.
GRANT ALL ON public."ImportJobs" TO authenticated;

GRANT ALL ON public."ImportJobs" TO service_role;
