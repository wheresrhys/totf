SET check_function_bodies = false;
CREATE OR REPLACE FUNCTION public.aggregate_stats(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text)
 RETURNS TABLE(species_name text, time_period date, session_count bigint, total_effort interval, effort_per_session interval, effort_per_encounter interval, avg_encounters_per_session numeric, max_per_session bigint, species_count bigint, bird_count bigint, encounter_count bigint, new_bird_count bigint, "3j_count" bigint, "3_count" bigint, new_3_count bigint, max_new_per_session bigint, max_weight real, avg_weight numeric, min_weight real, median_weight numeric, max_wing smallint, avg_wing numeric, min_wing smallint, median_wing numeric)
 LANGUAGE plpgsql
AS $function$
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
      e.max_hatch_year,
      e.capture_time,
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

    SELECT NULL::date
    WHERE group_by_time_period IS NULL OR group_by_time_period NOT IN ('month', 'year')
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
      re.session_month,
      re.session_year,
      COUNT(*) AS encounter_count,
      MIN(re.visit_date) AS first_visit,
      MAX(re.visit_date) AS last_visit,
      MIN(re.max_hatch_year) AS min_max_hatch_year,
      EXTRACT(EPOCH FROM (MAX(re.visit_date)::timestamp - MIN(re.visit_date)::timestamp)) / 86400.0 AS time_span_days
    FROM raw_encounters re
    WHERE re.encounter_id IS NOT NULL
    GROUP BY re.species_id, re.bird_id, re.session_month, re.session_year
  ),
  stats_per_species_period AS (
    -- Aggregate bird-level stats to species level
    SELECT
      CASE WHEN group_by_species THEN spbm.species_id ELSE NULL::bigint END AS species_id,
      CASE
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
      date_trunc('month', re.visit_date)::DATE AS session_month,
      date_trunc('year', re.visit_date)::DATE AS session_year,
      COUNT(*) AS encounter_count,
      COUNT(CASE WHEN re.record_type = 'N' THEN 1 END) AS new_encounter_count
    FROM raw_encounters re
    WHERE re.session_id IS NOT NULL
    GROUP BY re.species_id, re.session_id, date_trunc('month', re.visit_date)::DATE, date_trunc('year', re.visit_date)::DATE
  ),
  aggregated_session_counts AS (
    -- Get max encounters per session per species
    SELECT
      CASE WHEN group_by_species THEN sc.species_id ELSE NULL::bigint END AS species_id,
      CASE
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
    GROUP BY re.session_id
  ), effort_per_period AS (
    SELECT
      CASE
        WHEN group_by_time_period = 'month' THEN re.session_month
        WHEN group_by_time_period = 'year' THEN re.session_year
        ELSE NULL::date
      END AS time_period,
      SUM(sess_effort.total_effort) AS total_effort,
      SUM(sess_effort.total_effort) / COUNT(DISTINCT re.session_id) AS effort_per_session
    FROM (
      SELECT DISTINCT re.session_id,
            date_trunc('month', re.visit_date)::DATE AS session_month,
            date_trunc('year', re.visit_date)::DATE AS session_year
      FROM raw_encounters as re
    ) re
    JOIN session_effort sess_effort ON re.session_id = sess_effort.session_id
    GROUP BY
      CASE
        WHEN group_by_time_period = 'month' THEN re.session_month
        WHEN group_by_time_period = 'year' THEN re.session_year
        ELSE NULL::date
      END
  )
  SELECT

	  CASE WHEN group_by_species THEN spine.species_name ELSE NULL::text END AS "species_name",
    CASE
      WHEN group_by_time_period = 'month' THEN spine.time_period
      WHEN group_by_time_period = 'year' THEN spine.time_period
    ELSE NULL::date END AS "time_period",

    COALESCE(COUNT(DISTINCT raw_enc.visit_date), 0) AS "session_count",
    COALESCE(effort.total_effort, '00:00:00'::interval) AS "total_effort",
    COALESCE(effort.effort_per_session, '00:00:00'::interval) AS "effort_per_session",
    COALESCE(effort.total_effort / NULLIF(COUNT(DISTINCT raw_enc.encounter_id), 0), '00:00:00'::interval) AS "effort_per_encounter",
    COALESCE(agg_sess.avg_encounters_per_session, 0) AS "avg_encounters_per_session",
    COALESCE(agg_sess.max_per_session, 0) AS "max_per_session",

    COALESCE(COUNT(DISTINCT raw_enc.species_id), 0) AS "species_count",
    COALESCE(COUNT(DISTINCT raw_enc.bird_id), 0) AS "bird_count",
    COALESCE(COUNT(DISTINCT raw_enc.encounter_id), 0) AS "encounter_count",

    COALESCE(COUNT(DISTINCT CASE WHEN raw_enc.record_type = 'N' THEN raw_enc.bird_id END), 0) AS "new_bird_count",
    COALESCE(COUNT(DISTINCT CASE WHEN (raw_enc.is_juv OR raw_enc.age_code = 1) THEN raw_enc.bird_id END), 0) AS "3j_count",
    COALESCE(COUNT(DISTINCT CASE WHEN (raw_enc.age_code = 3 AND NOT raw_enc.is_juv) THEN raw_enc.bird_id END), 0) AS "3_count",
    COALESCE(COUNT(DISTINCT CASE WHEN raw_enc.record_type = 'N' AND raw_enc.age_code IN (1, 3) THEN raw_enc.bird_id END), 0) AS "new_3_count",

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
    (group_by_time_period = 'month' AND spine.time_period = raw_enc.session_month)
    OR (group_by_time_period = 'year' AND spine.time_period = raw_enc.session_year)
    OR (group_by_time_period IS NULL OR group_by_time_period NOT IN ('month', 'year'))
  )
  -- LEFT JOIN stats_per_bird_month bm_stats ON raw_enc.bird_id = bm_stats.bird_id
  LEFT JOIN effort_per_period effort ON
  CASE
    WHEN group_by_time_period = 'month' THEN spine.time_period = effort.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = effort.time_period
    ELSE true
  END
  LEFT JOIN stats_per_species_period agg_sta ON CASE WHEN group_by_species THEN spine.species_id = agg_sta.species_id ELSE true END
  AND
  CASE
    WHEN group_by_time_period = 'month' THEN spine.time_period = agg_sta.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = agg_sta.time_period
    ELSE true
  END
  LEFT JOIN aggregated_session_counts agg_sess ON CASE WHEN group_by_species THEN spine.species_id = agg_sess.species_id ELSE true END
  AND CASE
    WHEN group_by_time_period = 'month' THEN spine.time_period = agg_sess.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period = agg_sess.time_period
    ELSE true
  END
  GROUP BY CASE
    WHEN group_by_species THEN spine.species_id
    ELSE NULL::bigint
  END, CASE
    WHEN group_by_species THEN spine.species_name
    ELSE NULL::text
  END,CASE
    WHEN group_by_time_period = 'month' THEN spine.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period
    ELSE NULL::date
  END, agg_sta.max_encounter_count, agg_sess.max_per_session,
  -- agg_sta.max_proven_age, agg_sta.max_time_span_days,
  agg_sess.max_new_per_session, effort.total_effort, effort.effort_per_session, agg_sess.avg_encounters_per_session
  ORDER BY species_name ASC, time_period ASC;

