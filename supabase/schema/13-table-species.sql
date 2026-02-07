CREATE TABLE IF NOT EXISTS "public"."Species" (
	"species_name" "text" NOT NULL,
	"id" bigint NOT NULL
);

ALTER TABLE "public"."Species" OWNER TO "postgres";

COMMENT ON TABLE "public"."Species" IS 'Bird Species';

CREATE SEQUENCE IF NOT EXISTS "public"."Species_id_seq" START
WITH
	1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER SEQUENCE "public"."Species_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."Species_id_seq" OWNED BY "public"."Species"."id";

ALTER TABLE ONLY "public"."Species"
ALTER COLUMN "id"
SET DEFAULT "nextval" ('"public"."Species_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."Species"
ADD CONSTRAINT "Species_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."Species"
ADD CONSTRAINT "species_species_name_unique" UNIQUE ("species_name");

GRANT ALL ON TABLE "public"."Species" TO "anon";

GRANT ALL ON TABLE "public"."Species" TO "authenticated";

GRANT ALL ON TABLE "public"."Species" TO "service_role";

GRANT ALL ON SEQUENCE "public"."Species_id_seq" TO "anon";

GRANT ALL ON SEQUENCE "public"."Species_id_seq" TO "authenticated";

GRANT ALL ON SEQUENCE "public"."Species_id_seq" TO "service_role";
