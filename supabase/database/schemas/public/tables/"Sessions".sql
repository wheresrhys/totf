CREATE TABLE public."Sessions" (
  id               bigint DEFAULT nextval('public."Sessions_id_seq"'::regclass) NOT NULL,
  visit_date       date   NOT NULL,
  location_id      bigint NOT NULL,
  ringing_group_id bigint NOT NULL
);

CREATE INDEX idx_sessions_ringing_group_id ON public."Sessions" (ringing_group_id);

CREATE INDEX idx_sessions_location_id ON public."Sessions" (location_id);

CREATE TRIGGER trigger_set_session_generated_fields
  BEFORE INSERT OR UPDATE OF location_id ON public."Sessions"
  FOR EACH ROW
  EXECUTE FUNCTION public.set_session_generated_fields();

CREATE POLICY group_sessions_access ON public."Sessions"
  FOR SELECT
  USING ((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint));

CREATE POLICY group_sessions_insert ON public."Sessions"
  FOR INSERT
  WITH CHECK ((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint));

CREATE POLICY group_sessions_update ON public."Sessions"
  FOR UPDATE
  USING ((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint))
  WITH CHECK ((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint));

ALTER SEQUENCE public."Sessions_id_seq" OWNED BY public."Sessions".id;

ALTER TABLE public."Sessions"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."Sessions"
  ADD CONSTRAINT "Sessions_pkey" PRIMARY KEY (id);

ALTER TABLE public."Sessions"
  ADD CONSTRAINT "Sessions_visit_date_location_id_key" UNIQUE (visit_date, location_id);

ALTER TABLE public."Sessions"
  ADD CONSTRAINT sessions_location_id_fkey FOREIGN KEY (location_id) REFERENCES public."Locations"(id);

ALTER TABLE public."Sessions"
  ADD CONSTRAINT sessions_ringing_group_id_fkey FOREIGN KEY (ringing_group_id) REFERENCES public."RingingGroups"(id);

GRANT ALL ON public."Sessions" TO anon;

GRANT ALL ON public."Sessions" TO authenticated;

GRANT ALL ON public."Sessions" TO service_role;