END;
$function$;
CREATE OR REPLACE FUNCTION public.find_discrepencies(ringing_group_filter bigint DEFAULT NULL::bigint)
 RETURNS TABLE(bird_id bigint, ring_no text, species_name text, discrepency_type text, last_encounter_date date)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  RETURN QUERY


WITH
	hatch_ages AS (
		SELECT
			b.id AS bird_id,
			b.ring_no AS ring_no,
			s.visit_date,
			e.age_code,
			sp.species_name,
			EXTRACT(
				YEAR
				FROM
					s.visit_date
			)::INTEGER AS visit_year,
			CASE
				WHEN e.age_code % 2 = 0 THEN EXTRACT(
					YEAR
					FROM
						s.visit_date
				)::INTEGER - (e.age_code / 2 - 1)
				WHEN e.age_code % 2 = 1
				AND e.age_code > 1 THEN EXTRACT(
					YEAR
					FROM
						s.visit_date
				)::INTEGER - ((e.age_code - 3) / 2)
				ELSE EXTRACT(
					YEAR
					FROM
						s.visit_date
				)::INTEGER
			END AS max_hatch_year,
			CASE
				WHEN e.age_code % 2 = 0 THEN 0
				WHEN e.age_code % 2 = 1
				AND e.age_code > 1 THEN EXTRACT(
					YEAR
					FROM
						s.visit_date
				)::INTEGER - ((e.age_code - 3) / 2)
				ELSE EXTRACT(
					YEAR
					FROM
						s.visit_date
				)::INTEGER
			END AS min_hatch_year
		FROM
			"Encounters" e
			JOIN "Birds" b ON e.bird_id = b.id
			JOIN "Sessions" s ON s.id = e.session_id
			JOIN "Species" sp ON sp.id = b.species_id
		WHERE
			(ringing_group_filter IS NULL OR s.ringing_group_id = ringing_group_filter)
	),
	hatch_year_differences AS (
		SELECT
			MAX(hatch_ages.min_hatch_year) AS max_min_year,
			MIN(hatch_ages.max_hatch_year) AS min_max_year,
			MAX(hatch_ages.visit_date) AS last_encounter_date,
			hatch_ages.bird_id as bird_id,
			hatch_ages.ring_no as ring_no,
			hatch_ages.species_name as species_name
		FROM
			hatch_ages
		GROUP BY
			hatch_ages.bird_id,
			hatch_ages.ring_no,
			hatch_ages.species_name
	),
	sex_counts AS (
		SELECT
			b.id AS bird_id,
			b.ring_no AS ring_no,
			s.species_name,
			count(DISTINCT e.sex) AS sex_count,
			MAX(sess.visit_date) AS last_encounter_date
		FROM
			"Birds" b
			JOIN "Encounters" e ON e.bird_id = b.id
			JOIN "Sessions" sess ON sess.id = e.session_id
			JOIN "Species" s ON s.id = b.species_id
		WHERE
			NOT e.sex ILIKE 'u'
			AND (ringing_group_filter IS NULL OR sess.ringing_group_id = ringing_group_filter)
		GROUP BY
			b.id,
			b.ring_no,
			s.species_name
	),wing_lengths as (SELECT
  b.id as bird_id,
  b.ring_no as ring_no,
  s.species_name,
  MAX(e.wing_length) as max_wing_length,
  MIN(e.wing_length) as min_wing_length,
  MAX(sess.visit_date) as last_encounter_date
from "Birds" b
JOIN "Encounters" e on e.bird_id = b.id
JOIN "Sessions" sess on sess.id = e.session_id
JOIN "Species" s on s.id = b.species_id
WHERE e.wing_length IS NOT NULL
AND (ringing_group_filter IS NULL OR sess.ringing_group_id = ringing_group_filter)
GROUP by b.id, b.ring_no, s.species_name)

