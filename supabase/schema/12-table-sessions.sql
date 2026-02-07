CREATE TABLE IF NOT EXISTS "public"."Sessions" (
	"id" bigint NOT NULL,
	"visit_date" "date" NOT NULL
);

ALTER TABLE "public"."Sessions" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."Sessions_id_seq" START
WITH
	1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER SEQUENCE "public"."Sessions_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."Sessions_id_seq" OWNED BY "public"."Sessions"."id";

ALTER TABLE ONLY "public"."Sessions"
ALTER COLUMN "id"
SET DEFAULT "nextval" ('"public"."Sessions_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."Sessions"
ADD CONSTRAINT "Sessions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."Sessions"
ADD CONSTRAINT "Sessions_visit_date_key" UNIQUE ("visit_date");

GRANT ALL ON TABLE "public"."Sessions" TO "anon";

GRANT ALL ON TABLE "public"."Sessions" TO "authenticated";

GRANT ALL ON TABLE "public"."Sessions" TO "service_role";

GRANT ALL ON SEQUENCE "public"."Sessions_id_seq" TO "anon";

GRANT ALL ON SEQUENCE "public"."Sessions_id_seq" TO "authenticated";

GRANT ALL ON SEQUENCE "public"."Sessions_id_seq" TO "service_role";
