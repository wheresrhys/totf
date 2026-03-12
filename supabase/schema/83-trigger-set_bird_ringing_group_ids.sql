CREATE OR REPLACE FUNCTION "public"."add_bird_ringing_group_id" () RETURNS TRIGGER SECURITY DEFINER AS $$
BEGIN
  UPDATE "public"."Birds"
  SET ringing_group_ids = CASE
    WHEN ringing_group_ids IS NULL THEN
      ARRAY[NEW.ringing_group_id]
    WHEN NOT (NEW.ringing_group_id = ANY(ringing_group_ids)) THEN
      array_append(ringing_group_ids, NEW.ringing_group_id)
    ELSE ringing_group_ids
  END
  WHERE id = NEW.bird_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER "trigger_add_bird_ringing_group_id"
AFTER INSERT ON "public"."Encounters" FOR EACH ROW
EXECUTE FUNCTION "public"."add_bird_ringing_group_id" ();

CREATE OR REPLACE FUNCTION "public"."remove_bird_ringing_group_id" () RETURNS TRIGGER SECURITY DEFINER AS $$
BEGIN
  UPDATE "public"."Birds"
  SET ringing_group_ids = COALESCE(array_remove(ringing_group_ids, OLD.ringing_group_id), '{}')
  WHERE id = OLD.bird_id
    AND NOT EXISTS (
      SELECT 1 FROM "public"."Encounters" e
      WHERE e.bird_id = OLD.bird_id
        AND e.ringing_group_id = OLD.ringing_group_id
        AND e.id != OLD.id
      );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER "trigger_remove_bird_ringing_group_id" BEFORE DELETE ON "public"."Encounters" FOR EACH ROW
EXECUTE FUNCTION "public"."remove_bird_ringing_group_id" ();

CREATE OR REPLACE FUNCTION "public"."update_bird_ringing_group_id" () RETURNS TRIGGER SECURITY DEFINER AS $$
BEGIN
  -- Only act when ringing_group_id actually changed
  IF OLD.ringing_group_id IS DISTINCT FROM NEW.ringing_group_id THEN
    -- Remove old group id if no other encounters for this bird in that group
    IF OLD.ringing_group_id IS NOT NULL THEN
      UPDATE "public"."Birds"
      SET ringing_group_ids = COALESCE(array_remove(ringing_group_ids, OLD.ringing_group_id), '{}')
      WHERE id = NEW.bird_id
        AND NOT EXISTS (
          SELECT 1 FROM "public"."Encounters" e
          WHERE e.bird_id = OLD.bird_id
            AND e.ringing_group_id = OLD.ringing_group_id
            AND e.id != OLD.id
        );
    END IF;

    -- Add new group id if not already present
    IF NEW.ringing_group_id IS NOT NULL THEN
      UPDATE "public"."Birds"
      SET ringing_group_ids = CASE
        WHEN ringing_group_ids IS NULL THEN ARRAY[NEW.ringing_group_id]
        WHEN NOT (NEW.ringing_group_id = ANY(ringing_group_ids)) THEN array_append(ringing_group_ids, NEW.ringing_group_id)
        ELSE ringing_group_ids
      END
      WHERE id = NEW.bird_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trigger_update_bird_ringing_group_id"
AFTER
UPDATE OF "ringing_group_id" ON "public"."Encounters" FOR EACH ROW
EXECUTE FUNCTION "public"."update_bird_ringing_group_id" ();
