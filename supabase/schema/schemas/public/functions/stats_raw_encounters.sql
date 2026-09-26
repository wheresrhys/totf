-- Shared plumbing for core_stats and demographics_stats (#800). Pre-aggregates
-- all Encounters/Sessions/Birds/Species rows in scope for a given
-- (species_name_filter, from_date, to_date, ringing_group_filter) query window,
-- with the day/month/year grouping columns precomputed for the caller to pick
-- from. This is the base windowed row source both RPCs build their own
-- grouping/classification logic on top of via the other agg_* utility RPCs — keep
-- this the single place that defines "which raw rows are in scope for a query".
-- Mirrors core_stats' own (untouched, historical) inline raw_encounters CTE —
-- the two are logically equivalent but no longer share this exact SQL text, since
-- core_stats predates this extraction and changing it carries needless
-- regression risk to its existing, heavily-exercised query plan.
CREATE FUNCTION public.stats_raw_encounters (
	species_name_filter text DEFAULT NULL::text,
	from_date date DEFAULT NULL::date,
	to_date date DEFAULT NULL::date,
	ringing_group_filter bigint DEFAULT NULL::bigint,
	year_filter smallint DEFAULT NULL::smallint,
	month_filter smallint DEFAULT NULL::smallint
) RETURNS TABLE (
	species_id bigint,
	species_name text,
	bird_id bigint,
	ring_no text,
	encounter_id bigint,
	weight real,
	wing_length smallint,
	record_type text,
	age_code smallint,
	is_juv boolean,
	session_id bigint,
	visit_date date,
	session_type text,
	max_hatch_year smallint,
	capture_time time without time zone,
	session_day date,
	session_month date,
	session_year date
) LANGUAGE sql STABLE AS $function$
  SELECT
    sp.id AS species_id,
    sp.species_name,
    b.id AS bird_id,
    b.ring_no,
    e.id AS encounter_id,
    e.weight,
    e.wing_length,
    e.record_type,
    e.age_code,
    e.is_juv,
    sess.id AS session_id,
    sess.visit_date,
    sess.session_type,
    e.max_hatch_year,
    e.capture_time,
    -- visit_date is already a DATE, so truncating it to a day is the identity — and
    -- the ::timestamp casts on month/year are load-bearing, not cosmetic. Postgres has
    -- no date_trunc(text, date) overload, so a bare `date_trunc('month', sess.visit_date)`
    -- resolves to date_trunc(text, timestamptz), which is STABLE (timezone-dependent)
    -- rather than IMMUTABLE and measurably slower to evaluate per row. Casting to
    -- timestamp picks the IMMUTABLE overload. Verified identical output for every
    -- session date in the seed data; it is also strictly more deterministic, since the
    -- timestamptz form would depend on the connection's TimeZone setting.
    sess.visit_date AS session_day,
    date_trunc('month', sess.visit_date::timestamp)::DATE AS session_month,
    date_trunc('year', sess.visit_date::timestamp)::DATE AS session_year
  FROM public."Species" sp
  JOIN public."Birds" b ON sp.id = b.species_id
  -- Resighting/recovery record_types (public.resighting_record_type: U/F/D) are
  -- passive encounters with no bird in the hand, and must not surface in any stats
  -- RPC (#874). Filtering in the LEFT JOIN's ON clause (not the WHERE) preserves the
  -- NULL-preserving semantics: a bird whose only encounters are resightings still
  -- appears with encounter_id IS NULL rather than being dropped entirely.
  --
  -- The exclusion list is spelled as an `IN (SELECT unnest(...))` sublink rather than
  -- the equivalent `= ANY (enum_range(...)::text[])` array expression on purpose.
  -- enum_range() is STABLE, not IMMUTABLE, so Postgres cannot constant-fold it at plan
  -- time; written inline as an array it is re-evaluated (catalog lookups and all) once
  -- PER ROW of Encounters. Measured on a 40k-row Encounters table that cost 81,782
  -- shared buffer hits and ~36-56ms for the scan, versus 1,601 hits and ~7ms with the
  -- value resolved once. The sublink form plans as a single hashed SubPlan evaluated
  -- once per query instead. Because every stats RPC derives this row source (and
  -- core_stats derives it 4x via its utility-RPC layering), that per-row cost was ~29%
  -- of core_stats' total runtime. Do NOT "simplify" this back to the array form, and
  -- keep the enum itself as the source of truth — don't inline a literal 'U'/'F'/'D'
  -- list here (see CLAUDE.md on keeping RESIGHTING_RECORD_TYPES in sync by hand).
  LEFT JOIN public."Encounters" e ON b.id = e.bird_id
    AND NOT (e.record_type IN (SELECT unnest(enum_range(NULL::public.resighting_record_type)::text[])))
  LEFT JOIN public."Sessions" sess ON e.session_id = sess.id
  WHERE (from_date IS NULL OR sess.visit_date >= from_date)
   AND (to_date IS NULL OR sess.visit_date <= to_date)
   AND (species_name_filter IS NULL OR sp.species_name = species_name_filter)
   AND (ringing_group_filter IS NULL OR sess.ringing_group_id = ringing_group_filter)
   AND (year_filter IS NULL OR EXTRACT(YEAR FROM sess.visit_date) = year_filter)
   AND (month_filter IS NULL OR EXTRACT(MONTH FROM sess.visit_date) = month_filter);
$function$;

GRANT ALL ON FUNCTION public.stats_raw_encounters (text, date, date, bigint, smallint, smallint) TO anon;

GRANT ALL ON FUNCTION public.stats_raw_encounters (text, date, date, bigint, smallint, smallint) TO authenticated;

GRANT ALL ON FUNCTION public.stats_raw_encounters (text, date, date, bigint, smallint, smallint) TO service_role;
