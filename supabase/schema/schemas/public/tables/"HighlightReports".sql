CREATE SEQUENCE public."HighlightReports_id_seq";

CREATE TABLE public."HighlightReports" (
	id bigint DEFAULT nextval('public."HighlightReports_id_seq"'::regclass) NOT NULL,
	page_url text NOT NULL,
	highlight_text text NOT NULL,
	reason text NOT NULL,
	highlight_body jsonb NOT NULL,
	created_at timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public."HighlightReports" IS 'QA-submitted reports of bad/wrong highlight output, submitted from production behind a qa cookie gate';

-- Every authenticated group is authorised to insert and read reports — no
-- group scoping needed, and no anon access (reports always come from a
-- logged-in group, see "Species".sql for the same authenticated-only shape).
-- No UPDATE/DELETE policy, so reports are append-only via the API.
CREATE POLICY highlight_reports_insert ON public."HighlightReports" FOR INSERT TO authenticated
WITH
	CHECK (TRUE);

CREATE POLICY highlight_reports_select ON public."HighlightReports" FOR
SELECT
	TO authenticated USING (TRUE);

ALTER SEQUENCE public."HighlightReports_id_seq" OWNED BY public."HighlightReports".id;

ALTER TABLE public."HighlightReports" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."HighlightReports"
ADD CONSTRAINT "HighlightReports_pkey" PRIMARY KEY (id);

GRANT ALL ON public."HighlightReports" TO authenticated;

GRANT ALL ON public."HighlightReports" TO service_role;
