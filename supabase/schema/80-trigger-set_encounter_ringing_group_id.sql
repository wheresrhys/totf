CREATE OR REPLACE FUNCTION "public"."set_encounter_ringing_group_id"()
RETURNS TRIGGER AS $$
BEGIN
  SELECT "ringing_group_id"
  INTO NEW."ringing_group_id"
  FROM "public"."Locations"
  WHERE "id" = NEW."location_id";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Location % not found', NEW."location_id";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER "trigger_set_encounter_ringing_group_id"
BEFORE INSERT OR UPDATE OF "location_id"
ON "public"."Encounters"
FOR EACH ROW
EXECUTE FUNCTION "public"."set_encounter_ringing_group_id"();
