-- The first stop for every imported CSV row (#960) — a near-verbatim staging
-- copy captured before any transformation, so a failed/partial import can
-- recover from a stored copy rather than requiring a re-upload, and a future
-- feature wanting a currently-unmodelled DemOn column can backfill from
-- `raw_row` without every group re-uploading their original files.
--
-- This ticket adds the table/constraints/RLS only — nothing in the import
-- write path (lib/demon-import.ts, supabase/scripts/import-csv.ts,
-- app/api/import/route.ts) writes a row here yet. See sibling ticket D2
-- (#959).
CREATE SEQUENCE public."DemonRecords_id_seq";

CREATE TABLE public."DemonRecords" (
	id bigint DEFAULT nextval('public."DemonRecords_id_seq"'::regclass) NOT NULL,
	-- The entire CSV row, essentially verbatim, keyed by the full
	-- DemonColumnNames column set (lib/demon-import.ts) — not just the subset
	-- the current importer models into Species/Birds/Sessions/Encounters.
	-- This non-lossy capture is the whole point of the table.
	raw_row jsonb NOT NULL,
	-- Mirrors Birds.ring_no / DemonRow['ring_no'], pulled out of raw_row into a
	-- real column so it can participate in the dedup constraint below without
	-- a jsonb path lookup.
	ring_no text NOT NULL,
	-- Sourced from the CSV's visit_date column, converted via the same
	-- DD/MM/YYYY -> YYYY-MM-DD transform convertDateFormat already applies
	-- (lib/demon-import.ts), stored as a real date matching Sessions.visit_date.
	encounter_date date NOT NULL,
	-- Sourced from the CSV's capture_time column, matching
	-- Encounters.capture_time's type.
	encounter_time time without time zone NOT NULL,
	-- The group whose import produced this row. A direct column rather than
	-- derived via a join through import_job_id, matching this schema's
	-- existing convention of every RLS-protected table carrying its own group
	-- column (Encounters, Sessions, etc.) rather than requiring policy
	-- evaluation to join through a parent table.
	ringing_group_id bigint NOT NULL,
	import_job_id bigint NOT NULL,
	created_at timestamptz DEFAULT NOW() NOT NULL,
	-- Last-modified timestamp. This schema has no existing updated-at-refresh
	-- trigger convention, so this follows the created_at precedent (DEFAULT
	-- NOW() at insert) and leaves refreshing it on every UPDATE/upsert to the
	-- write-path helpers (#959) rather than introducing a new trigger-based
	-- convention here.
	updated_at timestamptz DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE public."DemonRecords" IS 'Near-verbatim staging copy of every imported CSV row, captured before transformation, for import recovery and future backfill of currently-unmodelled DemOn columns';

CREATE INDEX idx_demon_records_import_job_id ON public."DemonRecords" (import_job_id);

CREATE INDEX idx_demon_records_ringing_group_id ON public."DemonRecords" (ringing_group_id);

-- SELECT: grants access if the row belongs to the logged-in group, or if the
-- row's group has granted read access to the logged-in group via
-- GroupDataSharing — same shape as Encounters/Sessions.
CREATE POLICY group_demon_records_access ON public."DemonRecords" FOR
SELECT
	USING (
		ringing_group_id = (
			(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
		)::bigint
		OR EXISTS (
			SELECT
				1
			FROM
				public."GroupDataSharing"
			WHERE
				granter_group_id = ringing_group_id
				AND recipient_group_id = (
					(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
				)::bigint
		)
	);

-- INSERT: only the owning group can insert DemonRecords rows
CREATE POLICY group_demon_records_insert ON public."DemonRecords" FOR INSERT
WITH
	CHECK (
		(
			ringing_group_id = (
				(
					(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
				)
			)::bigint
		)
	);

-- UPDATE: only the owning group can update DemonRecords rows
CREATE POLICY group_demon_records_update ON public."DemonRecords"
FOR UPDATE
	USING (
		(
			ringing_group_id = (
				(
					(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
				)
			)::bigint
		)
	)
WITH
	CHECK (
		(
			ringing_group_id = (
				(
					(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
				)
			)::bigint
		)
	);

ALTER SEQUENCE public."DemonRecords_id_seq" OWNED BY public."DemonRecords".id;

ALTER TABLE public."DemonRecords" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."DemonRecords"
ADD CONSTRAINT "DemonRecords_pkey" PRIMARY KEY (id);

-- Mirrors the granularity the existing importer already treats as "one
-- physical encounter" (see processEncounterRow's (bird_id, session_id)
-- upsert key, where bird_id resolves 1:1 from ring_no and session_id from
-- (visit_date, location_id, session_type)). Two CSV rows for the same ring on
-- the same date/time are the same physical capture event regardless of which
-- upload or date-range export they came from, so re-importing an overlapping
-- CSV upserts onto the same DemonRecords row instead of duplicating it.
-- location_id/session_type are deliberately excluded: unlike Sessions,
-- DemonRecords doesn't split rows by session type, and a ring/date/time is
-- already precise enough to identify one bird-in-hand event without them.
ALTER TABLE public."DemonRecords"
ADD CONSTRAINT demon_records_group_ring_date_time_unique UNIQUE (
	ringing_group_id,
	ring_no,
	encounter_date,
	encounter_time
);

ALTER TABLE public."DemonRecords"
ADD CONSTRAINT demon_records_import_job_id_fkey FOREIGN KEY (import_job_id) REFERENCES public."ImportJobs" (id);

ALTER TABLE public."DemonRecords"
ADD CONSTRAINT demon_records_ringing_group_id_fkey FOREIGN KEY (ringing_group_id) REFERENCES public."RingingGroups" (id);

GRANT ALL ON public."DemonRecords" TO anon;

GRANT ALL ON public."DemonRecords" TO authenticated;

GRANT ALL ON public."DemonRecords" TO service_role;
