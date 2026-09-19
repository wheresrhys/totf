-- Canonical resighting/recovery `record_type` codes (DemOn field spec: passive
-- encounters with no bird in the hand). Not the column type of
-- Encounters.record_type (which stays text, holding the full DemOn code set) — this
-- enum is a single-source lookup set for the stats RPC exclusion filter
-- (stats_raw_encounters) and the generated-types anchor for lib/demon-import.ts's
-- RESIGHTING_RECORD_TYPES / app/models/db.ts's ResightingRecordType. Mirrors the
-- ring_size.sql enum-file convention. Keep the values in sync with
-- RESIGHTING_RECORD_TYPES by hand (the demon-import exhaustiveness test guards it).
CREATE TYPE public.resighting_record_type AS ENUM('U', 'F', 'D');
