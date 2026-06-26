CREATE FUNCTION public.trg_add_bird_ringing_group_id()
  RETURNS TRIGGER
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
