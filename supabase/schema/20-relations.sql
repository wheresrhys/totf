CREATE INDEX "idx_birds_species_id" ON "public"."Birds" USING "btree" ("species_id");

ALTER TABLE ONLY "public"."Birds"
ADD CONSTRAINT "birds_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "public"."Species" ("id");

CREATE INDEX "idx_encounters_bird_id" ON "public"."Encounters" USING "btree" ("bird_id");

ALTER TABLE ONLY "public"."Encounters"
ADD CONSTRAINT "encounters_bird_id_fkey" FOREIGN KEY ("bird_id") REFERENCES "public"."Birds" ("id");


CREATE INDEX "idx_encounters_session_legacy_id" ON "public"."Encounters" USING "btree" ("session_legacy_id");

ALTER TABLE ONLY "public"."Encounters"
ADD CONSTRAINT "encounters_session_legacy_id_fkey" FOREIGN KEY ("session_legacy_id") REFERENCES "public"."SessionsLegacy" ("id");

CREATE INDEX "idx_locations_ringing_group_id" ON "public"."Locations" USING "btree" ("ringing_group_id");

ALTER TABLE ONLY "public"."Locations"
ADD CONSTRAINT "locations_ringing_group_id_fkey" FOREIGN KEY ("ringing_group_id") REFERENCES "public"."RingingGroups" ("id");

CREATE INDEX "idx_encounters_location_id" ON "public"."Encounters" USING "btree" ("location_id");

ALTER TABLE ONLY "public"."Encounters"
ADD CONSTRAINT "encounters_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."Locations" ("id");

CREATE INDEX "idx_encounters_ringing_group_id" ON "public"."Encounters" USING "btree" ("ringing_group_id");

ALTER TABLE ONLY "public"."Encounters"
ADD CONSTRAINT "encounters_ringing_group_id_fkey" FOREIGN KEY ("ringing_group_id") REFERENCES "public"."RingingGroups" ("id");
