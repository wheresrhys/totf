-- 1. Drop the old (visit_date, location_id, is_resighting_only) unique constraint.
ALTER TABLE public."Sessions" DROP CONSTRAINT "Sessions_visit_date_location_id_key";
-- 2. Add session_type as nullable (no default yet) so the backfill sets meaningful
--    values before NOT NULL is enforced.
ALTER TABLE public."Sessions" ADD COLUMN session_type text;
-- 3a. Every existing resighting-only row is a FIELD_OBSERVATION (already isolated
--     by #428 — no split needed).
UPDATE public."Sessions" SET session_type = 'FIELD_OBSERVATION' WHERE is_resighting_only = TRUE;
-- 3b. Split each remaining (non-resighting, still-NULL) row that mixes pulli and
--     non-pulli encounters: create a PULLI twin for the same visit_date/location_id
--     and repoint the pulli encounters onto it. PULLI encounter = age_code = 1 AND NOT is_juv.
WITH mixed_sessions AS (
	SELECT s.id AS old_session_id, s.visit_date, s.location_id
	FROM public."Sessions" s
	WHERE s.session_type IS NULL
		AND EXISTS (SELECT 1 FROM public."Encounters" e WHERE e.session_id = s.id AND e.age_code = 1 AND NOT e.is_juv)
		AND EXISTS (SELECT 1 FROM public."Encounters" e WHERE e.session_id = s.id AND NOT (e.age_code = 1 AND NOT e.is_juv))
), inserted_twins AS (
	INSERT INTO public."Sessions" (visit_date, location_id, session_type, is_resighting_only)
	SELECT visit_date, location_id, 'PULLI', FALSE FROM mixed_sessions
	RETURNING id AS new_session_id, visit_date, location_id
)
UPDATE public."Encounters" e
SET session_id = t.new_session_id
FROM mixed_sessions m
JOIN inserted_twins t ON t.visit_date = m.visit_date AND t.location_id = m.location_id
WHERE e.session_id = m.old_session_id AND e.age_code = 1 AND NOT e.is_juv;
-- 3c. Flip a remaining pure-pulli row (has encounters, all pulli) in place.
UPDATE public."Sessions" s SET session_type = 'PULLI'
WHERE s.session_type IS NULL
	AND EXISTS (SELECT 1 FROM public."Encounters" e WHERE e.session_id = s.id)
	AND NOT EXISTS (SELECT 1 FROM public."Encounters" e WHERE e.session_id = s.id AND NOT (e.age_code = 1 AND NOT e.is_juv));
-- 3d. Everything still NULL is FULL_GROWN: pure full-grown rows, zero-encounter
--     rows (conservative default), and the kept halves of the split rows above.
UPDATE public."Sessions" SET session_type = 'FULL_GROWN' WHERE session_type IS NULL;
-- 4. Now that every row has a value, enforce DEFAULT + NOT NULL + CHECK.
ALTER TABLE public."Sessions" ALTER COLUMN session_type SET DEFAULT 'FULL_GROWN';
ALTER TABLE public."Sessions" ALTER COLUMN session_type SET NOT NULL;
ALTER TABLE public."Sessions" ADD CONSTRAINT "Sessions_session_type_check" CHECK (session_type IN ('FULL_GROWN', 'FIELD_OBSERVATION', 'PULLI'));
-- 5. Re-add the unique constraint, widened to session_type.
ALTER TABLE public."Sessions" ADD CONSTRAINT "Sessions_visit_date_location_id_key" UNIQUE (visit_date, location_id, session_type);
