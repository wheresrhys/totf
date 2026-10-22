SET check_function_bodies = false;
CREATE TYPE public.stats_cache_new_adult_metrics_result AS (species_id bigint, time_period date, new_adult_bird_count bigint);
CREATE FUNCTION public.stats_cache_new_adult_metrics(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text, year_filter smallint DEFAULT NULL::smallint, month_filter smallint DEFAULT NULL::smallint)
 RETURNS SETOF public.stats_cache_new_adult_metrics_result
 LANGUAGE sql
 STABLE
AS $function$
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
GRANT ALL ON FUNCTION public.stats_cache_new_adult_metrics(text, date, date, bigint, boolean, text, smallint, smallint) TO anon;
GRANT ALL ON FUNCTION public.stats_cache_new_adult_metrics(text, date, date, bigint, boolean, text, smallint, smallint) TO authenticated;
GRANT ALL ON FUNCTION public.stats_cache_new_adult_metrics(text, date, date, bigint, boolean, text, smallint, smallint) TO service_role;
