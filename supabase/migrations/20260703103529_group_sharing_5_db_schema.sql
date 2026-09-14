DROP POLICY group_birds_access ON public."Birds";
DROP POLICY group_encounters_access ON public."Encounters";
DROP POLICY group_locations_access ON public."Locations";
DROP POLICY group_sessions_access ON public."Sessions";
CREATE SEQUENCE public."GroupDataSharing_id_seq";
CREATE TABLE public."GroupDataSharing" (id bigint DEFAULT nextval('public."GroupDataSharing_id_seq"'::regclass) NOT NULL, granter_group_id bigint NOT NULL, recipient_group_id bigint NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER SEQUENCE public."GroupDataSharing_id_seq" OWNED BY public."GroupDataSharing".id;
GRANT UPDATE ON SEQUENCE public."GroupDataSharing_id_seq" TO anon;
GRANT UPDATE ON SEQUENCE public."GroupDataSharing_id_seq" TO authenticated;
GRANT UPDATE ON SEQUENCE public."GroupDataSharing_id_seq" TO service_role;
CREATE POLICY group_birds_access ON public."Birds" FOR SELECT USING ((((((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint = ANY (ringing_group_ids)) OR ((ringing_group_ids = '{}'::bigint[]) AND ((((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint IS NOT NULL)) OR (EXISTS ( SELECT 1
   FROM (public."GroupDataSharing" gds
     JOIN unnest("Birds".ringing_group_ids) gid(gid) ON ((gid.gid = gds.granter_group_id)))
  WHERE (gds.recipient_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint)))));
CREATE POLICY group_encounters_access ON public."Encounters" FOR SELECT USING (((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint) OR (EXISTS ( SELECT 1
   FROM public."GroupDataSharing"
  WHERE (("GroupDataSharing".granter_group_id = "Encounters".ringing_group_id) AND ("GroupDataSharing".recipient_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint))))));
COMMENT ON TABLE public."GroupDataSharing" IS 'granter_group_id shares their data with recipient_group_id';
ALTER TABLE public."GroupDataSharing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GroupDataSharing" ADD CONSTRAINT "GroupDataSharing_pkey" PRIMARY KEY (id);
ALTER TABLE public."GroupDataSharing" ADD CONSTRAINT group_data_sharing_granter_group_id_fkey FOREIGN KEY (granter_group_id) REFERENCES public."RingingGroups"(id) ON DELETE CASCADE;
ALTER TABLE public."GroupDataSharing" ADD CONSTRAINT group_data_sharing_recipient_group_id_fkey FOREIGN KEY (recipient_group_id) REFERENCES public."RingingGroups"(id) ON DELETE CASCADE;
ALTER TABLE public."GroupDataSharing" ADD CONSTRAINT no_self_share CHECK (granter_group_id <> recipient_group_id);
ALTER TABLE public."GroupDataSharing" ADD CONSTRAINT unique_share UNIQUE (granter_group_id, recipient_group_id);
GRANT ALL ON public."GroupDataSharing" TO anon;
GRANT ALL ON public."GroupDataSharing" TO authenticated;
GRANT ALL ON public."GroupDataSharing" TO service_role;
CREATE POLICY group_data_sharing_select ON public."GroupDataSharing" FOR SELECT USING ((recipient_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint));
CREATE POLICY group_locations_access ON public."Locations" FOR SELECT USING (((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint) OR (EXISTS ( SELECT 1
   FROM public."GroupDataSharing"
  WHERE (("GroupDataSharing".granter_group_id = "Locations".ringing_group_id) AND ("GroupDataSharing".recipient_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint))))));
CREATE POLICY group_sessions_access ON public."Sessions" FOR SELECT USING (((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint) OR (EXISTS ( SELECT 1
   FROM public."GroupDataSharing"
  WHERE (("GroupDataSharing".granter_group_id = "Sessions".ringing_group_id) AND ("GroupDataSharing".recipient_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint))))));
