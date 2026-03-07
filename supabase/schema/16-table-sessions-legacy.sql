CREATE TABLE IF NOT EXISTS "public"."SessionsLegacy" (
	"id" bigint NOT NULL,
	"visit_date" "date" NOT NULL
);

ALTER TABLE "public"."SessionsLegacy" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."SessionsLegacy_id_seq" START
WITH
	1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER SEQUENCE "public"."SessionsLegacy_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."SessionsLegacy_id_seq" OWNED BY "public"."SessionsLegacy"."id";

ALTER TABLE ONLY "public"."SessionsLegacy"
ALTER COLUMN "id"
SET DEFAULT "nextval" ('"public"."SessionsLegacy_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."SessionsLegacy"
ADD CONSTRAINT "SessionsLegacy_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."SessionsLegacy"
ADD CONSTRAINT "SessionsLegacy_visit_date_key" UNIQUE ("visit_date");

GRANT ALL ON TABLE "public"."SessionsLegacy" TO "anon";

GRANT ALL ON TABLE "public"."SessionsLegacy" TO "authenticated";

GRANT ALL ON TABLE "public"."SessionsLegacy" TO "service_role";

GRANT ALL ON SEQUENCE "public"."SessionsLegacy_id_seq" TO "anon";

GRANT ALL ON SEQUENCE "public"."SessionsLegacy_id_seq" TO "authenticated";

GRANT ALL ON SEQUENCE "public"."SessionsLegacy_id_seq" TO "service_role";
