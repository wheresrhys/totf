-- Generated DDL (npm run db:schema:apply), with the two `NOT NULL` constraints
-- deferred to the end of the file: `ADD COLUMN ... NOT NULL` cannot run against a
-- non-empty `Encounters` table, so this is the standard add-nullable → backfill →
-- SET NOT NULL sequence. Everything else is verbatim from the generated diff.
ALTER TABLE public."Encounters" ADD COLUMN location_id bigint;
ALTER TABLE public."Encounters" ADD CONSTRAINT encounters_location_id_fkey FOREIGN KEY (location_id) REFERENCES public."Locations"(id);
ALTER TABLE public."Encounters" ADD COLUMN visit_date date;
CREATE INDEX idx_encounters_location_id ON public."Encounters" (location_id);
CREATE INDEX idx_encounters_ringing_group_id_visit_date ON public."Encounters" (ringing_group_id, visit_date);

-- >>> BACKFILL DML (hand-written — declarative sync only ever emits DDL) <<<
-- #1015: every existing Encounters row takes its location/date from the Session it
-- is already linked to. `Encounters.session_id` is still NOT NULL at this point, so
-- every row has exactly one source Session and the backfill is total — no row can be
-- left NULL, which is what makes the SET NOT NULL below safe. Purely additive: no
-- Sessions row is created, changed or removed, and no Encounters.session_id changes.
UPDATE public."Encounters" AS enc
SET
	location_id = sess.location_id,
	visit_date = sess.visit_date
FROM public."Sessions" AS sess
WHERE sess.id = enc.session_id;
-- >>> END BACKFILL DML <<<

ALTER TABLE public."Encounters" ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE public."Encounters" ALTER COLUMN visit_date SET NOT NULL;
