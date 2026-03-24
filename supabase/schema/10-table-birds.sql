CREATE TABLE IF NOT EXISTS "public"."Birds" (
	"ring_no" "text" NOT NULL,
	"id" bigint NOT NULL,
	"species_id" bigint NOT NULL,
	"last_encountered_timestamp" timestamp without time zone NOT NULL DEFAULT '0001-01-01 00:00:00'::timestamp without time zone,
	"ringing_group_ids" BIGINT[] NOT NULL DEFAULT '{}',
	"proven_age" smallint NOT NULL DEFAULT 0
);

ALTER TABLE "public"."Birds" OWNER TO "postgres";

COMMENT ON TABLE "public"."Birds" IS '@graphql({"aggregate": {"enabled": true}})';

CREATE SEQUENCE IF NOT EXISTS "public"."Birds_id_seq" START
WITH
	1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER SEQUENCE "public"."Birds_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."Birds_id_seq" OWNED BY "public"."Birds"."id";

ALTER TABLE ONLY "public"."Birds"
ALTER COLUMN "id"
SET DEFAULT "nextval" ('"public"."Birds_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."Birds"
ADD CONSTRAINT "Birds_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."Birds"
ADD CONSTRAINT "birds_ring_no_unique" UNIQUE ("ring_no");

CREATE INDEX idx_birds_ringing_group_ids ON "public"."Birds" USING GIN (ringing_group_ids);

GRANT ALL ON TABLE "public"."Birds" TO "anon";

GRANT ALL ON TABLE "public"."Birds" TO "authenticated";

GRANT ALL ON TABLE "public"."Birds" TO "service_role";

GRANT ALL ON SEQUENCE "public"."Birds_id_seq" TO "anon";

GRANT ALL ON SEQUENCE "public"."Birds_id_seq" TO "authenticated";

GRANT ALL ON SEQUENCE "public"."Birds_id_seq" TO "service_role";
