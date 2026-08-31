CREATE FUNCTION public.trg_refresh_ring_sequence_bounds () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
	search_path TO 'public' AS $function$
DECLARE
  alpha_prefix text;
  numeric_str text;
  numeric_width integer;
  ring_index integer;
  start_index integer;
  start_ring text;
  seq_row "public"."RingSequences"%ROWTYPE;
  new_first_ring text;
  existing_first_idx integer;
  last_index integer;
  first_index integer;
  last_width integer;
  new_last_ring text;
BEGIN
  -- No-op unless this bird is assigned to a ring sequence, and (on UPDATE) the
  -- assignment actually changed. TG_OP is branched so OLD is never dereferenced
  -- on an INSERT.
  IF NEW.ring_sequence_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.ring_sequence_id IS NOT DISTINCT FROM NEW.ring_sequence_id THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Split the ring number into its leading alphabetic prefix and trailing numeric
  -- portion, e.g. "AEL1699" -> alpha_prefix "AEL", numeric_str "1699".
  alpha_prefix := substring(NEW.ring_no FROM '^[A-Za-z]+');
  numeric_str := substring(NEW.ring_no FROM '[0-9]+$');
  numeric_width := length(numeric_str);
  ring_index := numeric_str::integer;

  -- Step 1: this ring's decade start — greatest number ending in 1 that is < ring_index.
  start_index := 10 * floor((ring_index - 2)::numeric / 10)::int + 1;
  start_ring := alpha_prefix || lpad(start_index::text, numeric_width, '0');

  -- Lock the referenced sequence row so concurrent assignments serialise on it.
  SELECT * INTO seq_row FROM "public"."RingSequences" WHERE id = NEW.ring_sequence_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Steps 2/3: maybe move first_ring backward to cover this ring's decade start.
  IF seq_row.first_ring IS NULL THEN
    new_first_ring := start_ring;
  ELSE
    existing_first_idx := substring(seq_row.first_ring FROM '[0-9]+$')::integer;
    new_first_ring := CASE WHEN start_index < existing_first_idx THEN start_ring ELSE seq_row.first_ring END;
  END IF;

  -- Step 4: establish the current last_index (defaulting to one full decade when empty).
  last_index := CASE
    WHEN seq_row.last_ring IS NOT NULL THEN substring(seq_row.last_ring FROM '[0-9]+$')::integer
    ELSE start_index + 9
  END;

  -- Step 5: widen to cover ring_index if needed, rounding up to the nearest ten.
  IF ring_index > last_index THEN
    last_index := CASE WHEN ring_index % 10 = 0 THEN ring_index ELSE ring_index + (10 - ring_index % 10) END;
  END IF;

  -- Steps 6/7: escalate the batch width in tiers, relative to the (possibly just-moved)
  -- first_ring, based on the width actually required to cover this ring. Evaluated
  -- largest-tier-first so a required width over 100 reaches the 500 tier: a plain pair
  -- of sequential IFs would snap the width to exactly 100 in the first branch and could
  -- never then satisfy the second branch's "> 100" check, leaving the 500 tier dead.
  first_index := substring(new_first_ring FROM '[0-9]+$')::integer;
  IF (last_index - first_index) > 100 THEN
    last_index := first_index + 500;
  ELSIF (last_index - first_index) > 50 THEN
    last_index := first_index + 100;
  END IF;

  -- Step 8: write back — pad to the ring's numeric width, but grow the digit count
  -- rather than truncate if escalation pushed last_index past what that width holds.
  last_width := GREATEST(numeric_width, length(last_index::text));
  new_last_ring := alpha_prefix || lpad(last_index::text, last_width, '0');

  UPDATE "public"."RingSequences"
  SET first_ring = new_first_ring,
    last_ring = new_last_ring
  WHERE id = NEW.ring_sequence_id;

  RETURN NEW;
END;
$function$;

GRANT ALL ON FUNCTION public.trg_refresh_ring_sequence_bounds () TO anon;

GRANT ALL ON FUNCTION public.trg_refresh_ring_sequence_bounds () TO authenticated;

GRANT ALL ON FUNCTION public.trg_refresh_ring_sequence_bounds () TO service_role;