SELECT
	hatch_year_differences.bird_id as bird_id,
	hatch_year_differences.ring_no as ring_no,
	hatch_year_differences.species_name as species_name,
	'age' as discrepency_type,
	hatch_year_differences.last_encounter_date as last_encounter_date
FROM
	hatch_year_differences
WHERE
	min_max_year < max_min_year

UNION ALL
SELECT
	sex_counts.bird_id as bird_id,
	sex_counts.ring_no as ring_no,
	sex_counts.species_name as species_name,
  'sex' as discrepency_type,
	sex_counts.last_encounter_date as last_encounter_date
FROM
	sex_counts
WHERE
	sex_count > 1
UNION ALL
SELECT
  wing_lengths.bird_id as bird_id,
  wing_lengths.ring_no as ring_no,
  wing_lengths.species_name as species_name,
  'wing_length' as discrepency_type,
  wing_lengths.last_encounter_date as last_encounter_date
FROM wing_lengths
WHERE max_wing_length - min_wing_length >= 5;




END;
$function$;
CREATE OR REPLACE FUNCTION public.most_caught_birds(result_limit integer DEFAULT NULL::integer, max_per_species integer DEFAULT NULL::integer, significance_threshold integer DEFAULT 3, species_filter text DEFAULT NULL::text, year_filter integer DEFAULT NULL::integer, ringing_group_filter bigint DEFAULT NULL::bigint)
 RETURNS TABLE(species_name text, ring_no text, encounter_count bigint, encounter_dates date[])
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  RETURN QUERY
	WITH bird_encounter_counts AS (
  SELECT
    sp.species_name as species_name,
    b.ring_no as ring_no,
    count(en.*) as encounter_count,
		array_agg(sess.visit_date order by sess.visit_date ASC) as encounter_dates
  FROM public."Encounters" en
    LEFT JOIN public."Birds" b on  b.id=en.bird_id
    LEFT JOIN public."Species" sp on sp.id=b.species_id
    LEFT JOIN public."Sessions" sess on sess.id=en.session_id
  WHERE
    (species_filter IS NULL OR sp.species_name ilike species_filter) AND
    (year_filter IS NULL OR EXTRACT(YEAR FROM sess.visit_date) = year_filter)
		AND (ringing_group_filter IS NULL OR sess.ringing_group_id = ringing_group_filter)
  GROUP BY
    sp.species_name,
    b.ring_no
  ), significant_birds AS (
    SELECT * FROM bird_encounter_counts as bec
    WHERE bec.encounter_count >= significance_threshold
  ), top_per_species AS (
		SELECT *
		FROM (
			SELECT *,
				ROW_NUMBER() OVER (PARTITION BY sb.species_name ORDER BY sb.encounter_count DESC) AS rn
			FROM significant_birds as sb
		) sub
		WHERE max_per_species IS NULL OR rn <= max_per_species
	)
	SELECT tps.species_name, tps.ring_no, tps.encounter_count, tps.encounter_dates FROM top_per_species as tps
	ORDER BY tps.encounter_count DESC, tps.ring_no DESC
	LIMIT result_limit;
