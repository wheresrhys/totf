-- One of six small, read-only "metric-group" RPCs (#1150, sibling of #1145's
-- stats_cache_biometrics_metrics / #1148's stats_cache_bird_age_metrics /
-- #1149's stats_cache_encounter_age_metrics) a later orchestrator calls to
-- populate a stats cache table. Unlike its five siblings, this one feeds T8b
-- (refresh_complex_stats_cache / ComplexStatsCache, T1b) rather than T8a
-- (refresh_simple_stats_cache / SimpleStatsCache, T1a): new_adult_bird_count
-- answers "is this cell's period_year the bird's first-ever-with-this-group
-- calendar year?", which reads a bird's whole UNWINDOWED encounter history —
-- any backdated encounter anywhere in that history, even one inserted long
-- after the fact for a calendar year long before the current window, can
-- retroactively change which year is "first-ever" for the bird. That makes
-- this metric impossible to compute incrementally from a windowed delta, so
-- T8b must always fully recompute this metric group on every refresh
-- (enforced at the orchestrator level, not here — this RPC is only the read
-- side).
--
-- This is an almost-direct port of demographics_stats' own
-- lifetime_encounters -> bird_first_year -> cell_period_year ->
-- adult_age_split -> adult_split_counts CTE chain (see that function's header
-- and supabase/CLAUDE.md's "Companion stats RPCs and shared plumbing"), keyed
-- on species_id rather than species_name like every other stats_cache_*
-- result, with every other demographics_stats column dropped (those are
-- stats_cache_bird_age_metrics' and stats_cache_encounter_age_metrics'
-- concern, not this one's).
--
-- cell_period_year's attachment onto the adult-bucketed cohort is NOT a plain
-- join keyed on (species_id, time_period) — demographics_stats' current
-- adult_age_split CTE still does that (`py.species_id IS NOT DISTINCT FROM
-- bab.species_id AND py.time_period IS NOT DISTINCT FROM bab.time_period`),
-- which is exactly the join stats_bird_returning_age_bucket's adult_birds CTE
-- used to make before its 2026-09-20 plan-stability rewrite (see that
-- function's header and CLAUDE.md's "That same advice was then applied to
-- adult_birds itself" section for the full postmortem: IS NOT DISTINCT FROM
-- against a SQL-function-backed relation defeats the row-count estimator,
-- forcing a nested-loop join — measured 77,000ms -> 1,110ms once fixed). This
-- RPC reproduces that fix instead of demographics_stats' current (unfixed, for
-- this one join) shape: cell_period_year's one row per cell is UNION ALLed
-- with the adult-bucketed bird rows on the same (species_id, time_period)
-- axis (a cell_event_ord column distinguishing them, bird rows carrying a
-- NULL period_year), and a single MAX(period_year) OVER (PARTITION BY
-- species_id, time_period) hands every bird row its own cell's value — no
-- join to mis-plan.
--
-- bird_first_year, by contrast, is NOT a per-cell "as of" lookup —
-- first-ever-with-group year is a single fact per bird, identical across
-- every cell that bird appears in — so it stays demographics_stats' plain
-- per-bird GROUP BY MIN(enc_year) joined onto the adult cohort by a normal
-- bird_id equi-join. That join is hashable/mergeable and well-estimated
-- (unlike the IS NOT DISTINCT FROM one above), so it does NOT need
-- stats_bird_returning_age_bucket's #932 merge-the-streams treatment for
-- reading lifetime history "as of" a cell's year — that fix exists for a
-- value that genuinely varies by cell's period_year (period-relative proven
-- age, a cumulative "as of" read); first-ever year has no such cutoff to
-- track, so a naive per-cell join against it was never the quadratic risk the
-- cell_period_year attachment above was.
--
-- Group scoping of lifetime_encounters mirrors stats_raw_encounters' pattern,
-- so a bird's history under a DIFFERENT group never counts as history with
-- this one.
--
-- LANGUAGE sql STABLE, not plpgsql, like stats_spine/stats_bird_age_bucket
-- themselves — this is a plain single-SELECT utility RPC, not one of the
-- plpgsql orchestrators (T8a/T8b) whose shape-parameterized join needs
-- SET plan_cache_mode TO 'force_custom_plan' to avoid the generic-plan-cliff
-- (see CLAUDE.md). That mitigation does not apply here.
--
-- The spine is still joined, exactly as demographics_stats and every sibling
-- in this RPC family do: a cell with no matching adult birds must appear with
-- zero count rather than vanish, so this RPC's rows line up row-for-row with
-- demographics_stats' for identical filters (and so T8b writes a cache row
-- per cell, not just per non-empty cell). COALESCE to 0 restores that for the
-- one count column, since a LEFT JOIN with no match yields NULL here (unlike
-- stats_cache_bird_age_metrics' bare COUNT(*) FILTER, which is already 0 on
-- an empty group).
--
-- The final projection is wrapped in jsonb_populate_record rather than
-- returned as a bare positional SELECT, for the same reason as every sibling
-- RPC in this family: a bare final SELECT binds to the composite return
-- type's columns by ORDINAL POSITION, not by the "AS" alias names below, and
-- that position is only as stable as whatever DDL a given environment's
-- schema-diff run happens to emit for the type's physical attribute order
-- (two db:schema:apply runs on the same source files produced two different
-- orders — see biometrics_stats.sql's header for the #800 postmortem).
-- Routing through to_jsonb(...)/jsonb_populate_record binds every column by
-- NAME instead, and it is evaluated via CROSS JOIN LATERAL (once per outer
-- row) rather than as a bare `(...).*` projection, which Postgres would
-- expand at parse time into one independent call PER OUTPUT COLUMN.
CREATE FUNCTION public.stats_cache_new_adult_metrics (
	species_name_filter text DEFAULT NULL::text,
	from_date date DEFAULT NULL::date,
	to_date date DEFAULT NULL::date,
	ringing_group_filter bigint DEFAULT NULL::bigint,
	group_by_species boolean DEFAULT FALSE,
	group_by_time_period text DEFAULT NULL::text,
	year_filter smallint DEFAULT NULL::smallint,
	month_filter smallint DEFAULT NULL::smallint
) RETURNS SETOF public.stats_cache_new_adult_metrics_result LANGUAGE sql STABLE AS $function$
  SELECT r.*
  FROM (
  WITH spine AS (
    SELECT * FROM public.stats_spine(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
  ), encounter_age_classification AS (
    SELECT * FROM public.stats_encounter_age_classification(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
  ), bird_age_bucket AS (
    SELECT * FROM public.stats_bird_age_bucket(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
  ),
  -- Resolve the calendar year each (species, time_period) cell represents.
  -- Identical rule to demographics_stats' own cell_period_year CTE (keep the
  -- two in sync by hand): use the cell's own time_period when grouped by
  -- day/month/year, else fall back to the latest visit date present in the
  -- cell.
  cell_period_year AS (
    SELECT
      eac.species_id,
      eac.time_period,
      EXTRACT(YEAR FROM COALESCE(eac.time_period, MAX(eac.visit_date)))::int AS period_year
    FROM encounter_age_classification eac
    GROUP BY eac.species_id, eac.time_period
  ),
  -- Every adult-bucketed bird in every cell, carrying that cell's period_year
  -- via the merge-the-streams pattern (stats_bird_returning_age_bucket's
  -- adult_birds CTE, see this function's header) instead of an IS NOT
  -- DISTINCT FROM join.
  cell_events AS (
    SELECT
      py.species_id,
      py.time_period,
      0 AS cell_event_ord,
      NULL::bigint AS bird_id,
      py.period_year
    FROM cell_period_year py
    UNION ALL
    SELECT
      bab.species_id,
      bab.time_period,
      1,
      bab.bird_id,
      NULL::int
    FROM bird_age_bucket bab
    WHERE bab.age_bucket = 'adult'
      AND bab.bird_id IS NOT NULL
  ),
  adult_birds AS (
    SELECT ce.bird_id, ce.species_id, ce.time_period, ce.period_year
    FROM (
      SELECT
        c.bird_id,
        c.species_id,
        c.time_period,
        c.cell_event_ord,
        MAX(c.period_year) OVER (PARTITION BY c.species_id, c.time_period) AS period_year
      FROM cell_events c
    ) ce
    WHERE ce.cell_event_ord = 1
      AND ce.period_year IS NOT NULL
  ),
  -- Unwindowed lifetime history for every adult bird above, scoped to
  -- ringing_group_filter but IGNORING from_date/to_date — first-ever-year
  -- can't be answered from a windowed source. Mirrors demographics_stats' own
  -- lifetime_encounters CTE.
  lifetime_encounters AS (
    SELECT
      e.bird_id,
      EXTRACT(YEAR FROM sess.visit_date)::int AS enc_year
    FROM public."Encounters" e
    JOIN public."Sessions" sess ON e.session_id = sess.id
    WHERE (ringing_group_filter IS NULL OR sess.ringing_group_id = ringing_group_filter)
      AND e.bird_id IN (SELECT DISTINCT ab.bird_id FROM adult_birds ab)
  ),
  -- First calendar year each bird was ever encountered by this group
  -- (unwindowed). A plain per-bird aggregate, not a per-cell "as of" read —
  -- see this function's header for why that's fine without #932's
  -- merge-the-streams treatment.
  bird_first_year AS (
    SELECT le.bird_id, MIN(le.enc_year) AS first_year
    FROM lifetime_encounters le
    GROUP BY le.bird_id
  ),
  new_adult_counts AS (
    SELECT
      ab.species_id,
      ab.time_period,
      COUNT(*) FILTER (WHERE bfy.first_year = ab.period_year) AS new_adult_bird_count
    FROM adult_birds ab
    LEFT JOIN bird_first_year bfy ON bfy.bird_id = ab.bird_id
    GROUP BY ab.species_id, ab.time_period
  )
  SELECT
    CASE WHEN group_by_species THEN spine.species_id ELSE NULL::bigint END AS "species_id",
    CASE
      WHEN group_by_time_period = 'day' THEN spine.time_period
      WHEN group_by_time_period = 'month' THEN spine.time_period
      WHEN group_by_time_period = 'year' THEN spine.time_period
      WHEN group_by_time_period = 'month-squashed' THEN spine.time_period
      ELSE NULL::date
    END AS "time_period",

    COALESCE(nac.new_adult_bird_count, 0) AS "new_adult_bird_count"

  FROM spine
  LEFT JOIN new_adult_counts nac ON
  (NOT group_by_species OR spine.species_id = nac.species_id)
  AND (
    (group_by_time_period IN ('day', 'month', 'year', 'month-squashed') AND spine.time_period = nac.time_period)
    OR (group_by_time_period IS NULL OR group_by_time_period NOT IN ('month', 'year', 'day', 'month-squashed'))
  )
  ) AS agg
  CROSS JOIN LATERAL jsonb_populate_record(NULL::public.stats_cache_new_adult_metrics_result, to_jsonb(agg)) AS r
  ORDER BY r.species_id ASC, r.time_period ASC;
$function$;

GRANT ALL ON FUNCTION public.stats_cache_new_adult_metrics (
	text,
	date,
	date,
	bigint,
	boolean,
	text,
	smallint,
	smallint
) TO anon;

GRANT ALL ON FUNCTION public.stats_cache_new_adult_metrics (
	text,
	date,
	date,
	bigint,
	boolean,
	text,
	smallint,
	smallint
) TO authenticated;

GRANT ALL ON FUNCTION public.stats_cache_new_adult_metrics (
	text,
	date,
	date,
	bigint,
	boolean,
	text,
	smallint,
	smallint
) TO service_role;
