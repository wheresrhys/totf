CREATE SEQUENCE public."HighlightReports_id_seq";

CREATE TABLE public."HighlightReports" (
	id bigint DEFAULT nextval('public."HighlightReports_id_seq"'::regclass) NOT NULL,
	page_url text NOT NULL,
	highlight_text text NOT NULL,
	reason text NOT NULL,
	highlight_body jsonb NOT NULL,
	created_at timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public."HighlightReports" IS 'QA-submitted reports of bad/wrong highlight output, submitted anonymously from production behind a qa cookie gate';

-- Public, unauthenticated reporting: anyone can submit a report and anyone can read the list back
-- (the admin page at /_highlights relies on this to use the plain anon client). No UPDATE/DELETE
-- policy, so reports are append-only via the API.
CREATE POLICY highlight_reports_insert ON public."HighlightReports" FOR INSERT TO anon,
authenticated
WITH
	CHECK (TRUE);

CREATE POLICY highlight_reports_select ON public."HighlightReports" FOR
SELECT
	TO anon,
	authenticated USING (TRUE);

ALTER SEQUENCE public."HighlightReports_id_seq" OWNED BY public."HighlightReports".id;

ALTER TABLE public."HighlightReports" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."HighlightReports"
ADD CONSTRAINT "HighlightReports_pkey" PRIMARY KEY (id);

GRANT ALL ON public."HighlightReports" TO anon;

GRANT ALL ON public."HighlightReports" TO authenticated;

GRANT ALL ON public."HighlightReports" TO service_role;
