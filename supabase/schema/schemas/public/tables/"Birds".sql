CREATE TABLE public."Birds" (
	ring_no text NOT NULL,
	id bigint DEFAULT nextval('public."Birds_id_seq"'::regclass) NOT NULL,
	species_id bigint NOT NULL,
	last_encountered_timestamp timestamp without time zone DEFAULT '0001-01-01 00:00:00'::timestamp WITHOUT time zone NOT NULL,
	ringing_group_ids BIGINT[] DEFAULT '{}'::BIGINT[] NOT NULL,
	proven_age smallint DEFAULT 0 NOT NULL
);

CREATE INDEX idx_birds_ringing_group_ids ON public."Birds" USING gin (ringing_group_ids);

CREATE INDEX idx_birds_species_id ON public."Birds" (species_id);

-- SELECT: grants access if any of:
-- 1. The logged-in group is one of the groups that has ringed this bird (its id is in ringing_group_ids)
-- 2. The bird has no ringing group yet (empty array, e.g. freshly imported) and the user is authenticated
-- 3. A group that has ringed this bird has granted read access to the logged-in group via GroupDataSharing
CREATE POLICY group_birds_access ON public."Birds" FOR
SELECT
	USING (
		(
			(
				(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
			)::bigint = ANY (ringing_group_ids)
			OR (
				(ringing_group_ids = '{}'::BIGINT[])
				AND (
					(
						(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
					)::bigint IS NOT NULL
				)
			)
			OR EXISTS (
				SELECT
					1
				FROM
					public."GroupDataSharing" gds
					JOIN unnest(ringing_group_ids) gid ON gid = gds.granter_group_id
				WHERE
					gds.recipient_group_id = (
						(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
					)::bigint
			)
		)
	);

-- INSERT: allows any authenticated group to insert birds (group ownership is tracked via ringing_group_ids, set by triggers)
CREATE POLICY group_birds_insert ON public."Birds" FOR INSERT
WITH
	CHECK (
		(
			(
				(
					(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
				)
			)::bigint IS NOT NULL
		)
	);

-- UPDATE: allows any authenticated group to update birds (shared birds can be updated by any group that has encountered them)
CREATE POLICY group_birds_update ON public."Birds"
FOR UPDATE
	USING (
		(
			(
				(
					(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
				)
			)::bigint IS NOT NULL
		)
	)
WITH
	CHECK (
		(
			(
				(
					(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
				)
			)::bigint IS NOT NULL
		)
	);

COMMENT ON TABLE public."Birds" IS '@graphql({"aggregate": {"enabled": true}})';

ALTER SEQUENCE public."Birds_id_seq" OWNED BY public."Birds".id;

ALTER TABLE public."Birds" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."Birds"
ADD CONSTRAINT "Birds_pkey" PRIMARY KEY (id);

ALTER TABLE public."Birds"
ADD CONSTRAINT birds_ring_no_unique UNIQUE (ring_no);

ALTER TABLE public."Birds"
ADD CONSTRAINT birds_species_id_fkey FOREIGN KEY (species_id) REFERENCES public."Species" (id);

GRANT ALL ON public."Birds" TO anon;

GRANT ALL ON public."Birds" TO authenticated;

GRANT ALL ON public."Birds" TO service_role;
