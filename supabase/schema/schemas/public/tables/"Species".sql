CREATE TABLE public."Species" (
	species_name text NOT NULL,
	id bigint DEFAULT nextval('public."Species_id_seq"'::regclass) NOT NULL
);

CREATE POLICY species_access ON public."Species" FOR
SELECT
	USING (TRUE);

CREATE POLICY species_insert ON public."Species" FOR INSERT
WITH
	CHECK (TRUE);

CREATE POLICY species_update ON public."Species"
FOR UPDATE
	USING (TRUE)
WITH
	CHECK (TRUE);

COMMENT ON TABLE public."Species" IS 'Bird Species';

ALTER SEQUENCE public."Species_id_seq" OWNED BY public."Species".id;

ALTER TABLE public."Species" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."Species"
ADD CONSTRAINT "Species_pkey" PRIMARY KEY (id);

ALTER TABLE public."Species"
ADD CONSTRAINT species_species_name_unique UNIQUE (species_name);

GRANT ALL ON public."Species" TO anon;

GRANT ALL ON public."Species" TO authenticated;

GRANT ALL ON public."Species" TO service_role;
