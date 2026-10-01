-- A Session is now simply "a group's visit on a date" — one row per
-- (ringing_group_id, visit_date). It carries no location and no session_type
-- (#1024): both moved to, or are derivable from, the Encounters that reference
-- it. `Encounters.location_id` holds where each encounter happened (#1015), so a
-- group-day spanning several sites is one Session with encounters at several
-- locations rather than one Session per site; and the old
-- FULL_GROWN/PULLI/FIELD_OBSERVATION bucketing is re-derived where it is
-- actually needed from each encounter's own record_type/age_code/is_juv (see
-- app/(routes)/sessions/page.tsx and queries/Encounters/pulli-encounters.ts).
CREATE TABLE public."Sessions" (
	id bigint DEFAULT nextval('public."Sessions_id_seq"'::regclass) NOT NULL,
	visit_date date NOT NULL,
	ringing_group_id bigint NOT NULL
);

CREATE INDEX idx_sessions_ringing_group_id ON public."Sessions" (ringing_group_id);

-- SELECT: grants access if the session belongs to the logged-in group, or if the session's group
-- has granted read access to the logged-in group via GroupDataSharing
CREATE POLICY group_sessions_access ON public."Sessions" FOR
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

-- INSERT: only the owning group can insert sessions
CREATE POLICY group_sessions_insert ON public."Sessions" FOR INSERT
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

-- UPDATE: only the owning group can update sessions
CREATE POLICY group_sessions_update ON public."Sessions"
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

ALTER SEQUENCE public."Sessions_id_seq" OWNED BY public."Sessions".id;

ALTER TABLE public."Sessions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."Sessions"
ADD CONSTRAINT "Sessions_pkey" PRIMARY KEY (id);

-- One Session per group per date (#1024), replacing the old
-- (visit_date, location_id, session_type) triple. `ringing_group_id` is written
-- directly by lib/demon-import.ts now that trg_set_session_generated_fields is
-- retired, and this is the key its Sessions upsert conflict-targets.
ALTER TABLE public."Sessions"
ADD CONSTRAINT "Sessions_visit_date_ringing_group_id_key" UNIQUE (visit_date, ringing_group_id);

ALTER TABLE public."Sessions"
ADD CONSTRAINT sessions_ringing_group_id_fkey FOREIGN KEY (ringing_group_id) REFERENCES public."RingingGroups" (id);

GRANT ALL ON public."Sessions" TO anon;

GRANT ALL ON public."Sessions" TO authenticated;

GRANT ALL ON public."Sessions" TO service_role;
