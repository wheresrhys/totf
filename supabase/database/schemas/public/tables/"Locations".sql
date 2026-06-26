CREATE TABLE public."Locations" (
  location_name    text   NOT NULL,
  ringing_group_id bigint NOT NULL,
  id               bigint DEFAULT nextval('public."Locations_id_seq"'::regclass) NOT NULL
);

CREATE INDEX idx_locations_ringing_group_id ON public."Locations" (ringing_group_id);

CREATE POLICY group_locations_access ON public."Locations"
  FOR SELECT
  USING ((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint));

CREATE POLICY group_locations_insert ON public."Locations"
  FOR INSERT
  WITH CHECK ((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint));

CREATE POLICY group_locations_update ON public."Locations"
  FOR UPDATE
  USING ((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint))
  WITH CHECK ((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint));

COMMENT ON TABLE public."Locations" IS 'Ringing locations';

ALTER SEQUENCE public."Locations_id_seq" OWNED BY public."Locations".id;

ALTER TABLE public."Locations"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."Locations"
  ADD CONSTRAINT "Locations_location_name_unique" UNIQUE (location_name);

ALTER TABLE public."Locations"
  ADD CONSTRAINT "Locations_pkey" PRIMARY KEY (id);

ALTER TABLE public."Locations"
  ADD CONSTRAINT locations_ringing_group_id_fkey FOREIGN KEY (ringing_group_id) REFERENCES public."RingingGroups"(id);

GRANT ALL ON public."Locations" TO anon;

GRANT ALL ON public."Locations" TO authenticated;

GRANT ALL ON public."Locations" TO service_role;