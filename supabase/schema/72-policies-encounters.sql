ALTER TABLE "public"."Encounters" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_encounters_access" ON "public"."Encounters" FOR
SELECT
	USING (
		ringing_group_id = (
			auth.jwt () -> 'app_metadata' ->> 'ringing_group_id'
		)::bigint
	);

-- INSERT: allow inserting when ringing_group_id matches JWT
CREATE POLICY "group_encounters_insert" ON "public"."Encounters" FOR INSERT
WITH
	CHECK (
		ringing_group_id = (
			auth.jwt () -> 'app_metadata' ->> 'ringing_group_id'
		)::bigint
	);

-- UPDATE: allow updating rows that belong to the group (needed for upsert)
CREATE POLICY "group_encounters_update" ON "public"."Encounters"
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
