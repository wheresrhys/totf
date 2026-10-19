ALTER TABLE public."HighlightReports" ADD COLUMN is_dismissed boolean DEFAULT false NOT NULL;
CREATE POLICY highlight_reports_update ON public."HighlightReports" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
