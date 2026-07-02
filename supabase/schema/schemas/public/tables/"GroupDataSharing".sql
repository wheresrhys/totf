CREATE SEQUENCE public."GroupDataSharing_id_seq";

CREATE TABLE public."GroupDataSharing" (
	id bigint DEFAULT nextval('public."GroupDataSharing_id_seq"'::regclass) NOT NULL,
	from_group_id bigint NOT NULL,
	to_group_id bigint NOT NULL,
	created_at timestamptz NOT NULL DEFAULT NOW(),
	CONSTRAINT no_self_share CHECK (from_group_id <> to_group_id),
	CONSTRAINT unique_share UNIQUE (from_group_id, to_group_id)
);

COMMENT ON TABLE public."GroupDataSharing" IS 'from_group_id shares their data with to_group_id';

CREATE POLICY group_data_sharing_select ON public."GroupDataSharing" FOR
SELECT
	USING (
		to_group_id = (
			(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
		)::bigint
	);

ALTER SEQUENCE public."GroupDataSharing_id_seq" OWNED BY public."GroupDataSharing".id;

ALTER TABLE public."GroupDataSharing" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."GroupDataSharing"
ADD CONSTRAINT "GroupDataSharing_pkey" PRIMARY KEY (id);

ALTER TABLE public."GroupDataSharing"
ADD CONSTRAINT group_data_sharing_from_group_id_fkey FOREIGN KEY (from_group_id) REFERENCES public."RingingGroups" (id) ON DELETE CASCADE;

ALTER TABLE public."GroupDataSharing"
ADD CONSTRAINT group_data_sharing_to_group_id_fkey FOREIGN KEY (to_group_id) REFERENCES public."RingingGroups" (id) ON DELETE CASCADE;

GRANT ALL ON public."GroupDataSharing" TO anon;

GRANT ALL ON public."GroupDataSharing" TO authenticated;

GRANT ALL ON public."GroupDataSharing" TO service_role;
