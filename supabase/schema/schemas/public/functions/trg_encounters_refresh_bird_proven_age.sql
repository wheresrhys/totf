-- Reads each encounter's own visit_date (#1015) instead of joining through
-- Sessions to reach it (#1024). Identical results — the two columns have always
-- agreed — with one less join and no dependency on an encounter having a Session
-- at all.
CREATE FUNCTION public.trg_encounters_refresh_bird_proven_age () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
	search_path TO 'public' AS $function$
DECLARE
  v_bird_id bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_bird_id := OLD.bird_id;
  ELSE
    v_bird_id := NEW.bird_id;
  END IF;

  UPDATE "public"."Birds" b
  SET proven_age = COALESCE(
    (SELECT
      EXTRACT(YEAR FROM MAX(e.visit_date))::integer - MIN(e.max_hatch_year)
    FROM "public"."Encounters" e
    WHERE e.bird_id = v_bird_id),
    0
  )
  WHERE b.id = v_bird_id;

  IF TG_OP = 'UPDATE'
  AND OLD.bird_id IS DISTINCT FROM NEW.bird_id THEN
    UPDATE "public"."Birds" b
    SET proven_age = COALESCE(
      (SELECT
        EXTRACT(YEAR FROM MAX(e.visit_date))::integer - MIN(e.max_hatch_year)
      FROM "public"."Encounters" e
      WHERE e.bird_id = OLD.bird_id),
      0
    )
    WHERE b.id = OLD.bird_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

GRANT ALL ON FUNCTION public.trg_encounters_refresh_bird_proven_age () TO anon;

GRANT ALL ON FUNCTION public.trg_encounters_refresh_bird_proven_age () TO authenticated;

GRANT ALL ON FUNCTION public.trg_encounters_refresh_bird_proven_age () TO service_role;
