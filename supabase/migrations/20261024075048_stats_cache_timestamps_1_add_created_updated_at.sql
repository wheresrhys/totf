SET check_function_bodies = false;
CREATE FUNCTION public.trg_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
GRANT ALL ON FUNCTION public.trg_set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.trg_set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.trg_set_updated_at() TO service_role;
ALTER TABLE public."ComplexStatsCache" ADD COLUMN created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."ComplexStatsCache" ADD COLUMN updated_at timestamp with time zone DEFAULT now() NOT NULL;
CREATE TRIGGER trigger_trg_set_updated_at BEFORE INSERT OR UPDATE ON public."ComplexStatsCache" FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at();
ALTER TABLE public."ComplexStatsCacheBySpecies" ADD COLUMN created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."ComplexStatsCacheBySpecies" ADD COLUMN updated_at timestamp with time zone DEFAULT now() NOT NULL;
CREATE TRIGGER trigger_trg_set_updated_at BEFORE INSERT OR UPDATE ON public."ComplexStatsCacheBySpecies" FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at();
ALTER TABLE public."SimpleStatsCache" ADD COLUMN created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."SimpleStatsCache" ADD COLUMN updated_at timestamp with time zone DEFAULT now() NOT NULL;
CREATE TRIGGER trigger_trg_set_updated_at BEFORE INSERT OR UPDATE ON public."SimpleStatsCache" FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at();
ALTER TABLE public."SimpleStatsCacheBySpecies" ADD COLUMN created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."SimpleStatsCacheBySpecies" ADD COLUMN updated_at timestamp with time zone DEFAULT now() NOT NULL;
CREATE TRIGGER trigger_trg_set_updated_at BEFORE INSERT OR UPDATE ON public."SimpleStatsCacheBySpecies" FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at();
