SET check_function_bodies = false;
DROP TRIGGER trigger_trg_refresh_ring_sequence_bounds ON public."Birds";
DROP FUNCTION public.trg_refresh_ring_sequence_bounds();
ALTER TABLE public."RingSequences" ADD COLUMN first_index bigint GENERATED ALWAYS AS (("substring"(first_ring, '[0-9]+$'::text))::bigint) STORED;
ALTER TABLE public."RingSequences" ADD COLUMN last_index bigint GENERATED ALWAYS AS (("substring"(last_ring, '[0-9]+$'::text))::bigint) STORED;
