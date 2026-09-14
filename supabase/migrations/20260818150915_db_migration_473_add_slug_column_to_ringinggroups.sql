ALTER TABLE public."RingingGroups" ADD COLUMN slug text;
ALTER TABLE public."RingingGroups" ADD CONSTRAINT "RingingGroups_slug_unique" UNIQUE (slug);
