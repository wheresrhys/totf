SET check_function_bodies = false;
ALTER TABLE public."Birds" DROP CONSTRAINT birds_ring_sequence_id_fkey;
DROP INDEX public.idx_birds_ring_sequence_id;
ALTER TABLE public."Birds" DROP COLUMN ring_sequence_id;
CREATE SEQUENCE public."RingSequences_Birds_id_seq";
CREATE OR REPLACE FUNCTION public.ring_sequence_controls(ringing_group_filter bigint DEFAULT NULL::bigint)
 RETURNS TABLE(ring_no text, species_name text, first_date date)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    b.ring_no,
    sp.species_name   AS species_name,
    MIN(s.visit_date) AS first_date
  FROM "Birds" b
  JOIN "Encounters" e  ON e.bird_id = b.id
  JOIN "Sessions"   s  ON s.id = e.session_id
  JOIN "Species"    sp ON sp.id = b.species_id
  WHERE (ringing_group_filter IS NULL OR s.ringing_group_id = ringing_group_filter)
    -- Exclude a ring only when THIS group has its own RingSequences_Birds link for
    -- the bird. Tracking is now per-group (issue #703 fixed the old group-agnostic
    -- Birds.ring_sequence_id FK, which let one group's link block every other
    -- group from ever seeing or tracking the same bird as a control). RLS on
    -- RingSequences_Birds already scopes rows to the caller's own group, and the
    -- explicit ringing_group_id match below is defence-in-depth rather than
    -- reliance on RLS alone.
    AND NOT EXISTS (
      SELECT 1
      FROM "RingSequences_Birds" rsb
      WHERE rsb.bird_id = b.id
        AND rsb.ringing_group_id = ringing_group_filter
    )
  GROUP BY b.ring_no, sp.species_name
  HAVING COUNT(*) = COUNT(*) FILTER (WHERE e.record_type = 'S')
  ORDER BY b.ring_no;
END;
$function$;
CREATE TABLE public."RingSequences_Birds" (id bigint DEFAULT nextval('public."RingSequences_Birds_id_seq"'::regclass) NOT NULL, bird_id bigint NOT NULL, ring_sequence_id bigint NOT NULL, ringing_group_id bigint NOT NULL);
ALTER SEQUENCE public."RingSequences_Birds_id_seq" OWNED BY public."RingSequences_Birds".id;
GRANT ALL ON SEQUENCE public."RingSequences_Birds_id_seq" TO anon;
GRANT ALL ON SEQUENCE public."RingSequences_Birds_id_seq" TO authenticated;
GRANT ALL ON SEQUENCE public."RingSequences_Birds_id_seq" TO service_role;
ALTER TABLE public."RingSequences_Birds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."RingSequences_Birds" ADD CONSTRAINT "RingSequences_Birds_bird_id_ring_sequence_id_ringing_group__key" UNIQUE (bird_id, ring_sequence_id, ringing_group_id);
ALTER TABLE public."RingSequences_Birds" ADD CONSTRAINT "RingSequences_Birds_pkey" PRIMARY KEY (id);
ALTER TABLE public."RingSequences_Birds" ADD CONSTRAINT ring_sequences_birds_bird_id_fkey FOREIGN KEY (bird_id) REFERENCES public."Birds"(id);
ALTER TABLE public."RingSequences_Birds" ADD CONSTRAINT ring_sequences_birds_ring_sequence_id_fkey FOREIGN KEY (ring_sequence_id) REFERENCES public."RingSequences"(id);
ALTER TABLE public."RingSequences_Birds" ADD CONSTRAINT ring_sequences_birds_ringing_group_id_fkey FOREIGN KEY (ringing_group_id) REFERENCES public."RingingGroups"(id);
GRANT ALL ON public."RingSequences_Birds" TO anon;
GRANT ALL ON public."RingSequences_Birds" TO authenticated;
GRANT ALL ON public."RingSequences_Birds" TO service_role;
CREATE INDEX idx_ring_sequences_birds_ringing_group_id ON public."RingSequences_Birds" (ringing_group_id);
CREATE INDEX idx_ring_sequences_birds_bird_id ON public."RingSequences_Birds" (bird_id);
CREATE POLICY group_ring_sequences_birds_access ON public."RingSequences_Birds" FOR SELECT USING ((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint));
CREATE POLICY group_ring_sequences_birds_delete ON public."RingSequences_Birds" FOR DELETE USING ((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint));
CREATE POLICY group_ring_sequences_birds_insert ON public."RingSequences_Birds" FOR INSERT WITH CHECK ((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint));
CREATE POLICY group_ring_sequences_birds_update ON public."RingSequences_Birds" FOR UPDATE USING ((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint)) WITH CHECK ((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint));
