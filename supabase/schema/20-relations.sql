-- Many Birds per Species
CREATE INDEX "idx_birds_species_id" ON "public"."Birds" USING "btree" ("species_id");

ALTER TABLE ONLY "public"."Birds"
ADD CONSTRAINT "birds_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "public"."Species" ("id");

-- Many Encounters per Bird
CREATE INDEX "idx_encounters_bird_id" ON "public"."Encounters" USING "btree" ("bird_id");

ALTER TABLE ONLY "public"."Encounters"
ADD CONSTRAINT "encounters_bird_id_fkey" FOREIGN KEY ("bird_id") REFERENCES "public"."Birds" ("id");

-- Many Encounters per Session
CREATE INDEX "idx_encounters_session_id" ON "public"."Encounters" USING "btree" ("session_id");

ALTER TABLE ONLY "public"."Encounters"
ADD CONSTRAINT "encounters_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."Sessions" ("id");

-- Many Locations per RingingGroup
CREATE INDEX "idx_locations_ringing_group_id" ON "public"."Locations" USING "btree" ("ringing_group_id");

ALTER TABLE ONLY "public"."Locations"
ADD CONSTRAINT "locations_ringing_group_id_fkey" FOREIGN KEY ("ringing_group_id") REFERENCES "public"."RingingGroups" ("id");

-- Many Sessions per Location
CREATE INDEX "idx_sessions_location_id" ON "public"."Sessions" USING "btree" ("location_id");

ALTER TABLE ONLY "public"."Sessions"
ADD CONSTRAINT "sessions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."Locations" ("id");

-- Many Encounters per RingingGroup
CREATE INDEX "idx_encounters_ringing_group_id" ON "public"."Encounters" USING "btree" ("ringing_group_id");

ALTER TABLE ONLY "public"."Encounters"
ADD CONSTRAINT "encounters_ringing_group_id_fkey" FOREIGN KEY ("ringing_group_id") REFERENCES "public"."RingingGroups" ("id");
