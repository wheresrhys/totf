SET check_function_bodies = false;
CREATE OR REPLACE FUNCTION public.stats_bird_returning_age_bucket(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text)
 RETURNS TABLE(bird_id bigint, species_id bigint, time_period date, returning_age_bucket text)
 LANGUAGE sql
 STABLE
AS $function$
  WITH encounter_age_classification AS (
    SELECT * FROM public.stats_encounter_age_classification(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
  ), bird_age_bucket AS (
    SELECT * FROM public.stats_bird_age_bucket(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period)
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
  -- IS NOT DISTINCT FROM makes the join NULL-safe for the ungrouped case
  -- (species_id / time_period are NULL).
  adult_birds AS (
    SELECT
      bab.bird_id,
      bab.species_id,
      bab.time_period,
      py.period_year
    FROM bird_age_bucket bab
    JOIN cell_period_year py
      ON py.species_id IS NOT DISTINCT FROM bab.species_id
     AND py.time_period IS NOT DISTINCT FROM bab.time_period
    WHERE bab.age_bucket = 'adult'
      AND bab.bird_id IS NOT NULL
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
