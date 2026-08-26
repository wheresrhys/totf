CREATE FUNCTION public.aggregate_stats (
	species_name_filter text DEFAULT NULL::text,
	from_date date DEFAULT NULL::date,
	to_date date DEFAULT NULL::date,
	ringing_group_filter bigint DEFAULT NULL::bigint,
	group_by_species boolean DEFAULT FALSE,
	group_by_time_period text DEFAULT NULL::text
) RETURNS TABLE (
	species_name text,
	time_period date,
	session_count bigint,
	total_effort interval,
	effort_per_session interval,
	effort_per_encounter interval,
	avg_encounters_per_session numeric,
	max_per_session bigint,
	species_count bigint,
	bird_count bigint,
	encounter_count bigint,
	new_bird_count bigint,
	pullus_count bigint,
	juv_count bigint,
	postjuv_count bigint,
	adult_count bigint,
	unknown_age_count bigint,
	new_young_count bigint,
	max_new_per_session bigint,
	max_weight real,
	avg_weight numeric,
	min_weight real,
	median_weight numeric,
	max_wing smallint,
	avg_wing numeric,
	min_wing smallint,
	median_wing numeric
) LANGUAGE plpgsql AS $function$
  BEGIN
  RETURN QUERY
  WITH raw_encounters AS (
    -- Pre-aggregate all encounter data per species
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
      date_trunc('day', sess.visit_date)::DATE AS session_day,
      date_trunc('month', sess.visit_date)::DATE AS session_month,
      date_trunc('year', sess.visit_date)::DATE AS session_year
    FROM public."Species" sp
    JOIN public."Birds" b ON sp.id = b.species_id
    LEFT JOIN public."Encounters" e ON b.id = e.bird_id
    LEFT JOIN public."Sessions" sess ON e.session_id = sess.id
    WHERE (from_date IS NULL OR sess.visit_date >=from_date)
     AND (to_date IS NULL OR sess.visit_date<=to_date)
     AND (species_name_filter IS NULL OR sp.species_name = species_name_filter)
     AND (ringing_group_filter IS NULL OR sess.ringing_group_id = ringing_group_filter)
  ), species_spine AS (
    SELECT
      DISTINCT re.species_id, re.species_name
    FROM raw_encounters as re
    WHERE (species_name_filter IS NULL OR re.species_name = species_name_filter)
    AND group_by_species

    UNION ALL

    SELECT NULL::bigint, NULL::text
    WHERE NOT group_by_species
  ), session_date_range AS (
    SELECT
      MIN(sess.visit_date) AS min_date,
      MAX(sess.visit_date) AS max_date
    FROM public."Sessions" as sess
    WHERE (from_date IS NULL OR sess.visit_date >= from_date)
      AND (to_date IS NULL OR sess.visit_date <= to_date)
  ), period_spine AS (
    SELECT date_trunc('month', d)::date AS time_period
    FROM session_date_range sdr,
    LATERAL generate_series(
      date_trunc('month', COALESCE(sdr.min_date, from_date, CURRENT_DATE))::timestamp,
      date_trunc('month', COALESCE(sdr.max_date, to_date, CURRENT_DATE))::timestamp,
      '1 month'::interval
    ) d
    WHERE group_by_time_period = 'month'
      AND sdr.min_date IS NOT NULL
      AND sdr.max_date IS NOT NULL

    UNION ALL

    SELECT date_trunc('year', d)::date AS time_period
    FROM session_date_range sdr,
    LATERAL generate_series(
      date_trunc('year', COALESCE(sdr.min_date, from_date, CURRENT_DATE))::timestamp,
      date_trunc('year', COALESCE(sdr.max_date, to_date, CURRENT_DATE))::timestamp,
      '1 year'::interval
    ) d
    WHERE group_by_time_period = 'year'
      AND sdr.min_date IS NOT NULL
      AND sdr.max_date IS NOT NULL

    UNION ALL

    -- The 'day' spine is sparse: one row per distinct session date actually present
    -- in the filtered data, unlike the dense month/year spines (which span every
    -- period in the min..max range, including empty ones). A dense day spine would
    -- emit a row for every calendar day in range — thousands of mostly-empty rows —
    -- so we key off the encounter data instead, and days with no session never appear.
    SELECT DISTINCT re.session_day AS time_period
    FROM raw_encounters re
    WHERE group_by_time_period = 'day'
      AND re.session_day IS NOT NULL

    UNION ALL

    SELECT NULL::date
    WHERE group_by_time_period IS NULL OR group_by_time_period NOT IN ('month', 'year', 'day')
  ), spine AS (
    SELECT s.species_id, s.species_name, p.time_period
    FROM species_spine s
    CROSS JOIN period_spine p
  ),
  stats_per_bird_month AS (
    -- Calculate per-bird statistics once
    SELECT
      re.species_id,
      re.bird_id,
      re.session_day,
      re.session_month,
      re.session_year,
      COUNT(*) AS encounter_count,
      MIN(re.visit_date) AS first_visit,
      MAX(re.visit_date) AS last_visit,
      MIN(re.max_hatch_year) AS min_max_hatch_year,
      EXTRACT(EPOCH FROM (MAX(re.visit_date)::timestamp - MIN(re.visit_date)::timestamp)) / 86400.0 AS time_span_days
    FROM raw_encounters re
    WHERE re.encounter_id IS NOT NULL
    GROUP BY re.species_id, re.bird_id, re.session_day, re.session_month, re.session_year
  ),
  -- Per-bird, per-grouping age/new signal flags, aggregated across all of a bird's
  -- encounters in the active group/species/time-period cell. These mirror the
  -- single-encounter age classes defined in TypeScript by getAgeClass()
  -- (app/models/encounter.ts, #527) — keep the two in sync by hand — but applied at
  -- the bird level with two precedence rules that have no single-encounter equivalent:
  -- pullus always wins (a bird with any pullus reading is pullus, even against a
  -- conflicting adult reading, which is assumed erroneous), and otherwise juv wins
  -- over postjuv. Per-encounter indicators:
  --   pullus  = age_code = 1 AND NOT is_juv   (true nestling)
  --   juv     = is_juv AND age_code IN (1, 3) (1J or 3J)
  --   postjuv = age_code = 3 AND NOT is_juv   (bare age 3)
  --   adult   = age_code > 3
  -- bool_or is COALESCEd to FALSE so a bird whose age_code is always NULL (or only 2)
  -- lands in unknown_age_count rather than dropping out of every bucket.
  bird_age_flags AS (
    SELECT
      re.bird_id,
      CASE WHEN group_by_species THEN re.species_id ELSE NULL::bigint END AS species_id,
      CASE
        WHEN group_by_time_period = 'day' THEN re.session_day
        WHEN group_by_time_period = 'month' THEN re.session_month
        WHEN group_by_time_period = 'year' THEN re.session_year
        ELSE NULL::date
      END AS time_period,
      COALESCE(bool_or(re.age_code = 1 AND NOT re.is_juv), FALSE) AS has_pullus,
      COALESCE(bool_or(re.is_juv AND re.age_code IN (1, 3)), FALSE) AS has_juv,
      COALESCE(bool_or(re.age_code = 3 AND NOT re.is_juv), FALSE) AS has_postjuv,
      COALESCE(bool_or(re.age_code > 3), FALSE) AS has_adult,
      COALESCE(bool_or(re.record_type = 'N'), FALSE) AS has_new
    FROM raw_encounters re
    WHERE re.encounter_id IS NOT NULL
    GROUP BY
      re.bird_id,
      CASE WHEN group_by_species THEN re.species_id ELSE NULL::bigint END,
      CASE
        WHEN group_by_time_period = 'day' THEN re.session_day
        WHEN group_by_time_period = 'month' THEN re.session_month
        WHEN group_by_time_period = 'year' THEN re.session_year
        ELSE NULL::date
      END
  ),
  -- Resolve each bird's flags into exactly one mutually-exclusive, exhaustive bucket
  -- via the precedence rules above, so the five bucket counts always sum to the number
  -- of distinct birds (i.e. bird_count) in the cell.
  bird_age_bucket AS (
    SELECT
      baf.species_id,
      baf.time_period,
      baf.has_new,
      CASE
        WHEN baf.has_pullus THEN 'pullus'
        WHEN baf.has_juv AND NOT baf.has_adult THEN 'juv'
        WHEN baf.has_postjuv AND NOT baf.has_juv AND NOT baf.has_adult THEN 'postjuv'
        WHEN baf.has_adult AND NOT baf.has_juv AND NOT baf.has_postjuv THEN 'adult'
        ELSE 'unknown'
      END AS age_bucket
    FROM bird_age_flags baf
  ),
  age_bucket_counts AS (
    SELECT
      bab.species_id,
      bab.time_period,
      COUNT(*) FILTER (WHERE bab.age_bucket = 'pullus') AS pullus_count,
      COUNT(*) FILTER (WHERE bab.age_bucket = 'juv') AS juv_count,
      COUNT(*) FILTER (WHERE bab.age_bucket = 'postjuv') AS postjuv_count,
      COUNT(*) FILTER (WHERE bab.age_bucket = 'adult') AS adult_count,
      COUNT(*) FILTER (WHERE bab.age_bucket = 'unknown') AS unknown_age_count,
      -- New young bird: in a young bucket (pullus/juv/postjuv) AND has any New ('N')
      -- encounter in the cell. Bucket membership and New membership are checked
      -- independently — not required to be the same encounter row.
      COUNT(*) FILTER (
        WHERE bab.age_bucket IN ('pullus', 'juv', 'postjuv') AND bab.has_new
      ) AS new_young_count
    FROM bird_age_bucket bab
    GROUP BY bab.species_id, bab.time_period
  ),
  stats_per_species_period AS (
    -- Aggregate bird-level stats to species level
    SELECT
      CASE WHEN group_by_species THEN spbm.species_id ELSE NULL::bigint END AS species_id,
      CASE
        WHEN group_by_time_period = 'day' THEN spbm.session_day
        WHEN group_by_time_period = 'month' THEN spbm.session_month
        WHEN group_by_time_period = 'year' THEN spbm.session_year
        ELSE NULL::date
      END AS time_period,
      MAX(spbm.encounter_count) AS max_encounter_count,
      MAX(spbm.time_span_days) AS max_time_span_days,
      MAX(EXTRACT(YEAR FROM spbm.last_visit) - spbm.min_max_hatch_year) AS max_proven_age
    FROM stats_per_bird_month spbm
    GROUP BY CASE
      WHEN group_by_species THEN spbm.species_id
      ELSE NULL::bigint
    END, CASE
      WHEN group_by_time_period = 'day' THEN spbm.session_day
      WHEN group_by_time_period = 'month' THEN spbm.session_month
      WHEN group_by_time_period = 'year' THEN spbm.session_year
      ELSE NULL::date
    END
  ),
  session_counts AS (
    -- Count encounters per session per species
    SELECT
      re.species_id,
      re.session_id,
      date_trunc('day', re.visit_date)::DATE AS session_day,
      date_trunc('month', re.visit_date)::DATE AS session_month,
      date_trunc('year', re.visit_date)::DATE AS session_year,
      COUNT(*) AS encounter_count,
      COUNT(CASE WHEN re.record_type = 'N' THEN 1 END) AS new_encounter_count
    FROM raw_encounters re
    WHERE re.session_id IS NOT NULL
      AND re.session_type = 'FULL_GROWN'
    GROUP BY re.species_id, re.session_id, date_trunc('day', re.visit_date)::DATE, date_trunc('month', re.visit_date)::DATE, date_trunc('year', re.visit_date)::DATE
  ),
  aggregated_session_counts AS (
    -- Get max encounters per session per species
    SELECT
      CASE WHEN group_by_species THEN sc.species_id ELSE NULL::bigint END AS species_id,
      CASE
        WHEN group_by_time_period = 'day' THEN sc.session_day
        WHEN group_by_time_period = 'month' THEN sc.session_month
        WHEN group_by_time_period = 'year' THEN sc.session_year
        ELSE NULL::date
      END AS time_period,
      MAX(sc.encounter_count) AS max_per_session,
      MAX(sc.new_encounter_count) AS max_new_per_session,
      AVG(sc.encounter_count) AS avg_encounters_per_session
    FROM session_counts sc
    GROUP BY CASE
      WHEN group_by_species THEN sc.species_id
      ELSE NULL::bigint
    END, CASE
      WHEN group_by_time_period = 'day' THEN sc.session_day
      WHEN group_by_time_period = 'month' THEN sc.session_month
      WHEN group_by_time_period = 'year' THEN sc.session_year
      ELSE NULL::date
    END
  ), session_effort AS (
    SELECT
      re.session_id,
      -- realistically the minimum effort per session is 2 hours
      GREATEST(MAX(re.capture_time) - MIN(re.capture_time), '02:00:00'::interval) AS total_effort
    FROM raw_encounters re
    WHERE re.session_type = 'FULL_GROWN'
    GROUP BY re.session_id
  ), effort_per_period AS (
    SELECT
      CASE
        WHEN group_by_time_period = 'day' THEN re.session_day
        WHEN group_by_time_period = 'month' THEN re.session_month
        WHEN group_by_time_period = 'year' THEN re.session_year
        ELSE NULL::date
      END AS time_period,
      SUM(sess_effort.total_effort) AS total_effort,
      SUM(sess_effort.total_effort) / COUNT(DISTINCT re.session_id) AS effort_per_session
    FROM (
      SELECT DISTINCT re.session_id,
            date_trunc('day', re.visit_date)::DATE AS session_day,
            date_trunc('month', re.visit_date)::DATE AS session_month,
            date_trunc('year', re.visit_date)::DATE AS session_year
      FROM raw_encounters as re
    ) re
    JOIN session_effort sess_effort ON re.session_id = sess_effort.session_id
    GROUP BY
      CASE
        WHEN group_by_time_period = 'day' THEN re.session_day
        WHEN group_by_time_period = 'month' THEN re.session_month
        WHEN group_by_time_period = 'year' THEN re.session_year
        ELSE NULL::date
      END
  )
  SELECT

	  CASE WHEN group_by_species THEN spine.species_name ELSE NULL::text END AS "species_name",
    CASE
      WHEN group_by_time_period = 'day' THEN spine.time_period
      WHEN group_by_time_period = 'month' THEN spine.time_period
      WHEN group_by_time_period = 'year' THEN spine.time_period
    ELSE NULL::date END AS "time_period",

    COALESCE(COUNT(DISTINCT CASE WHEN raw_enc.session_type = 'FULL_GROWN' THEN raw_enc.visit_date END), 0) AS "session_count",
    COALESCE(effort.total_effort, '00:00:00'::interval) AS "total_effort",
    COALESCE(effort.effort_per_session, '00:00:00'::interval) AS "effort_per_session",
    COALESCE(effort.total_effort / NULLIF(COUNT(DISTINCT raw_enc.encounter_id), 0), '00:00:00'::interval) AS "effort_per_encounter",
    COALESCE(agg_sess.avg_encounters_per_session, 0) AS "avg_encounters_per_session",
    COALESCE(agg_sess.max_per_session, 0) AS "max_per_session",

    COALESCE(COUNT(DISTINCT raw_enc.species_id), 0) AS "species_count",
    COALESCE(COUNT(DISTINCT raw_enc.bird_id), 0) AS "bird_count",
    COALESCE(COUNT(DISTINCT raw_enc.encounter_id), 0) AS "encounter_count",

    COALESCE(COUNT(DISTINCT CASE WHEN raw_enc.record_type = 'N' THEN raw_enc.bird_id END), 0) AS "new_bird_count",

    -- Corrected bird-level age buckets (see bird_age_flags / bird_age_bucket above).
    -- pullus + juv + postjuv + adult + unknown_age = bird_count for every row.
    COALESCE(abc.pullus_count, 0) AS "pullus_count",
    COALESCE(abc.juv_count, 0) AS "juv_count",
    COALESCE(abc.postjuv_count, 0) AS "postjuv_count",
    COALESCE(abc.adult_count, 0) AS "adult_count",
    COALESCE(abc.unknown_age_count, 0) AS "unknown_age_count",
    COALESCE(abc.new_young_count, 0) AS "new_young_count",

    COALESCE(agg_sess.max_new_per_session, 0) AS "max_new_per_session",


    MAX(raw_enc.weight) AS "max_weight",
    ROUND(AVG(raw_enc.weight)::numeric, 1) AS "avg_weight",
    MIN(raw_enc.weight) AS "min_weight",
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY raw_enc.weight)::numeric, 1) AS "median_weight",

    MAX(raw_enc.wing_length) AS "max_wing",
    ROUND(AVG(raw_enc.wing_length)::numeric, 1) AS "avg_wing",
    MIN(raw_enc.wing_length) AS "min_wing",
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY raw_enc.wing_length)::numeric, 0) AS "median_wing"

    -- agg_sta.max_encounter_count AS "max_encountered_bird",
    -- ROUND(
    --   100 * COUNT(DISTINCT CASE WHEN bm_stats.encounter_count > 1 THEN raw_enc.bird_id END)::numeric /
    --   NULLIF(COUNT(DISTINCT raw_enc.bird_id), 0)::numeric,
    --   0
    -- ) AS "pct_retrapped",
    -- ROUND(agg_sta.max_time_span_days, 0) AS "max_time_span_days",
    -- agg_sta.max_proven_age AS "max_proven_age"



  FROM spine
  LEFT JOIN raw_encounters raw_enc ON
  (NOT group_by_species OR spine.species_id = raw_enc.species_id)
  AND (
    (group_by_time_period = 'day' AND spine.time_period = raw_enc.session_day)
    OR (group_by_time_period = 'month' AND spine.time_period = raw_enc.session_month)
    OR (group_by_time_period = 'year' AND spine.time_period = raw_enc.session_year)
    OR (group_by_time_period IS NULL OR group_by_time_period NOT IN ('month', 'year', 'day'))
  )
  -- LEFT JOIN stats_per_bird_month bm_stats ON raw_enc.bird_id = bm_stats.bird_id
  LEFT JOIN effort_per_period effort ON
  CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = effort.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = effort.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = effort.time_period
    ELSE true
  END
  LEFT JOIN stats_per_species_period agg_sta ON CASE WHEN group_by_species THEN spine.species_id = agg_sta.species_id ELSE true END
  AND
  CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = agg_sta.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = agg_sta.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = agg_sta.time_period
    ELSE true
  END
  LEFT JOIN aggregated_session_counts agg_sess ON CASE WHEN group_by_species THEN spine.species_id = agg_sess.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = agg_sess.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = agg_sess.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = agg_sess.time_period
    ELSE true
  END
  LEFT JOIN age_bucket_counts abc ON CASE WHEN group_by_species THEN spine.species_id = abc.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period = abc.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period = abc.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = abc.time_period
    ELSE true
  END
  GROUP BY CASE
    WHEN group_by_species THEN spine.species_id
    ELSE NULL::bigint
  END, CASE
    WHEN group_by_species THEN spine.species_name
    ELSE NULL::text
  END,CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period
    ELSE NULL::date
  END, agg_sta.max_encounter_count, agg_sess.max_per_session,
  -- agg_sta.max_proven_age, agg_sta.max_time_span_days,
  agg_sess.max_new_per_session, effort.total_effort, effort.effort_per_session, agg_sess.avg_encounters_per_session,
  abc.pullus_count, abc.juv_count, abc.postjuv_count, abc.adult_count, abc.unknown_age_count, abc.new_young_count
  ORDER BY species_name ASC, time_period ASC;

END;
$function$;

GRANT ALL ON FUNCTION public.aggregate_stats (text, date, date, bigint, boolean, text) TO anon;

GRANT ALL ON FUNCTION public.aggregate_stats (text, date, date, bigint, boolean, text) TO authenticated;

GRANT ALL ON FUNCTION public.aggregate_stats (text, date, date, bigint, boolean, text) TO service_role;
