CREATE SEQUENCE public."DemonRecords_id_seq";
CREATE TABLE public."DemonRecords" (id bigint DEFAULT nextval('public."DemonRecords_id_seq"'::regclass) NOT NULL, raw_row jsonb NOT NULL, ring_no text NOT NULL, encounter_date date NOT NULL, encounter_time time without time zone NOT NULL, ringing_group_id bigint NOT NULL, import_job_id bigint NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER SEQUENCE public."DemonRecords_id_seq" OWNED BY public."DemonRecords".id;
GRANT UPDATE ON SEQUENCE public."DemonRecords_id_seq" TO anon;
GRANT UPDATE ON SEQUENCE public."DemonRecords_id_seq" TO authenticated;
GRANT UPDATE ON SEQUENCE public."DemonRecords_id_seq" TO service_role;
COMMENT ON TABLE public."DemonRecords" IS 'Near-verbatim staging copy of every imported CSV row, captured before transformation, for import recovery and future backfill of currently-unmodelled DemOn columns';
ALTER TABLE public."DemonRecords" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DemonRecords" ADD CONSTRAINT "DemonRecords_pkey" PRIMARY KEY (id);
ALTER TABLE public."DemonRecords" ADD CONSTRAINT demon_records_group_ring_date_time_unique UNIQUE (ringing_group_id, ring_no, encounter_date, encounter_time);
ALTER TABLE public."DemonRecords" ADD CONSTRAINT demon_records_import_job_id_fkey FOREIGN KEY (import_job_id) REFERENCES public."ImportJobs"(id);
ALTER TABLE public."DemonRecords" ADD CONSTRAINT demon_records_ringing_group_id_fkey FOREIGN KEY (ringing_group_id) REFERENCES public."RingingGroups"(id);
GRANT ALL ON public."DemonRecords" TO anon;
GRANT ALL ON public."DemonRecords" TO authenticated;
GRANT ALL ON public."DemonRecords" TO service_role;
CREATE INDEX idx_demon_records_ringing_group_id ON public."DemonRecords" (ringing_group_id);
CREATE INDEX idx_demon_records_import_job_id ON public."DemonRecords" (import_job_id);
CREATE POLICY group_demon_records_access ON public."DemonRecords" FOR SELECT USING (((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint) OR (EXISTS ( SELECT 1
   FROM public."GroupDataSharing"
  WHERE (("GroupDataSharing".granter_group_id = "DemonRecords".ringing_group_id) AND ("GroupDataSharing".recipient_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint))))));
CREATE POLICY group_demon_records_insert ON public."DemonRecords" FOR INSERT WITH CHECK ((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint));
CREATE POLICY group_demon_records_update ON public."DemonRecords" FOR UPDATE USING ((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint)) WITH CHECK ((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint));
