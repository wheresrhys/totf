ALTER TABLE "public"."Sessions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_sessions_access" ON "public"."Sessions" FOR
SELECT
	USING (
		ringing_group_id = (
			auth.jwt () -> 'app_metadata' ->> 'ringing_group_id'
		)::bigint
	);

-- INSERT: allow inserting when ringing_group_id matches JWT
CREATE POLICY "group_sessions_insert" ON "public"."Sessions" FOR INSERT
WITH
	CHECK (
		ringing_group_id = (
			auth.jwt () -> 'app_metadata' ->> 'ringing_group_id'
		)::bigint
	);

-- UPDATE: allow updating rows that belong to the group (needed for upsert)
CREATE POLICY "group_sessions_update" ON "public"."Sessions"
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
