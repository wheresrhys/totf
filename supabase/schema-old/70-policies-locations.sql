ALTER TABLE "public"."Locations" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_locations_access" ON "public"."Locations" FOR
SELECT
	USING (
		ringing_group_id = (
			auth.jwt () -> 'app_metadata' ->> 'ringing_group_id'
		)::bigint
	);

-- INSERT: allow inserting when ringing_group_id matches JWT
CREATE POLICY "group_locations_insert" ON "public"."Locations" FOR INSERT
WITH
	CHECK (
		ringing_group_id = (
			auth.jwt () -> 'app_metadata' ->> 'ringing_group_id'
		)::bigint
	);

-- UPDATE: allow updating rows that belong to the group (needed for upsert)
CREATE POLICY "group_locations_update" ON "public"."Locations"
FOR UPDATE
	USING (
		ringing_group_id = (
			auth.jwt () -> 'app_metadata' ->> 'ringing_group_id'
		)::bigint
	)
WITH
	CHECK (
		ringing_group_id = (
			auth.jwt () -> 'app_metadata' ->> 'ringing_group_id'
		)::bigint
	);
