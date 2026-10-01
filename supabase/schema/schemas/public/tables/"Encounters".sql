CREATE TABLE public."Encounters" (
	capture_time time without time zone NOT NULL,
	record_type text NOT NULL,
	scheme text NOT NULL,
	sex text NOT NULL,
	sexing_method text,
	breeding_condition text,
	wing_length smallint,
	weight real,
	moult_code text,
	old_greater_coverts smallint,
	extra_text text,
	primary_moult text,
	fat text,
	pectoral_muscle smallint,
	capture_method text,
	lure_code_1 text,
	lure_code_2 text,
	finding_condition text,
	finding_circumstances text,
	is_juv boolean DEFAULT FALSE NOT NULL,
	id bigint DEFAULT nextval('public."Encounters_id_seq"'::regclass) NOT NULL,
	bird_id bigint NOT NULL,
	session_id bigint NOT NULL,
	location_id bigint NOT NULL,
	visit_date date NOT NULL,
	ringing_group_id bigint NOT NULL,
	age_code smallint NOT NULL,
	max_hatch_year smallint NOT NULL,
	min_hatch_year smallint NOT NULL
);

CREATE INDEX idx_encounters_bird_id ON public."Encounters" (bird_id);

CREATE INDEX idx_encounters_location_id ON public."Encounters" (location_id);

CREATE INDEX idx_encounters_ringing_group_id ON public."Encounters" (ringing_group_id);

CREATE INDEX idx_encounters_ringing_group_id_visit_date ON public."Encounters" (ringing_group_id, visit_date);

CREATE INDEX idx_encounters_session_id ON public."Encounters" (session_id);

CREATE TRIGGER trigger_trg_add_bird_ringing_group_id
AFTER INSERT ON public."Encounters" FOR EACH ROW
EXECUTE FUNCTION public.trg_add_bird_ringing_group_id ();

CREATE TRIGGER trigger_encounters_refresh_bird_proven_age
AFTER INSERT
OR DELETE
OR
UPDATE ON public."Encounters" FOR EACH ROW
EXECUTE FUNCTION public.trg_encounters_refresh_bird_proven_age ();

CREATE TRIGGER trigger_trg_remove_bird_ringing_group_id BEFORE DELETE ON public."Encounters" FOR EACH ROW
EXECUTE FUNCTION public.trg_remove_bird_ringing_group_id ();

-- Watches location_id/visit_date rather than session_id (#1024): those are the
-- columns the function now derives ringing_group_id/max_hatch_year/
-- min_hatch_year and Birds.last_encountered_timestamp from.
CREATE TRIGGER trigger_trg_set_encounter_generated_fields BEFORE INSERT
OR
UPDATE OF location_id,
visit_date,
capture_time ON public."Encounters" FOR EACH ROW
EXECUTE FUNCTION public.trg_set_encounter_generated_fields ();

CREATE TRIGGER trigger_trg_suppress_same_session_retrap BEFORE
UPDATE ON public."Encounters" FOR EACH ROW
EXECUTE FUNCTION public.trg_suppress_same_session_retrap ();

CREATE TRIGGER trigger_trg_update_bird_ringing_group_id
AFTER
UPDATE OF ringing_group_id ON public."Encounters" FOR EACH ROW
EXECUTE FUNCTION public.trg_update_bird_ringing_group_id ();

-- SELECT: grants access if the encounter belongs to the logged-in group, or if the encounter's group
-- has granted read access to the logged-in group via GroupDataSharing
CREATE POLICY group_encounters_access ON public."Encounters" FOR
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

-- INSERT: only the owning group can insert encounters
CREATE POLICY group_encounters_insert ON public."Encounters" FOR INSERT
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

-- UPDATE: only the owning group can update encounters
CREATE POLICY group_encounters_update ON public."Encounters"
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

COMMENT ON TABLE public."Encounters" IS 'Encounters with individual birds';

ALTER SEQUENCE public."Encounters_id_seq" OWNED BY public."Encounters".id;

ALTER TABLE public."Encounters" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."Encounters"
ADD CONSTRAINT "Encounters_pkey" PRIMARY KEY (id);

ALTER TABLE public."Encounters"
ADD CONSTRAINT encounters_bird_id_fkey FOREIGN KEY (bird_id) REFERENCES public."Birds" (id);

-- Repointed off (bird_id, session_id) in #1024. A Session is now one row per
-- (ringing_group_id, visit_date), so keying on session_id would have silently
-- weakened to "one encounter per bird per group per day" — collapsing a bird
-- genuinely caught at two different sites on one day into a single row on
-- import. Keying on the encounter's own location_id/visit_date preserves
-- exactly what (bird_id, session_id) used to mean when a Session was
-- (date, location, type), minus the session_type axis that no longer exists.
--
-- NOTE: #1024's body specified this as UNIQUE (bird_id, location_id). That is
-- a two-column key with no date in it, so it would have rejected every retrap
-- of a bird at a site it had been caught at before — the central case this app
-- exists to record. Probed against the seeded local DB it collided on 5
-- bird/location pairs and would have discarded 10 of 64 encounters. visit_date
-- is therefore kept in the key, matching the (bird_id, visit_date, location_id)
-- shape the ticket's own prior-investigation comment proposed and the only
-- shape its "0 existing collisions" measurement is true of.
ALTER TABLE public."Encounters"
ADD CONSTRAINT encounters_bird_id_location_id_visit_date_unique UNIQUE (bird_id, location_id, visit_date);

ALTER TABLE public."Encounters"
ADD CONSTRAINT encounters_location_id_fkey FOREIGN KEY (location_id) REFERENCES public."Locations" (id);

ALTER TABLE public."Encounters"
ADD CONSTRAINT encounters_ringing_group_id_fkey FOREIGN KEY (ringing_group_id) REFERENCES public."RingingGroups" (id);

ALTER TABLE public."Encounters"
ADD CONSTRAINT encounters_session_id_fkey FOREIGN KEY (session_id) REFERENCES public."Sessions" (id);

GRANT ALL ON public."Encounters" TO anon;

GRANT ALL ON public."Encounters" TO authenticated;

GRANT ALL ON public."Encounters" TO service_role;
