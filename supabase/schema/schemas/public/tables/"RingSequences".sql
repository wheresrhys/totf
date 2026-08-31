CREATE TABLE public."RingSequences" (
	id bigint DEFAULT nextval('public."RingSequences_id_seq"'::regclass) NOT NULL,
	size public.ring_size,
	prefix text NOT NULL,
	owned_by_group boolean DEFAULT true NOT NULL,
	ringing_group_id bigint NOT NULL,
	first_ring text,
	last_ring text
);

CREATE INDEX idx_ring_sequences_ringing_group_id ON public."RingSequences" (ringing_group_id);

-- SELECT: strictly own-group only — no cross-group sharing via GroupDataSharing
CREATE POLICY group_ring_sequences_access ON public."RingSequences" FOR
SELECT
	USING (
		ringing_group_id = (
			(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
		)::bigint
	);

-- INSERT: only the owning group can insert ring sequences
CREATE POLICY group_ring_sequences_insert ON public."RingSequences" FOR INSERT
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

-- UPDATE: only the owning group can update ring sequences
CREATE POLICY group_ring_sequences_update ON public."RingSequences"
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

ALTER SEQUENCE public."RingSequences_id_seq" OWNED BY public."RingSequences".id;

ALTER TABLE public."RingSequences" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."RingSequences"
ADD UNIQUE (prefix, ringing_group_id);

ALTER TABLE public."RingSequences"
ADD CONSTRAINT "RingSequences_pkey" PRIMARY KEY (id);

ALTER TABLE public."RingSequences"
ADD CONSTRAINT ring_sequences_ringing_group_id_fkey FOREIGN KEY (ringing_group_id) REFERENCES public."RingingGroups" (id);

GRANT ALL ON public."RingSequences" TO anon;

GRANT ALL ON public."RingSequences" TO authenticated;

GRANT ALL ON public."RingSequences" TO service_role;
