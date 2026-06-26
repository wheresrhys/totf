ALTER TABLE "public"."Species" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "species_access" ON "public"."Species" FOR
SELECT
	USING (TRUE);

CREATE POLICY "species_insert" ON "public"."Species" FOR INSERT
WITH
	CHECK (TRUE);

CREATE POLICY "species_update" ON "public"."Species"
FOR UPDATE
	USING (TRUE)
WITH
	CHECK (TRUE);
