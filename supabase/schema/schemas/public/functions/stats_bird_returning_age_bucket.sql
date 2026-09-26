-- Shared plumbing for demographics_stats' "Returning ages" columns (#843).
-- Resolves each ADULT-bucketed bird, per (species, time_period) cell, into one of
-- four returning-age buckets — '1' / '2' / '3_plus' / 'new_unknown_age' — or NULL
-- for a bird that isn't yet proven to have returned at all.
--
-- Adult membership is reused verbatim from stats_bird_age_bucket (age_bucket =
-- 'adult'), mirroring demographics_stats' own adult_age_split filter, so this
-- function partitions exactly the same cohort the age-split columns do.
--
-- Why the age is recomputed here rather than read off Birds.proven_age: that
-- column is a LIVE, global, all-time value refreshed by
-- trg_encounters_refresh_bird_proven_age on every encounter write, so joining it
-- onto a historical cell would stamp today's age onto a row from ten years ago.
-- This function instead computes a PERIOD-RELATIVE age, as of each cell's own
-- period_year, from the bird's lifetime history with this ringing group windowed
-- to enc_year <= period_year:
--
--   encounters_to_date              = COUNT of those encounters
--   period_relative_proven_age      = period_year - MIN(max_hatch_year) over them
--                                     (the same formula
--                                     trg_encounters_refresh_bird_proven_age uses,
--                                     windowed instead of all-time)
--   was_ever_precisely_aged_to_date = bool_or(min_hatch_year <> 0) over them
--                                     (min_hatch_year = 0 is
--                                     trg_set_encounter_generated_fields' sentinel
--                                     for an EVEN, i.e. imprecise, age_code)
--
-- Classification, in order:
--   * period_relative_proven_age = 0  -> NULL. Not yet proven to have returned;
--     these birds are #854's "New adults" series, not this one. Emitting NULL (a
--     row that lands in no bucket) rather than dropping the row keeps the output
--     one-row-per-adult-bird-per-cell, which is easier to reason about downstream.
--   * encounters_to_date = 1 AND NOT was_ever_precisely_aged_to_date AND
--     period_relative_proven_age = 1 -> 'new_unknown_age'. A bird's very first
--     encounter, coded imprecisely (even age_code), can compute an apparent age of
--     1 purely as a coding artefact rather than from any return history — there is
--     no second encounter to prove it returned.
--     This carve-out is DELIBERATELY NARROW: it only fires when the bucket would
--     otherwise be '1'. A first-ever imprecise encounter computing an age of 2
--     (an even code further from the boundary) is NOT carved out and lands in '2'
--     — an accepted, documented quirk. Do not generalise this into a blanket
--     "never precisely aged" filter.
--   * otherwise -> '1' / '2' / '3_plus' by period_relative_proven_age. This covers
--     every genuinely-returning bird (encounters_to_date >= 2) whether or not it
--     was ever precisely aged.
--
-- Group scoping of the lifetime history mirrors stats_raw_encounters' pattern, so
-- a bird's history under a DIFFERENT group never counts as history with this one.
--
-- HOW the three "to date" values are computed (#932 — performance only; every
-- classification rule above is unchanged). The original implementation joined the
-- per-cell adult_birds relation straight against each bird's whole per-ENCOUNTER
-- lifetime history and re-ran COUNT/MIN/bool_or from scratch for every cell —
-- O(cells_per_bird x lifetime_encounters_per_bird), which blows up for a long-lived,
-- heavily-retrapped bird grouped by month over many years. It is now a single
-- merged-stream pass instead:
--
--   1. lifetime_encounters_by_year collapses the per-encounter history to one row
--      per (bird, calendar year), pre-aggregating that year's own contribution.
--   2. bird_year_events UNIONs those per-year rows (event_ord 0) with the cells
--      (event_ord 1), keyed on the same bird_id/year axis.
--   3. A single window pass over that stream, PARTITION BY bird_id ORDER BY
--      (event_year, event_ord), gives every cell row the running SUM/MIN/bool_or of
--      every history row at or before its own period_year — because event_ord orders
--      a year's history row BEFORE a cell row for that same year, and cell rows
--      contribute NULL (ignored by all three aggregates) so they never perturb the
--      running totals, including for several cells sharing one period_year.
--
-- Cost is one sort of (cells + bird-years) rows rather than a per-cell re-scan.
-- Measured on a synthetic 300-bird x 240-encounter group grouped by month:
-- 23.4s -> 1.2s, with output verified byte-identical across ~1,200 parameter
-- combinations. Deliberately NOT a LEFT JOIN LATERAL over the per-year series: the
-- planner inlines the correlated subquery and re-derives each bird's history per cell
-- anyway, keeping the quadratic term (measured 8.2s on the same fixture vs 1.2s here).
--
-- Two behaviours the merged stream preserves exactly:
--   * A cell whose bird has no history row at or before its period_year gets NULL
--     from MIN, hence a NULL bucket — same as the old LEFT JOIN finding no match.
--     (Unreachable in practice: stats_raw_encounters scopes the windowed source by
--     the same sess.ringing_group_id the lifetime CTE uses, so a bird's windowed
--     encounters are always a subset of its lifetime ones. Defensive only.)
--   * encounters_to_date is COALESCEd to 0 rather than left NULL, matching the old
--     COUNT() over zero joined rows.
CREATE FUNCTION public.stats_bird_returning_age_bucket (
	species_name_filter text DEFAULT NULL::text,
	from_date date DEFAULT NULL::date,
	to_date date DEFAULT NULL::date,
	ringing_group_filter bigint DEFAULT NULL::bigint,
	group_by_species boolean DEFAULT FALSE,
	group_by_time_period text DEFAULT NULL::text,
	year_filter smallint DEFAULT NULL::smallint,
	month_filter smallint DEFAULT NULL::smallint
) RETURNS TABLE (
	bird_id bigint,
	species_id bigint,
	time_period date,
	returning_age_bucket text
) LANGUAGE sql STABLE AS $function$
  WITH encounter_age_classification AS (
    SELECT * FROM public.stats_encounter_age_classification(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
  ), bird_age_bucket AS (
    SELECT * FROM public.stats_bird_age_bucket(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
  ),
  -- Resolve the calendar year each (species, time_period) cell represents.
  -- Identical rule to demographics_stats' own cell_period_year CTE (keep the two
  -- in sync by hand): use the cell's own time_period when grouped by day/month/
  -- year, else fall back to the latest visit date present in the cell.
  cell_period_year AS (
    SELECT
      eac.species_id,
      eac.time_period,
      EXTRACT(YEAR FROM COALESCE(eac.time_period, MAX(eac.visit_date)))::int AS period_year
    FROM encounter_age_classification eac
    GROUP BY eac.species_id, eac.time_period
  ),
  -- Every adult-bucketed bird in every cell, carrying that cell's period_year.
  --
  -- This used to be a plain JOIN of bird_age_bucket to cell_period_year with
  -- `py.species_id IS NOT DISTINCT FROM bab.species_id AND py.time_period IS NOT
  -- DISTINCT FROM bab.time_period` (NULL-safe, because both columns are NULL on
  -- EVERY row in the ungrouped case). It is now a NULL-safe window PARTITION over
  -- a merged stream of the same two relations — same rows out, no join at all.
  -- Why (plan stability, 2026-09-20; performance only, every classification rule
  -- above is unchanged and output is byte-identical):
  --
  --   * IS NOT DISTINCT FROM is neither hashable nor mergeable, so that join could
  --     only ever be a NESTED LOOP with a join filter: O(cells x adult-bird-cells)
  --     comparisons, nearly all of them discarded. Measured on a synthetic 164k-
  --     encounter / 4-group / 4,000-bird / 60-species fixture, the group-wide
  --     monthly shape evaluated 111 x 41,143 pairs to emit 41,143 rows.
  --   * Worse, its row estimate is chronically, unfixably wrong — both inputs are
  --     SQL-function-backed relations and the IS NOT DISTINCT FROM clauses carry no
  --     usable selectivity, so the loop is planned at `rows=1` when it really
  --     returns tens of thousands (this is the "adult_birds is estimated at 1 row"
  --     note in CLAUDE.md). At that estimate the planner is free to put
  --     cell_period_year on the INNER side WITHOUT a Materialize, re-running its
  --     whole aggregate once per outer row. Today's data happens not to trigger
  --     that; a small selectivity change upstream does. Reproduced by applying the
  --     (unshipped) ringing_group_filter pushdown to stats_raw_encounters: the
  --     species+month shape went 21ms -> 383ms, with the cell_period_year
  --     GroupAggregate showing `loops=2689` in EXPLAIN ANALYZE. The underestimate
  --     gets worse, not better, as more groups land in prod.
  --   * And the catastrophic side was already reachable WITHOUT that pushdown, by
  --     the most ordinary route there is: demographics_stats is LANGUAGE plpgsql,
  --     so its RETURN QUERY statement is plan-cached per backend and switches to a
  --     GENERIC plan on the 6th execution in a session — a plan built with no
  --     parameter values at all, i.e. the worst estimate available. On the fixture
  --     above, group-wide monthly demographics_stats ran ~670ms for executions 1-5
  --     (custom plans) and 77,000ms from execution 6 onward. PostgREST pools
  --     connections, so a busy backend reaches execution 6 routinely. That cliff is
  --     the real motivation here; the pushdown experiment merely made it easy to
  --     reproduce on demand.
  --
  -- The replacement has no join to mis-plan: cell_events UNION ALLs the one
  -- period_year row per cell (cell_event_ord 0) with the adult-bird rows that need
  -- it (cell_event_ord 1) on the same (species_id, time_period) axis, and a single
  -- MAX(...) OVER (PARTITION BY species_id, time_period) hands every bird row its
  -- cell's period_year. PARTITION BY groups NULLs together, so this is NULL-safe in
  -- exactly the way IS NOT DISTINCT FROM was, with no sentinel value needed — and
  -- because bird rows carry a NULL period_year they can never perturb the MAX.
  -- (Same merge-the-streams trick as the #932 history pass below, applied to the
  -- cell axis instead of the year axis.) Cost is one sort of (cells + adult-bird-
  -- cells) rows, which no row estimate can turn quadratic. Measured on the fixture
  -- above: species+month 21ms -> 12.6ms good-estimate and 383ms -> 9.9ms under the
  -- induced bad estimate; group-wide month 301ms -> 144ms; end-to-end
  -- demographics_stats group-wide month 670ms -> 520ms on a custom plan and
  -- 77,000ms -> 1,110ms on the generic plan. Note the shape of that last pair: the
  -- rewrite does not make the generic plan as good as the custom one, it makes the
  -- gap between them a factor of 2 instead of a factor of 115.
  --
  -- period_year IS NOT NULL restores the old inner join's drop semantics for an
  -- adult-bird cell with no cell_period_year row of its own. Unreachable —
  -- bird_age_bucket and cell_period_year are grouped from the same
  -- encounter_age_classification rows, so every cell in one exists in the other —
  -- but it keeps the rewrite exactly equivalent rather than merely equivalent in
  -- practice.
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
  -- ringing_group_filter but IGNORING from_date/to_date — a period-relative age
  -- can't be answered from a windowed source. Mirrors (and extends, with
  -- max_hatch_year/min_hatch_year) demographics_stats' own lifetime_encounters CTE,
  -- but pre-collapsed to ONE ROW PER (bird, calendar year): each year's own
  -- contribution to the three "to date" values, ready to be accumulated once per
  -- bird by the window pass below. Both hatch-year columns are NOT NULL, so a
  -- non-empty year group always yields a non-null min/bool_or.
  lifetime_encounters_by_year AS (
    SELECT
      e.bird_id,
      EXTRACT(YEAR FROM sess.visit_date)::int AS enc_year,
      COUNT(*) AS year_encounter_count,
      MIN(e.max_hatch_year) AS year_min_max_hatch_year,
      bool_or(e.min_hatch_year <> 0) AS year_was_precisely_aged
    FROM public."Encounters" e
    JOIN public."Sessions" sess ON e.session_id = sess.id
    WHERE (ringing_group_filter IS NULL OR sess.ringing_group_id = ringing_group_filter)
      AND e.bird_id IN (SELECT DISTINCT ab.bird_id FROM adult_birds ab)
    GROUP BY e.bird_id, EXTRACT(YEAR FROM sess.visit_date)::int
  ),
  -- One merged stream per bird: its per-year history rows (event_ord 0) and the
  -- cells that need to read that history (event_ord 1), both keyed on a year.
  -- History rows carry no cell identity; cell rows carry no history payload — the
  -- NULL payload is what makes a cell row invisible to the running aggregates.
  bird_year_events AS (
    SELECT
      ley.bird_id,
      ley.enc_year AS event_year,
      0 AS event_ord,
      NULL::bigint AS species_id,
      NULL::date AS time_period,
      ley.year_encounter_count,
      ley.year_min_max_hatch_year,
      ley.year_was_precisely_aged
    FROM lifetime_encounters_by_year ley
    UNION ALL
    SELECT
      ab.bird_id,
      ab.period_year,
      1,
      ab.species_id,
      ab.time_period,
      NULL::bigint,
      NULL::smallint,
      NULL::boolean
    FROM adult_birds ab
  ),
  -- Per (bird, cell): that bird's history as it stood at the end of the cell's
  -- period_year, read straight off the running window aggregates. Ordering by
  -- (event_year, event_ord) puts a year's history row before any cell row for that
  -- same year, so a cell's frame covers exactly enc_year <= period_year.
  bird_history_to_date AS (
    SELECT
      ev.bird_id,
      ev.species_id,
      ev.time_period,
      ev.event_ord,
      COALESCE(SUM(ev.year_encounter_count) OVER w, 0) AS encounters_to_date,
      ev.event_year - MIN(ev.year_min_max_hatch_year) OVER w AS period_relative_proven_age,
      COALESCE(bool_or(ev.year_was_precisely_aged) OVER w, FALSE) AS was_ever_precisely_aged_to_date
    FROM bird_year_events ev
    WINDOW w AS (PARTITION BY ev.bird_id ORDER BY ev.event_year, ev.event_ord
                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
  )
  SELECT
    h.bird_id,
    h.species_id,
    h.time_period,
    CASE
      WHEN h.period_relative_proven_age IS NULL OR h.period_relative_proven_age <= 0 THEN NULL
      WHEN h.encounters_to_date = 1
        AND NOT h.was_ever_precisely_aged_to_date
        AND h.period_relative_proven_age = 1 THEN 'new_unknown_age'
      WHEN h.period_relative_proven_age = 1 THEN '1'
      WHEN h.period_relative_proven_age = 2 THEN '2'
      ELSE '3_plus'
    END AS returning_age_bucket
  FROM bird_history_to_date h
  -- Only the cell rows are output; the history rows existed solely to feed the
  -- window frames above.
  WHERE h.event_ord = 1;
$function$;

GRANT ALL ON FUNCTION public.stats_bird_returning_age_bucket (
	text,
	date,
	date,
	bigint,
	boolean,
	text,
	smallint,
	smallint
) TO anon;

GRANT ALL ON FUNCTION public.stats_bird_returning_age_bucket (
	text,
	date,
	date,
	bigint,
	boolean,
	text,
	smallint,
	smallint
) TO authenticated;

GRANT ALL ON FUNCTION public.stats_bird_returning_age_bucket (
	text,
	date,
	date,
	bigint,
	boolean,
	text,
	smallint,
	smallint
) TO service_role;
