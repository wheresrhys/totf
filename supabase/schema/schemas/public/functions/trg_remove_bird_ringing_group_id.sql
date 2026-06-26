CREATE FUNCTION public.trg_remove_bird_ringing_group_id () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $function$
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

GRANT ALL ON FUNCTION public.trg_remove_bird_ringing_group_id () TO anon;

GRANT ALL ON FUNCTION public.trg_remove_bird_ringing_group_id () TO authenticated;

GRANT ALL ON FUNCTION public.trg_remove_bird_ringing_group_id () TO service_role;
