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
	is_juv boolean DEFAULT FALSE NOT NULL,
	id bigint DEFAULT nextval('public."Encounters_id_seq"'::regclass) NOT NULL,
	bird_id bigint NOT NULL,
	session_id bigint NOT NULL,
	ringing_group_id bigint NOT NULL,
	age_code smallint NOT NULL,
	max_hatch_year smallint NOT NULL,
	min_hatch_year smallint NOT NULL
);

CREATE INDEX idx_encounters_bird_id ON public."Encounters" (bird_id);

CREATE INDEX idx_encounters_ringing_group_id ON public."Encounters" (ringing_group_id);

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

CREATE TRIGGER trigger_trg_set_encounter_generated_fields BEFORE INSERT
OR
UPDATE OF session_id,
capture_time ON public."Encounters" FOR EACH ROW
EXECUTE FUNCTION public.trg_set_encounter_generated_fields ();

CREATE TRIGGER trigger_trg_update_bird_ringing_group_id
AFTER
UPDATE OF ringing_group_id ON public."Encounters" FOR EACH ROW
EXECUTE FUNCTION public.trg_update_bird_ringing_group_id ();

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
				from_group_id = ringing_group_id
				AND to_group_id = (
					(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
				)::bigint
		)
	);

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

ALTER TABLE public."Encounters"
ADD CONSTRAINT encounters_bird_id_session_id_unique UNIQUE (bird_id, session_id);

ALTER TABLE public."Encounters"
ADD CONSTRAINT encounters_ringing_group_id_fkey FOREIGN KEY (ringing_group_id) REFERENCES public."RingingGroups" (id);

ALTER TABLE public."Encounters"
ADD CONSTRAINT encounters_session_id_fkey FOREIGN KEY (session_id) REFERENCES public."Sessions" (id);

GRANT ALL ON public."Encounters" TO anon;

GRANT ALL ON public."Encounters" TO authenticated;

GRANT ALL ON public."Encounters" TO service_role;
