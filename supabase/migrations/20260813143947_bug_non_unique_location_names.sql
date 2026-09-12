ALTER TABLE public."Locations" DROP CONSTRAINT "Locations_location_name_unique";
ALTER TABLE public."Locations" ADD CONSTRAINT "Locations_location_name_group_id_unique" UNIQUE (location_name, ringing_group_id);
