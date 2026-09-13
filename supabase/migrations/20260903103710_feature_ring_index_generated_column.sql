ALTER TABLE public."Birds" ADD COLUMN ring_index bigint GENERATED ALWAYS AS (("substring"(ring_no, '[0-9]+$'::text))::bigint) STORED;
ALTER TABLE public."Birds" ADD COLUMN ring_prefix text GENERATED ALWAYS AS ("left"(ring_no, 3)) STORED;
