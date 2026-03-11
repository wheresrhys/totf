CREATE OR REPLACE FUNCTION "public"."set_session_generated_fields" () RETURNS TRIGGER AS $$
BEGIN
  SELECT
    l."ringing_group_id"
  INTO NEW."ringing_group_id"
  FROM "public"."Locations" l
  WHERE l."id" = NEW."location_id";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Location % not found', NEW."location_id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER "trigger_set_session_generated_fields" BEFORE INSERT
OR
UPDATE OF "location_id" ON "public"."Sessions" FOR EACH ROW
EXECUTE FUNCTION "public"."set_session_generated_fields" ();
