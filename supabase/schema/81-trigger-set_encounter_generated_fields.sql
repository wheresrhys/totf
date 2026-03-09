CREATE OR REPLACE FUNCTION "public"."set_encounter_generated_fields" () RETURNS TRIGGER AS $$
BEGIN
  SELECT
    l."ringing_group_id",
    CASE
				WHEN NEW.age_code % 2 = 0 THEN EXTRACT(
					YEAR
					FROM
						s.visit_date
				)::INTEGER - (NEW.age_code / 2 - 1)
				WHEN NEW.age_code % 2 = 1
				AND NEW.age_code > 1 THEN EXTRACT(
					YEAR
					FROM
						s.visit_date
				)::INTEGER - ((NEW.age_code - 3) / 2)
				ELSE EXTRACT(
					YEAR
					FROM
						s.visit_date
				)::INTEGER
			END AS max_hatch_year,
			CASE
				WHEN NEW.age_code % 2 = 0 THEN 0
				WHEN NEW.age_code % 2 = 1
				AND NEW.age_code > 1 THEN EXTRACT(
					YEAR
					FROM
						s.visit_date
				)::INTEGER - ((NEW.age_code - 3) / 2)
				ELSE EXTRACT(
					YEAR
					FROM
						s.visit_date
				)::INTEGER
			END AS min_hatch_year
  INTO NEW."ringing_group_id", NEW."max_hatch_year", NEW."min_hatch_year"
  FROM "public"."Sessions" s
  JOIN "public"."Locations" l ON l."id" = s."location_id"
  WHERE s."id" = NEW."session_id";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session % not found or has no location', NEW."session_id";
  END IF;

  -- Update Birds.last_encountered_timestamp when encounter timestamp is newer
  UPDATE "public"."Birds" b
  SET last_encountered_timestamp = (s.visit_date + COALESCE(NEW.capture_time, '00:00:00'::time))
  FROM "public"."Sessions" s
  WHERE b.id = NEW.bird_id
    AND s.id = NEW.session_id
    AND (b.last_encountered_timestamp IS NULL OR (s.visit_date + COALESCE(NEW.capture_time, '00:00:00'::time)) > b.last_encountered_timestamp);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER "trigger_set_encounter_generated_fields" BEFORE INSERT
OR
UPDATE OF "session_id",
"capture_time" ON "public"."Encounters" FOR EACH ROW
EXECUTE FUNCTION "public"."set_encounter_generated_fields" ();
