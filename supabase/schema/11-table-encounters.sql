CREATE TABLE IF NOT EXISTS "public"."Encounters" (
	"capture_time" time without time zone NOT NULL,
	"record_type" "text" NOT NULL,
	"scheme" "text" NOT NULL,
	"sex" "text" NOT NULL,
	"sexing_method" "text",
	"breeding_condition" "text",
	"wing_length" smallint,
	"weight" real,
	"moult_code" "text",
	"old_greater_coverts" smallint,
	"extra_text" "text",
	"is_juv" boolean DEFAULT FALSE NOT NULL,
	"id" bigint NOT NULL,
	"bird_id" bigint NOT NULL,
	"session_id" bigint NOT NULL,
	"age_code" smallint NOT NULL,
	"minimum_years" smallint NOT NULL
);

ALTER TABLE "public"."Encounters" OWNER TO "postgres";

COMMENT ON TABLE "public"."Encounters" IS 'Encounters with individual birds';

CREATE SEQUENCE IF NOT EXISTS "public"."Encounters_id_seq" START
WITH
	1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER SEQUENCE "public"."Encounters_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."Encounters_id_seq" OWNED BY "public"."Encounters"."id";

ALTER TABLE ONLY "public"."Encounters"
ALTER COLUMN "id"
SET DEFAULT "nextval" ('"public"."Encounters_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."Encounters"
ADD CONSTRAINT "Encounters_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."Encounters"
ADD CONSTRAINT "encounters_bird_id_session_id_unique" UNIQUE ("bird_id", "session_id");

GRANT ALL ON TABLE "public"."Encounters" TO "anon";

GRANT ALL ON TABLE "public"."Encounters" TO "authenticated";

GRANT ALL ON TABLE "public"."Encounters" TO "service_role";

GRANT ALL ON SEQUENCE "public"."Encounters_id_seq" TO "anon";

GRANT ALL ON SEQUENCE "public"."Encounters_id_seq" TO "authenticated";

GRANT ALL ON SEQUENCE "public"."Encounters_id_seq" TO "service_role";
