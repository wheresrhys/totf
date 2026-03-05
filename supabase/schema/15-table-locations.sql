CREATE TABLE IF NOT EXISTS "public"."Locations" (
	"location_name" "text" NOT NULL,
	"ringing_group_id" bigint NOT NULL,
	"id" bigint NOT NULL
);

ALTER TABLE "public"."Locations" OWNER TO "postgres";

COMMENT ON TABLE "public"."Locations" IS 'Ringing locations';

CREATE SEQUENCE IF NOT EXISTS "public"."Locations_id_seq" START
WITH
	1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER SEQUENCE "public"."Locations_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."Locations_id_seq" OWNED BY "public"."Locations"."id";

ALTER TABLE ONLY "public"."Locations"
ALTER COLUMN "id"
SET DEFAULT "nextval" ('"public"."Locations_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."Locations"
ADD CONSTRAINT "Locations_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."Locations"
ADD CONSTRAINT "Locations_group_name_unique" UNIQUE ("group_name");

GRANT ALL ON TABLE "public"."Locations" TO "anon";

GRANT ALL ON TABLE "public"."Locations" TO "authenticated";

GRANT ALL ON TABLE "public"."Locations" TO "service_role";

GRANT ALL ON SEQUENCE "public"."Locations_id_seq" TO "anon";

GRANT ALL ON SEQUENCE "public"."Locations_id_seq" TO "authenticated";

GRANT ALL ON SEQUENCE "public"."Locations_id_seq" TO "service_role";
