ALTER TABLE "public"."Encounters" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."Locations" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."Sessions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."Birds" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_encounters_access" ON "Encounters" FOR
SELECT
	USING (
		ringing_group_id = (
			auth.jwt () -> 'app_metadata' ->> 'ringing_group_id'
		)::bigint
	);

CREATE POLICY "group_locations_access" ON "Locations" FOR
SELECT
	USING (
		ringing_group_id = (
			auth.jwt () -> 'app_metadata' ->> 'ringing_group_id'
		)::bigint
	);

-- Sessions do not yet have a location_id column; access is granted transitively
-- via Encounters so that a session is visible if it contains encounters owned by the group.
CREATE POLICY "group_sessions_access" ON "Sessions" FOR
SELECT
	USING (
		EXISTS (
			SELECT
				1
			FROM
				"Encounters"
			WHERE
				"Encounters".session_id = "Sessions".id
				AND "Encounters".ringing_group_id = (
					auth.jwt () -> 'app_metadata' ->> 'ringing_group_id'
				)::bigint
		)
	);

CREATE POLICY "group_birds_access" ON "Birds" FOR
SELECT
	USING (
		EXISTS (
			SELECT
				1
			FROM
				"Encounters"
			WHERE
				"Encounters".bird_id = "Birds".id
				AND "Encounters".ringing_group_id = (
					auth.jwt () -> 'app_metadata' ->> 'ringing_group_id'
				)::bigint
		)
	);
