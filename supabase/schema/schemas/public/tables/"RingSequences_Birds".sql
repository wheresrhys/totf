-- Replaces the single group-agnostic `Birds.ring_sequence_id` FK (removed by this
-- same migration) with a per-group link table. The old FK gave a bird exactly one
-- sequence slot shared across every group that had encountered it, so any group
-- could attach a "shadow sequence" to a bird it did not own and permanently block
-- the true owning group from ever linking that bird to its own sequence (issue
-- #703). Each group now tracks its own bird<->sequence links independently: a
-- link row is scoped to the writing group via `ringing_group_id`, and RLS (below)
-- restricts every operation to the caller's own group with no cross-group sharing
-- (mirroring "RingSequences".sql's own-group-only policy) — so one group's link
-- can never be created, read, changed or removed by another.
CREATE TABLE public."RingSequences_Birds" (
	id bigint DEFAULT nextval('public."RingSequences_Birds_id_seq"'::regclass) NOT NULL,
	bird_id bigint NOT NULL,
	ring_sequence_id bigint NOT NULL,
	ringing_group_id bigint NOT NULL
);

CREATE INDEX idx_ring_sequences_birds_bird_id ON public."RingSequences_Birds" (bird_id);

CREATE INDEX idx_ring_sequences_birds_ringing_group_id ON public."RingSequences_Birds" (ringing_group_id);

-- SELECT/INSERT/UPDATE/DELETE: strictly own-group only — no cross-group sharing via
-- GroupDataSharing, matching "RingSequences".sql. A group can only see or mutate
-- its own bird<->sequence links, so it can never read, plant, alter or remove a
-- link belonging to another group.
CREATE POLICY group_ring_sequences_birds_access ON public."RingSequences_Birds" FOR
SELECT
	USING (
		ringing_group_id = (
			(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
		)::bigint
	);

CREATE POLICY group_ring_sequences_birds_insert ON public."RingSequences_Birds" FOR INSERT
WITH
	CHECK (
		ringing_group_id = (
			(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
		)::bigint
	);

CREATE POLICY group_ring_sequences_birds_update ON public."RingSequences_Birds"
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

CREATE POLICY group_ring_sequences_birds_delete ON public."RingSequences_Birds" FOR DELETE USING (
	ringing_group_id = (
		(auth.jwt () -> 'app_metadata'::text) ->> 'ringing_group_id'::text
	)::bigint
);

ALTER SEQUENCE public."RingSequences_Birds_id_seq" OWNED BY public."RingSequences_Birds".id;

ALTER TABLE public."RingSequences_Birds" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."RingSequences_Birds"
ADD CONSTRAINT "RingSequences_Birds_pkey" PRIMARY KEY (id);

ALTER TABLE public."RingSequences_Birds"
ADD UNIQUE (bird_id, ring_sequence_id, ringing_group_id);

ALTER TABLE public."RingSequences_Birds"
ADD CONSTRAINT ring_sequences_birds_bird_id_fkey FOREIGN KEY (bird_id) REFERENCES public."Birds" (id);

ALTER TABLE public."RingSequences_Birds"
ADD CONSTRAINT ring_sequences_birds_ring_sequence_id_fkey FOREIGN KEY (ring_sequence_id) REFERENCES public."RingSequences" (id);

ALTER TABLE public."RingSequences_Birds"
ADD CONSTRAINT ring_sequences_birds_ringing_group_id_fkey FOREIGN KEY (ringing_group_id) REFERENCES public."RingingGroups" (id);

GRANT ALL ON public."RingSequences_Birds" TO anon;

GRANT ALL ON public."RingSequences_Birds" TO authenticated;

GRANT ALL ON public."RingSequences_Birds" TO service_role;
