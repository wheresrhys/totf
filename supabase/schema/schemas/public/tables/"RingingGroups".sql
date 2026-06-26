CREATE TABLE public."RingingGroups" (
	group_name text NOT NULL,
	id bigint DEFAULT nextval('public."RingingGroups_id_seq"'::regclass) NOT NULL,
	password_hash text
);

CREATE POLICY ringing_groups_access ON public."RingingGroups" FOR
SELECT
	USING (TRUE);

CREATE POLICY ringing_groups_insert ON public."RingingGroups" FOR INSERT
WITH
	CHECK (TRUE);

CREATE POLICY ringing_groups_update ON public."RingingGroups"
FOR UPDATE
	USING (
		(
			id = (
				(
					(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
				)
			)::bigint
		)
	)
WITH
	CHECK (
		(
			id = (
				(
					(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
				)
			)::bigint
		)
	);

COMMENT ON TABLE public."RingingGroups" IS 'Ringing groups';

ALTER SEQUENCE public."RingingGroups_id_seq" OWNED BY public."RingingGroups".id;

ALTER TABLE public."RingingGroups" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."RingingGroups"
ADD CONSTRAINT "RingingGroups_group_name_unique" UNIQUE (group_name);

ALTER TABLE public."RingingGroups"
ADD CONSTRAINT "RingingGroups_pkey" PRIMARY KEY (id);

GRANT ALL ON public."RingingGroups" TO anon;

GRANT ALL ON public."RingingGroups" TO authenticated;

GRANT ALL ON public."RingingGroups" TO service_role;
