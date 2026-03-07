CREATE OR REPLACE FUNCTION "public"."set_encounter_ringing_group_id" () RETURNS TRIGGER AS $$
BEGIN
  SELECT l."ringing_group_id"
  INTO NEW."ringing_group_id"
  FROM "public"."Sessions" s
  JOIN "public"."Locations" l ON l."id" = s."location_id"
  WHERE s."id" = NEW."session_id";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session % not found or has no location', NEW."session_id";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER "trigger_set_encounter_ringing_group_id" BEFORE INSERT
OR
UPDATE OF "session_id" ON "public"."Encounters" FOR EACH ROW
EXECUTE FUNCTION "public"."set_encounter_ringing_group_id" ();
