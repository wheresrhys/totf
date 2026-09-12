ALTER TABLE public."Sessions" DROP CONSTRAINT "Sessions_visit_date_location_id_key";
ALTER TABLE public."Sessions" ADD COLUMN is_resighting_only boolean DEFAULT false NOT NULL;
ALTER TABLE public."Sessions" ADD CONSTRAINT "Sessions_visit_date_location_id_key" UNIQUE (visit_date, location_id, is_resighting_only);
