SET check_function_bodies = false;
REVOKE SELECT, USAGE ON SEQUENCE public."GroupDataSharing_id_seq" FROM anon;
REVOKE SELECT, USAGE ON SEQUENCE public."GroupDataSharing_id_seq" FROM authenticated;
REVOKE SELECT, USAGE ON SEQUENCE public."GroupDataSharing_id_seq" FROM service_role;
CREATE FUNCTION public.trg_suppress_same_session_retrap()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.record_type = 'N' AND NEW.record_type != 'N' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;
GRANT ALL ON FUNCTION public.trg_suppress_same_session_retrap() TO anon;
GRANT ALL ON FUNCTION public.trg_suppress_same_session_retrap() TO authenticated;
GRANT ALL ON FUNCTION public.trg_suppress_same_session_retrap() TO service_role;
CREATE TRIGGER trigger_trg_suppress_same_session_retrap BEFORE UPDATE ON public."Encounters" FOR EACH ROW EXECUTE FUNCTION public.trg_suppress_same_session_retrap();