END;
$function$;
CREATE OR REPLACE FUNCTION public.notable_retraps(result_limit integer DEFAULT NULL::integer, result_limit_per_species integer DEFAULT NULL::integer, min_proven_age integer DEFAULT NULL::integer, min_encounter_count integer DEFAULT NULL::integer, species_filter text DEFAULT NULL::text, year_filter integer DEFAULT NULL::integer, ringing_group_filter bigint DEFAULT NULL::bigint)
 RETURNS TABLE(species_name text, ring_no text, encounter_count bigint, encounter_dates date[], proven_age smallint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  RETURN QUERY
	WITH bird_encounter_counts AS (
  SELECT
    sp.species_name as species_name,
    b.ring_no as ring_no,
    b.proven_age as proven_age,
    count(en.*) as encounter_count,
		array_agg(sess.visit_date order by sess.visit_date ASC) as encounter_dates
  FROM public."Encounters" en
    LEFT JOIN public."Birds" b on  b.id=en.bird_id
    LEFT JOIN public."Species" sp on sp.id=b.species_id
    LEFT JOIN public."Sessions" sess on sess.id=en.session_id
  WHERE
    (species_filter IS NULL OR sp.species_name ilike species_filter) AND
    (year_filter IS NULL OR EXTRACT(YEAR FROM sess.visit_date) = year_filter)
		AND (ringing_group_filter IS NULL OR sess.ringing_group_id = ringing_group_filter)
  GROUP BY
    sp.species_name,
    b.ring_no,
    b.proven_age
  ), significant_birds AS (
    SELECT * FROM bird_encounter_counts as bec

  ), top_per_species AS (
		SELECT *
		FROM (
			SELECT *,
				ROW_NUMBER() OVER (PARTITION BY sb.species_name ORDER BY sb.encounter_count DESC) AS rn
			FROM significant_birds as sb
		) sub
		WHERE result_limit_per_species IS NULL OR rn <= result_limit_per_species
	)
	SELECT tps.species_name, tps.ring_no, tps.encounter_count, tps.encounter_dates, tps.proven_age FROM top_per_species as tps
  WHERE
  (min_proven_age IS NULL AND min_encounter_count IS NULL)
  OR
  tps.encounter_count >= min_encounter_count
  OR
  tps.proven_age >= min_proven_age

	ORDER BY tps.encounter_count DESC, tps.ring_no DESC
	LIMIT result_limit;
END;
$function$;
CREATE OR REPLACE FUNCTION public.ring_sequence_controls(ringing_group_filter bigint DEFAULT NULL::bigint)
 RETURNS TABLE(ring_no text, species_name text, first_date date)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    b.ring_no,
    sp.species_name   AS species_name,
    MIN(s.visit_date) AS first_date
  FROM "Birds" b
  JOIN "Encounters" e  ON e.bird_id = b.id
  JOIN "Sessions"   s  ON s.id = e.session_id
  JOIN "Species"    sp ON sp.id = b.species_id
  WHERE (ringing_group_filter IS NULL OR s.ringing_group_id = ringing_group_filter)
  GROUP BY b.ring_no, sp.species_name
  HAVING COUNT(*) = COUNT(*) FILTER (WHERE e.record_type = 'S')
  ORDER BY b.ring_no;
END;
$function$;
CREATE OR REPLACE FUNCTION public.ring_sequence_detail(sequence_prefix_filter text, ring_length_filter integer, ringing_group_filter bigint DEFAULT NULL::bigint)
 RETURNS TABLE(ring_no text, species_name text, ringed_date date)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    b.ring_no,
    sp.species_name AS species_name,
    s.visit_date    AS ringed_date
  FROM "Birds" b
  JOIN "Species"    sp ON sp.id = b.species_id
  JOIN "Encounters" e  ON e.bird_id = b.id
  JOIN "Sessions"   s  ON s.id = e.session_id
  WHERE e.record_type = 'N'
    AND LEFT(b.ring_no, 3) = sequence_prefix_filter
    AND LENGTH(b.ring_no) = ring_length_filter
    AND (ringing_group_filter IS NULL OR s.ringing_group_id = ringing_group_filter)
  ORDER BY b.ring_no;
END;
$function$;
CREATE OR REPLACE FUNCTION public.ring_sequence_summaries(ringing_group_filter bigint DEFAULT NULL::bigint)
 RETURNS TABLE(sequence_prefix text, ring_length integer, ring_count bigint, earliest_date date, latest_date date)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    LEFT(b.ring_no, 3)             AS sequence_prefix,
    LENGTH(b.ring_no)              AS ring_length,
    COUNT(DISTINCT b.ring_no)      AS ring_count,
    MIN(s.visit_date)              AS earliest_date,
    MAX(s.visit_date)              AS latest_date
  FROM "Birds" b
  JOIN "Encounters" e ON e.bird_id = b.id
  JOIN "Sessions"   s ON s.id = e.session_id
  WHERE e.record_type = 'N'
    AND (ringing_group_filter IS NULL OR s.ringing_group_id = ringing_group_filter)
  GROUP BY LEFT(b.ring_no, 3), LENGTH(b.ring_no)
  ORDER BY MAX(s.visit_date) DESC, MIN(s.visit_date) DESC, LEFT(b.ring_no, 3) ASC;
END;
$function$;
