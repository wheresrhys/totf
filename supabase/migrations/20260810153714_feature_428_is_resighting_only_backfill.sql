-- Data-only migration for #428/#436 — hand-authored (declarative schema sync only
-- captures DDL, not data backfills), reconstructed from the DML mirrored in
-- supabase/__tests__/is-resighting-only.test.ts ("is_resighting_only backfill migration"
-- describe block) after the original hand-appended copy was lost when the branch's
-- worktree was torn down. The is_resighting_only column + widened unique constraint
-- from 20260810125124_feature_428_is_resighting_only_column.sql are assumed already
-- applied (locally and in prod) before this runs.
--
-- Bucketing rule: record_type U/F/D = resighting-only, anything else = standard
-- ringing encounter (matches the backfill test's fixtures, not the broader
-- !['N','S'].includes(record_type) rule used at import time for new rows).
--
-- Split any pre-existing Sessions row whose Encounters mix N/S with U/F/D into two
-- rows: the original keeps its standard encounters, a new is_resighting_only=TRUE
-- twin is created for the same visit_date/location_id and the U/F/D encounters are
-- repointed onto it (trg_set_session_generated_fields derives its ringing_group_id).
WITH mixed_sessions AS (
	SELECT s.id AS old_session_id, s.visit_date, s.location_id
	FROM "Sessions" s
	WHERE EXISTS (SELECT 1 FROM "Encounters" e WHERE e.session_id = s.id AND e.record_type NOT IN ('U','F','D'))
		AND EXISTS (SELECT 1 FROM "Encounters" e WHERE e.session_id = s.id AND e.record_type IN ('U','F','D'))
), inserted_twins AS (
	INSERT INTO "Sessions" (visit_date, location_id, is_resighting_only)
	SELECT visit_date, location_id, TRUE FROM mixed_sessions
	RETURNING id AS new_session_id, visit_date, location_id
)
UPDATE "Encounters" e
SET session_id = t.new_session_id
FROM mixed_sessions m
JOIN inserted_twins t ON t.visit_date = m.visit_date AND t.location_id = m.location_id
WHERE e.session_id = m.old_session_id AND e.record_type IN ('U','F','D');
-- Flip any remaining Sessions row that is purely resighting (has encounters, all of
-- them U/F/D) in place — no split needed since there's nothing to separate it from.
-- Zero-encounter and all-N/S rows are left at FALSE (neither EXISTS clause matches).
UPDATE "Sessions" s SET is_resighting_only = TRUE
WHERE s.is_resighting_only = FALSE
	AND EXISTS (SELECT 1 FROM "Encounters" e WHERE e.session_id = s.id)
	AND NOT EXISTS (SELECT 1 FROM "Encounters" e WHERE e.session_id = s.id AND e.record_type NOT IN ('U','F','D'));
