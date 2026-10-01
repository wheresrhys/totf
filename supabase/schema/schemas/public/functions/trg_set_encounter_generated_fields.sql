-- Reads the encounter's OWN location_id/visit_date (#1015) rather than reaching
-- them through its Session (#1024). Mandatory, not cosmetic: this used to get to
-- Locations via Sessions.location_id, and that column no longer exists, so
-- without this every Encounters insert would fail. Same derivation, same inputs
-- — Encounters.visit_date has always equalled its Session's visit_date, and
-- Encounters.location_id its Session's location_id — just read one hop earlier.
CREATE FUNCTION public.trg_set_encounter_generated_fields () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $function$
BEGIN
  SELECT
    l."ringing_group_id",
    CASE
				WHEN NEW.age_code % 2 = 0 THEN EXTRACT(
					YEAR
					FROM
						NEW.visit_date
				)::INTEGER - (NEW.age_code / 2 - 1)
				WHEN NEW.age_code % 2 = 1
				AND NEW.age_code > 1 THEN EXTRACT(
					YEAR
					FROM
						NEW.visit_date
				)::INTEGER - ((NEW.age_code - 3) / 2)
				ELSE EXTRACT(
					YEAR
					FROM
						NEW.visit_date
				)::INTEGER
			END AS max_hatch_year,
			CASE
				WHEN NEW.age_code % 2 = 0 THEN 0
				WHEN NEW.age_code % 2 = 1
				AND NEW.age_code > 1 THEN EXTRACT(
					YEAR
					FROM
						NEW.visit_date
				)::INTEGER - ((NEW.age_code - 3) / 2)
				ELSE EXTRACT(
					YEAR
					FROM
						NEW.visit_date
				)::INTEGER
			END AS min_hatch_year
  INTO NEW."ringing_group_id", NEW."max_hatch_year", NEW."min_hatch_year"
  FROM "public"."Locations" l
  WHERE l."id" = NEW."location_id";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Location % not found', NEW."location_id";
  END IF;

  -- Update Birds.last_encountered_timestamp when encounter timestamp is newer
  UPDATE "public"."Birds" b
  SET last_encountered_timestamp = (NEW.visit_date + COALESCE(NEW.capture_time, '00:00:00'::time))
  WHERE b.id = NEW.bird_id
    AND (b.last_encountered_timestamp IS NULL OR (NEW.visit_date + COALESCE(NEW.capture_time, '00:00:00'::time)) > b.last_encountered_timestamp);

  RETURN NEW;
END;
$function$;

GRANT ALL ON FUNCTION public.trg_set_encounter_generated_fields () TO anon;

GRANT ALL ON FUNCTION public.trg_set_encounter_generated_fields () TO authenticated;

GRANT ALL ON FUNCTION public.trg_set_encounter_generated_fields () TO service_role;
