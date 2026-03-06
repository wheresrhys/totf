CREATE TABLE IF NOT EXISTS "public"."RingingGroups" (
	"group_name" "text" NOT NULL,
	"id" bigint NOT NULL
);

ALTER TABLE "public"."RingingGroups" OWNER TO "postgres";

COMMENT ON TABLE "public"."RingingGroups" IS 'Ringing groups';

CREATE SEQUENCE IF NOT EXISTS "public"."RingingGroups_id_seq" START
WITH
	1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER SEQUENCE "public"."RingingGroups_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."RingingGroups_id_seq" OWNED BY "public"."RingingGroups"."id";

ALTER TABLE ONLY "public"."RingingGroups"
ALTER COLUMN "id"
SET DEFAULT "nextval" ('"public"."RingingGroups_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."RingingGroups"
ADD CONSTRAINT "RingingGroups_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."RingingGroups"
ADD CONSTRAINT "RingingGroups_group_name_unique" UNIQUE ("group_name");

GRANT ALL ON TABLE "public"."RingingGroups" TO "anon";

GRANT ALL ON TABLE "public"."RingingGroups" TO "authenticated";

GRANT ALL ON TABLE "public"."RingingGroups" TO "service_role";

GRANT ALL ON SEQUENCE "public"."RingingGroups_id_seq" TO "anon";

GRANT ALL ON SEQUENCE "public"."RingingGroups_id_seq" TO "authenticated";

GRANT ALL ON SEQUENCE "public"."RingingGroups_id_seq" TO "service_role";
