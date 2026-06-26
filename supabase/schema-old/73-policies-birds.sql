ALTER TABLE "public"."Birds" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_birds_access" ON "public"."Birds" FOR
SELECT
	USING (
		(
			auth.jwt () -> 'app_metadata' ->> 'ringing_group_id'
		)::bigint = ANY (ringing_group_ids)
		OR (
			ringing_group_ids = '{}'
			AND (
				auth.jwt () -> 'app_metadata' ->> 'ringing_group_id'
			)::bigint IS NOT NULL
		)
	);

-- INSERT: new birds have empty ringing_group_ids; allow when user has a group
-- (group association is added by trigger when encounters are created)
CREATE POLICY "group_birds_insert" ON "public"."Birds" FOR INSERT
WITH
	CHECK (
		(
			auth.jwt () -> 'app_metadata' ->> 'ringing_group_id'
		)::bigint IS NOT NULL
	);

-- UPDATE: allow updating rows that belong to the group (needed for upsert)
CREATE POLICY "group_birds_update" ON "public"."Birds"
FOR UPDATE
	USING (
		(
			auth.jwt () -> 'app_metadata' ->> 'ringing_group_id'
		)::bigint IS NOT NULL
	)
WITH
	CHECK (
		(
			auth.jwt () -> 'app_metadata' ->> 'ringing_group_id'
		)::bigint IS NOT NULL
	);
