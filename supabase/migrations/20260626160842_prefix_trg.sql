SET check_function_bodies = false;
DROP TRIGGER trigger_add_bird_ringing_group_id ON public."Encounters";
DROP FUNCTION public.add_bird_ringing_group_id();
DROP TRIGGER trigger_remove_bird_ringing_group_id ON public."Encounters";
DROP FUNCTION public.remove_bird_ringing_group_id();
DROP TRIGGER trigger_set_encounter_generated_fields ON public."Encounters";
DROP FUNCTION public.set_encounter_generated_fields();
DROP TRIGGER trigger_update_bird_ringing_group_id ON public."Encounters";
DROP FUNCTION public.update_bird_ringing_group_id();
DROP TRIGGER trigger_set_session_generated_fields ON public."Sessions";
DROP FUNCTION public.set_session_generated_fields();
CREATE FUNCTION public.trg_add_bird_ringing_group_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;
GRANT ALL ON FUNCTION public.trg_add_bird_ringing_group_id() TO anon;
GRANT ALL ON FUNCTION public.trg_add_bird_ringing_group_id() TO authenticated;
GRANT ALL ON FUNCTION public.trg_add_bird_ringing_group_id() TO service_role;
CREATE FUNCTION public.trg_remove_bird_ringing_group_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;
GRANT ALL ON FUNCTION public.trg_remove_bird_ringing_group_id() TO anon;
GRANT ALL ON FUNCTION public.trg_remove_bird_ringing_group_id() TO authenticated;
GRANT ALL ON FUNCTION public.trg_remove_bird_ringing_group_id() TO service_role;
CREATE FUNCTION public.trg_set_encounter_generated_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;
GRANT ALL ON FUNCTION public.trg_set_encounter_generated_fields() TO anon;
GRANT ALL ON FUNCTION public.trg_set_encounter_generated_fields() TO authenticated;
GRANT ALL ON FUNCTION public.trg_set_encounter_generated_fields() TO service_role;
CREATE FUNCTION public.trg_set_session_generated_fields()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;
GRANT ALL ON FUNCTION public.trg_set_session_generated_fields() TO anon;
GRANT ALL ON FUNCTION public.trg_set_session_generated_fields() TO authenticated;
GRANT ALL ON FUNCTION public.trg_set_session_generated_fields() TO service_role;
CREATE FUNCTION public.trg_update_bird_ringing_group_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;
GRANT ALL ON FUNCTION public.trg_update_bird_ringing_group_id() TO anon;
GRANT ALL ON FUNCTION public.trg_update_bird_ringing_group_id() TO authenticated;
GRANT ALL ON FUNCTION public.trg_update_bird_ringing_group_id() TO service_role;
CREATE TRIGGER trigger_trg_add_bird_ringing_group_id AFTER INSERT ON public."Encounters" FOR EACH ROW EXECUTE FUNCTION public.trg_add_bird_ringing_group_id();
CREATE TRIGGER trigger_trg_remove_bird_ringing_group_id BEFORE DELETE ON public."Encounters" FOR EACH ROW EXECUTE FUNCTION public.trg_remove_bird_ringing_group_id();
CREATE TRIGGER trigger_trg_set_encounter_generated_fields BEFORE INSERT OR UPDATE OF session_id, capture_time ON public."Encounters" FOR EACH ROW EXECUTE FUNCTION public.trg_set_encounter_generated_fields();
CREATE TRIGGER trigger_trg_update_bird_ringing_group_id AFTER UPDATE OF ringing_group_id ON public."Encounters" FOR EACH ROW EXECUTE FUNCTION public.trg_update_bird_ringing_group_id();
CREATE TRIGGER trigger_trg_set_session_generated_fields BEFORE INSERT OR UPDATE OF location_id ON public."Sessions" FOR EACH ROW EXECUTE FUNCTION public.trg_set_session_generated_fields();
