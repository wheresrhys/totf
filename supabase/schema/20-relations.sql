CREATE INDEX "idx_birds_species_id" ON "public"."Birds" USING "btree" ("species_id");

ALTER TABLE ONLY "public"."Birds"
ADD CONSTRAINT "birds_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "public"."Species" ("id");

CREATE INDEX "idx_encounters_bird_id" ON "public"."Encounters" USING "btree" ("bird_id");

ALTER TABLE ONLY "public"."Encounters"
ADD CONSTRAINT "encounters_bird_id_fkey" FOREIGN KEY ("bird_id") REFERENCES "public"."Birds" ("id");

CREATE INDEX "idx_encounters_session_id" ON "public"."Encounters" USING "btree" ("session_id");

ALTER TABLE ONLY "public"."Encounters"
ADD CONSTRAINT "encounters_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."Sessions" ("id");
