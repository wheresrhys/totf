REVOKE SELECT, USAGE ON SEQUENCE public."HighlightReports_id_seq" FROM anon;
REVOKE SELECT, USAGE ON SEQUENCE public."HighlightReports_id_seq" FROM authenticated;
REVOKE SELECT, USAGE ON SEQUENCE public."HighlightReports_id_seq" FROM service_role;
COMMENT ON TABLE public."HighlightReports" IS 'QA-submitted reports of bad/wrong highlight output, submitted from production behind a qa cookie gate';
REVOKE DELETE, INSERT, SELECT, UPDATE ON public."HighlightReports" FROM anon;
ALTER POLICY highlight_reports_insert ON public."HighlightReports" TO authenticated;
ALTER POLICY highlight_reports_select ON public."HighlightReports" TO authenticated;
