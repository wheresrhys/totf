CREATE FUNCTION public.trg_set_session_generated_fields () RETURNS TRIGGER LANGUAGE plpgsql AS $function$
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

GRANT ALL ON FUNCTION public.trg_set_session_generated_fields () TO anon;

GRANT ALL ON FUNCTION public.trg_set_session_generated_fields () TO authenticated;

GRANT ALL ON FUNCTION public.trg_set_session_generated_fields () TO service_role;
