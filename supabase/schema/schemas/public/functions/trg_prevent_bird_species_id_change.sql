CREATE FUNCTION public.trg_prevent_bird_species_id_change () RETURNS TRIGGER LANGUAGE plpgsql AS $function$
BEGIN
  -- A physical ring number is assigned to one bird of one species for life, so
  -- species_id must never change once set. If a re-imported CSV row reuses an
  -- existing ring_no with a different species it signals a data-quality problem
  -- in the source data — raise rather than silently overwrite species_id, so the
  -- import surfaces the bad row (counted as a failed record) instead of masking it.
  IF NEW.species_id IS DISTINCT FROM OLD.species_id THEN
    RAISE EXCEPTION 'species_id is immutable once set (ring_no=%): cannot change from % to %',
      OLD.ring_no, OLD.species_id, NEW.species_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

GRANT ALL ON FUNCTION public.trg_prevent_bird_species_id_change () TO anon;

GRANT ALL ON FUNCTION public.trg_prevent_bird_species_id_change () TO authenticated;

GRANT ALL ON FUNCTION public.trg_prevent_bird_species_id_change () TO service_role;
