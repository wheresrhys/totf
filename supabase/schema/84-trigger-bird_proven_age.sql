CREATE OR REPLACE FUNCTION "public"."trg_encounters_refresh_bird_proven_age" () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
	search_path = public AS $$
DECLARE
  v_bird_id bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_bird_id := OLD.bird_id;
  ELSE
    v_bird_id := NEW.bird_id;
  END IF;

  UPDATE "public"."Birds" b
  SET proven_age = (
    SELECT
      EXTRACT(YEAR FROM MAX(s.visit_date))::integer - MIN(e.max_hatch_year)
    FROM "public"."Encounters" e
    JOIN "public"."Sessions" s ON s.id = e.session_id
    WHERE e.bird_id = v_bird_id
  )
  WHERE b.id = v_bird_id;

  IF TG_OP = 'UPDATE'
  AND OLD.bird_id IS DISTINCT FROM NEW.bird_id THEN
    UPDATE "public"."Birds" b
    SET proven_age = (
      SELECT
        EXTRACT(YEAR FROM MAX(s.visit_date))::integer - MIN(e.max_hatch_year)
      FROM "public"."Encounters" e
      JOIN "public"."Sessions" s ON s.id = e.session_id
      WHERE e.bird_id = OLD.bird_id
    )
    WHERE b.id = OLD.bird_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE TRIGGER "trigger_encounters_refresh_bird_proven_age"
AFTER INSERT
OR DELETE
OR
UPDATE ON "public"."Encounters" FOR EACH ROW
EXECUTE FUNCTION "public"."trg_encounters_refresh_bird_proven_age" ();
