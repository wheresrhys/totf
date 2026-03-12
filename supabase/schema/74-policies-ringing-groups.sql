ALTER TABLE "public"."RingingGroups" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ringing_groups_access" ON "public"."RingingGroups" FOR
SELECT
	USING (TRUE);

CREATE POLICY "ringing_groups_insert" ON "public"."RingingGroups" FOR INSERT
WITH
	CHECK (TRUE);

CREATE POLICY "ringing_groups_update" ON "public"."RingingGroups"
FOR UPDATE
	USING (
		id = (
			auth.jwt () -> 'app_metadata' ->> 'ringing_group_id'
		)::bigint
	)
WITH
	CHECK (
		id = (
			auth.jwt () -> 'app_metadata' ->> 'ringing_group_id'
		)::bigint
	);
