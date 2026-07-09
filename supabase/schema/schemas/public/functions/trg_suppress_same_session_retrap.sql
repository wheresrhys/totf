CREATE FUNCTION public.trg_suppress_same_session_retrap () RETURNS TRIGGER LANGUAGE plpgsql AS $function$
BEGIN
  IF OLD.record_type = 'N' AND NEW.record_type != 'N' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

GRANT ALL ON FUNCTION public.trg_suppress_same_session_retrap () TO anon;

GRANT ALL ON FUNCTION public.trg_suppress_same_session_retrap () TO authenticated;

GRANT ALL ON FUNCTION public.trg_suppress_same_session_retrap () TO service_role;
