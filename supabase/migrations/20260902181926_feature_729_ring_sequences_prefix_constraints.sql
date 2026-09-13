ALTER TABLE public."RingSequences" ADD CONSTRAINT ring_sequences_first_last_ring_prefix_check CHECK ((first_ring IS NULL OR "left"(first_ring, length(prefix)) = prefix) AND (last_ring IS NULL OR "left"(last_ring, length(prefix)) = prefix));
ALTER TABLE public."RingSequences" ADD CONSTRAINT ring_sequences_prefix_length_check CHECK (length(prefix) = 3);
