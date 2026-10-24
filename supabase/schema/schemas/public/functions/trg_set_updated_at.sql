CREATE FUNCTION public.trg_set_updated_at () RETURNS TRIGGER LANGUAGE plpgsql AS $function$
BEGIN
  -- created_at is set once at INSERT (DEFAULT NOW()) and never touched again;
  -- guard it explicitly rather than relying on callers never including it in
  -- an UPDATE payload.
  IF TG_OP = 'UPDATE' THEN
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$function$;

GRANT ALL ON FUNCTION public.trg_set_updated_at () TO anon;

GRANT ALL ON FUNCTION public.trg_set_updated_at () TO authenticated;

GRANT ALL ON FUNCTION public.trg_set_updated_at () TO service_role;
