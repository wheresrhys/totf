SET check_function_bodies = false;
DROP EXTENSION pg_net;
COMMENT ON SCHEMA public IS NULL;
REVOKE USAGE ON SCHEMA public FROM PUBLIC;
CREATE EXTENSION fuzzystrmatch WITH SCHEMA public;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;
CREATE TYPE public.top_metrics_filter_params AS (month_filter integer, year_filter integer, exact_months_filter text[], months_filter integer[], species_filter text, ringing_group_filter bigint);
CREATE SEQUENCE public."Birds_id_seq";
CREATE SEQUENCE public."Encounters_id_seq";
CREATE SEQUENCE public."Locations_id_seq";
CREATE SEQUENCE public."RingingGroups_id_seq";
CREATE SEQUENCE public."Sessions_id_seq";
CREATE SEQUENCE public."Species_id_seq";
CREATE FUNCTION public.add_bird_ringing_group_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE "public"."Birds"
  SET ringing_group_ids = CASE
    WHEN ringing_group_ids IS NULL THEN
      ARRAY[NEW.ringing_group_id]
    WHEN NOT (NEW.ringing_group_id = ANY(ringing_group_ids)) THEN
      array_append(ringing_group_ids, NEW.ringing_group_id)
    ELSE ringing_group_ids
  END
  WHERE id = NEW.bird_id;
  RETURN NEW;
END;
$function$;
CREATE FUNCTION public.aggregate_stats(species_name_filter text DEFAULT NULL::text, from_date date DEFAULT NULL::date, to_date date DEFAULT NULL::date, ringing_group_filter bigint DEFAULT NULL::bigint, group_by_species boolean DEFAULT false, group_by_time_period text DEFAULT NULL::text)
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
     AND (ringing_group_filter IS NULL OR e.ringing_group_id = ringing_group_filter)
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
GRANT ALL ON FUNCTION public.aggregate_stats(text, date, date, bigint, boolean, text) TO anon;
GRANT ALL ON FUNCTION public.aggregate_stats(text, date, date, bigint, boolean, text) TO authenticated;
GRANT ALL ON FUNCTION public.aggregate_stats(text, date, date, bigint, boolean, text) TO service_role;
CREATE FUNCTION public.find_discrepencies(ringing_group_filter bigint DEFAULT NULL::bigint)
 RETURNS TABLE(bird_id bigint, ring_no text, species_name text, discrepency_type text)
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
			(ringing_group_filter IS NULL OR e.ringing_group_id = ringing_group_filter)
	),
	hatch_year_differences AS (
		SELECT
			MAX(hatch_ages.min_hatch_year) AS max_min_year,
			MIN(hatch_ages.max_hatch_year) AS min_max_year,
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
			count(DISTINCT e.sex) AS sex_count
		FROM
			"Birds" b
			JOIN "Encounters" e ON e.bird_id = b.id
			JOIN "Species" s ON s.id = b.species_id
		WHERE
			NOT e.sex ILIKE 'u'
			AND (ringing_group_filter IS NULL OR e.ringing_group_id = ringing_group_filter)
		GROUP BY
			b.id,
			b.ring_no,
			s.species_name
	),wing_lengths as (SELECT
  b.id as bird_id,
  b.ring_no as ring_no,
  s.species_name,
  MAX(e.wing_length) as max_wing_length,
  MIN(e.wing_length) as min_wing_length
from "Birds" b
JOIN "Encounters" e on e.bird_id = b.id
JOIN "Species" s on s.id = b.species_id
WHERE e.wing_length IS NOT NULL
AND (ringing_group_filter IS NULL OR e.ringing_group_id = ringing_group_filter)
GROUP by b.id, b.ring_no, s.species_name)

SELECT
	hatch_year_differences.bird_id as bird_id,
	hatch_year_differences.ring_no as ring_no,
	hatch_year_differences.species_name as species_name,
	'age' as discrepency_type
FROM
	hatch_year_differences
WHERE
	min_max_year < max_min_year

UNION ALL
SELECT
	sex_counts.bird_id as bird_id,
	sex_counts.ring_no as ring_no,
	sex_counts.species_name as species_name,
  'sex' as discrepency_type
FROM
	sex_counts
WHERE
	sex_count > 1
UNION ALL
SELECT
  wing_lengths.bird_id as bird_id,
  wing_lengths.ring_no as ring_no,
  wing_lengths.species_name as species_name,
  'wing_length' as discrepency_type
FROM wing_lengths
WHERE max_wing_length - min_wing_length >= 5;




END;
$function$;
GRANT ALL ON FUNCTION public.find_discrepencies(bigint) TO anon;
GRANT ALL ON FUNCTION public.find_discrepencies(bigint) TO authenticated;
GRANT ALL ON FUNCTION public.find_discrepencies(bigint) TO service_role;
CREATE FUNCTION public.fuzzy_search_rings(q text)
 RETURNS TABLE(ring_no text, closeness_score numeric, species_name text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  RETURN QUERY
WITH fuzzy_matches as (SELECT
  b.species_id,
  b.ring_no,
  levenshtein(b.ring_no ,q) as levenshtein
from "Birds" b
)
SELECT fm.ring_no,
        (
          fm.levenshtein::float - (
            0.5*(
              length(fm.ring_no) - length(q)
            )
          )
        )::numeric as closeness_score,
        sp.species_name
FROM fuzzy_matches fm
JOIN "Species" sp on fm.species_id = sp.id
WHERE fm.levenshtein < 3 OR fm.ring_no like CONCAT('%', q, '%')
ORDER BY closeness_score ASC;
END;
$function$;
CREATE FUNCTION public.metrics_by_period_and_species(temporal_unit text, metric_name text, filters public.top_metrics_filter_params DEFAULT NULL::public.top_metrics_filter_params)
 RETURNS TABLE(species_name text, visit_date date, metric_value bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    sp.species_name as species_name,
    date_trunc(temporal_unit, sess.visit_date)::DATE AS visit_date,
    CASE
      WHEN metric_name = 'encounters' THEN count(e.*)
      WHEN metric_name = 'individuals' THEN count(DISTINCT b.ring_no)
      ELSE 1
    END::BIGINT AS metric_value
  FROM
    public."Birds" b
    LEFT JOIN public."Encounters" e ON b.id = e.bird_id
    LEFT JOIN public."Sessions" sess ON e.session_id = sess.id
    LEFT JOIN public."Species" sp ON b.species_id = sp.id
  WHERE
    sess.visit_date IS NOT NULL
    AND (filters IS NULL OR filters.month_filter IS NULL OR EXTRACT(MONTH FROM sess.visit_date) = filters.month_filter)
    AND (filters IS NULL OR filters.year_filter IS NULL OR EXTRACT(YEAR FROM sess.visit_date) = filters.year_filter)
    AND (filters IS NULL OR filters.exact_months_filter IS NULL OR TO_CHAR(sess.visit_date, 'YYYY-MM') = ANY(filters.exact_months_filter))
    AND (filters IS NULL OR filters.months_filter IS NULL OR EXTRACT(MONTH FROM sess.visit_date) = ANY(filters.months_filter))
    AND (filters IS NULL OR filters.species_filter IS NULL OR sp.species_name = filters.species_filter)
    AND (filters IS NULL OR filters.ringing_group_filter IS NULL OR (e.ringing_group_id = filters.ringing_group_filter AND sess.ringing_group_id = filters.ringing_group_filter))
  GROUP BY
    date_trunc(temporal_unit, sess.visit_date), sp.species_name;
END;
$function$;
GRANT ALL ON FUNCTION public.metrics_by_period_and_species(text, text, public.top_metrics_filter_params) TO anon;
GRANT ALL ON FUNCTION public.metrics_by_period_and_species(text, text, public.top_metrics_filter_params) TO authenticated;
GRANT ALL ON FUNCTION public.metrics_by_period_and_species(text, text, public.top_metrics_filter_params) TO service_role;
CREATE FUNCTION public.most_caught_birds(result_limit integer DEFAULT NULL::integer, max_per_species integer DEFAULT NULL::integer, significance_threshold integer DEFAULT 3, species_filter text DEFAULT NULL::text, year_filter integer DEFAULT NULL::integer, ringing_group_filter bigint DEFAULT NULL::bigint)
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
		AND (ringing_group_filter IS NULL OR en.ringing_group_id = ringing_group_filter)
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
GRANT ALL ON FUNCTION public.most_caught_birds(integer, integer, integer, text, integer, bigint) TO anon;
GRANT ALL ON FUNCTION public.most_caught_birds(integer, integer, integer, text, integer, bigint) TO authenticated;
GRANT ALL ON FUNCTION public.most_caught_birds(integer, integer, integer, text, integer, bigint) TO service_role;
CREATE FUNCTION public.notable_retraps(result_limit integer DEFAULT NULL::integer, result_limit_per_species integer DEFAULT NULL::integer, min_proven_age integer DEFAULT NULL::integer, min_encounter_count integer DEFAULT NULL::integer, species_filter text DEFAULT NULL::text, year_filter integer DEFAULT NULL::integer, ringing_group_filter bigint DEFAULT NULL::bigint)
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
		AND (ringing_group_filter IS NULL OR en.ringing_group_id = ringing_group_filter)
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
GRANT ALL ON FUNCTION public.notable_retraps(integer, integer, integer, integer, text, integer, bigint) TO anon;
GRANT ALL ON FUNCTION public.notable_retraps(integer, integer, integer, integer, text, integer, bigint) TO authenticated;
GRANT ALL ON FUNCTION public.notable_retraps(integer, integer, integer, integer, text, integer, bigint) TO service_role;
CREATE FUNCTION public.remove_bird_ringing_group_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE "public"."Birds"
  SET ringing_group_ids = COALESCE(array_remove(ringing_group_ids, OLD.ringing_group_id), '{}')
  WHERE id = OLD.bird_id
    AND NOT EXISTS (
      SELECT 1 FROM "public"."Encounters" e
      WHERE e.bird_id = OLD.bird_id
        AND e.ringing_group_id = OLD.ringing_group_id
        AND e.id != OLD.id
      );
  RETURN OLD;
END;
$function$;
CREATE FUNCTION public.set_encounter_generated_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  SELECT
    l."ringing_group_id",
    CASE
				WHEN NEW.age_code % 2 = 0 THEN EXTRACT(
					YEAR
					FROM
						s.visit_date
				)::INTEGER - (NEW.age_code / 2 - 1)
				WHEN NEW.age_code % 2 = 1
				AND NEW.age_code > 1 THEN EXTRACT(
					YEAR
					FROM
						s.visit_date
				)::INTEGER - ((NEW.age_code - 3) / 2)
				ELSE EXTRACT(
					YEAR
					FROM
						s.visit_date
				)::INTEGER
			END AS max_hatch_year,
			CASE
				WHEN NEW.age_code % 2 = 0 THEN 0
				WHEN NEW.age_code % 2 = 1
				AND NEW.age_code > 1 THEN EXTRACT(
					YEAR
					FROM
						s.visit_date
				)::INTEGER - ((NEW.age_code - 3) / 2)
				ELSE EXTRACT(
					YEAR
					FROM
						s.visit_date
				)::INTEGER
			END AS min_hatch_year
  INTO NEW."ringing_group_id", NEW."max_hatch_year", NEW."min_hatch_year"
  FROM "public"."Sessions" s
  JOIN "public"."Locations" l ON l."id" = s."location_id"
  WHERE s."id" = NEW."session_id";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session % not found or has no location', NEW."session_id";
  END IF;

  -- Update Birds.last_encountered_timestamp when encounter timestamp is newer
  UPDATE "public"."Birds" b
  SET last_encountered_timestamp = (s.visit_date + COALESCE(NEW.capture_time, '00:00:00'::time))
  FROM "public"."Sessions" s
  WHERE b.id = NEW.bird_id
    AND s.id = NEW.session_id
    AND (b.last_encountered_timestamp IS NULL OR (s.visit_date + COALESCE(NEW.capture_time, '00:00:00'::time)) > b.last_encountered_timestamp);

  RETURN NEW;
END;
$function$;
CREATE FUNCTION public.set_session_generated_fields()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  SELECT
    l."ringing_group_id"
  INTO NEW."ringing_group_id"
  FROM "public"."Locations" l
  WHERE l."id" = NEW."location_id";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Location % not found', NEW."location_id";
  END IF;
  RETURN NEW;
END;
$function$;
CREATE FUNCTION public.top_metrics_by_period(temporal_unit text, metric_name text, result_limit integer, filters public.top_metrics_filter_params DEFAULT NULL::public.top_metrics_filter_params)
 RETURNS TABLE(visit_date date, metric_value bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  RETURN QUERY
  WITH by_period_and_species AS (
    SELECT * from metrics_by_period_and_species(
      temporal_unit=>temporal_unit,
      metric_name=>metric_name,
      filters=>filters
    )
  )
  SELECT
    "by_period_and_species"."visit_date",
    SUM("by_period_and_species"."metric_value")::bigint AS metric_value
  FROM
    by_period_and_species
  GROUP BY
    "by_period_and_species"."visit_date"
  ORDER BY
    SUM("by_period_and_species"."metric_value") DESC,
		"by_period_and_species"."visit_date" DESC
  LIMIT result_limit;
END;
$function$;
GRANT ALL ON FUNCTION public.top_metrics_by_period(text, text, integer, public.top_metrics_filter_params) TO anon;
GRANT ALL ON FUNCTION public.top_metrics_by_period(text, text, integer, public.top_metrics_filter_params) TO authenticated;
GRANT ALL ON FUNCTION public.top_metrics_by_period(text, text, integer, public.top_metrics_filter_params) TO service_role;
CREATE FUNCTION public.top_metrics_by_species_and_period(temporal_unit text, metric_name text, result_limit integer, filters public.top_metrics_filter_params DEFAULT NULL::public.top_metrics_filter_params)
 RETURNS TABLE(species_name text, visit_date date, metric_value bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  RETURN QUERY
  WITH by_period_and_species AS (
    SELECT * from metrics_by_period_and_species(
      temporal_unit=>temporal_unit,
      metric_name=>metric_name,
      filters=>filters
    )
  )
  SELECT
    "by_period_and_species"."species_name",
    "by_period_and_species"."visit_date",
    "by_period_and_species"."metric_value"
  FROM
    by_period_and_species
  ORDER BY
    "by_period_and_species"."metric_value" DESC,
    "by_period_and_species"."visit_date" DESC,
    "by_period_and_species"."species_name" DESC
  LIMIT result_limit;
END;
$function$;
GRANT ALL ON FUNCTION public.top_metrics_by_species_and_period(text, text, integer, public.top_metrics_filter_params) TO anon;
GRANT ALL ON FUNCTION public.top_metrics_by_species_and_period(text, text, integer, public.top_metrics_filter_params) TO authenticated;
GRANT ALL ON FUNCTION public.top_metrics_by_species_and_period(text, text, integer, public.top_metrics_filter_params) TO service_role;
CREATE FUNCTION public.trg_encounters_refresh_bird_proven_age()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bird_id bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_bird_id := OLD.bird_id;
  ELSE
    v_bird_id := NEW.bird_id;
  END IF;

  UPDATE "public"."Birds" b
  SET proven_age = (
    SELECT
      EXTRACT(YEAR FROM MAX(s.visit_date))::integer - MIN(e.max_hatch_year)
    FROM "public"."Encounters" e
    JOIN "public"."Sessions" s ON s.id = e.session_id
    WHERE e.bird_id = v_bird_id
  )
  WHERE b.id = v_bird_id;

  IF TG_OP = 'UPDATE'
  AND OLD.bird_id IS DISTINCT FROM NEW.bird_id THEN
    UPDATE "public"."Birds" b
    SET proven_age = (
      SELECT
        EXTRACT(YEAR FROM MAX(s.visit_date))::integer - MIN(e.max_hatch_year)
      FROM "public"."Encounters" e
      JOIN "public"."Sessions" s ON s.id = e.session_id
      WHERE e.bird_id = OLD.bird_id
    )
    WHERE b.id = OLD.bird_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
CREATE FUNCTION public.update_bird_ringing_group_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Only act when ringing_group_id actually changed
  IF OLD.ringing_group_id IS DISTINCT FROM NEW.ringing_group_id THEN
    -- Remove old group id if no other encounters for this bird in that group
    IF OLD.ringing_group_id IS NOT NULL THEN
      UPDATE "public"."Birds"
      SET ringing_group_ids = COALESCE(array_remove(ringing_group_ids, OLD.ringing_group_id), '{}')
      WHERE id = NEW.bird_id
        AND NOT EXISTS (
          SELECT 1 FROM "public"."Encounters" e
          WHERE e.bird_id = OLD.bird_id
            AND e.ringing_group_id = OLD.ringing_group_id
            AND e.id != OLD.id
        );
    END IF;

    -- Add new group id if not already present
    IF NEW.ringing_group_id IS NOT NULL THEN
      UPDATE "public"."Birds"
      SET ringing_group_ids = CASE
        WHEN ringing_group_ids IS NULL THEN ARRAY[NEW.ringing_group_id]
        WHEN NOT (NEW.ringing_group_id = ANY(ringing_group_ids)) THEN array_append(ringing_group_ids, NEW.ringing_group_id)
        ELSE ringing_group_ids
      END
      WHERE id = NEW.bird_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
CREATE TABLE public."Birds" (ring_no text NOT NULL, id bigint DEFAULT nextval('public."Birds_id_seq"'::regclass) NOT NULL, species_id bigint NOT NULL, last_encountered_timestamp timestamp without time zone DEFAULT '0001-01-01 00:00:00'::timestamp without time zone NOT NULL, ringing_group_ids bigint[] DEFAULT '{}'::bigint[] NOT NULL, proven_age smallint DEFAULT 0 NOT NULL);
ALTER SEQUENCE public."Birds_id_seq" OWNED BY public."Birds".id;
GRANT ALL ON SEQUENCE public."Birds_id_seq" TO anon;
GRANT ALL ON SEQUENCE public."Birds_id_seq" TO authenticated;
GRANT ALL ON SEQUENCE public."Birds_id_seq" TO service_role;
COMMENT ON TABLE public."Birds" IS '@graphql({"aggregate": {"enabled": true}})';
ALTER TABLE public."Birds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Birds" ADD CONSTRAINT "Birds_pkey" PRIMARY KEY (id);
ALTER TABLE public."Birds" ADD CONSTRAINT birds_ring_no_unique UNIQUE (ring_no);
GRANT ALL ON public."Birds" TO anon;
GRANT ALL ON public."Birds" TO authenticated;
GRANT ALL ON public."Birds" TO service_role;
CREATE INDEX idx_birds_ringing_group_ids ON public."Birds" USING gin (ringing_group_ids);
CREATE INDEX idx_birds_species_id ON public."Birds" (species_id);
CREATE POLICY group_birds_access ON public."Birds" FOR SELECT USING ((((((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint = ANY (ringing_group_ids)) OR ((ringing_group_ids = '{}'::bigint[]) AND ((((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint IS NOT NULL))));
CREATE POLICY group_birds_insert ON public."Birds" FOR INSERT WITH CHECK (((((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint IS NOT NULL));
CREATE POLICY group_birds_update ON public."Birds" FOR UPDATE USING (((((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint IS NOT NULL)) WITH CHECK (((((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint IS NOT NULL));
CREATE TABLE public."Encounters" (capture_time time without time zone NOT NULL, record_type text NOT NULL, scheme text NOT NULL, sex text NOT NULL, sexing_method text, breeding_condition text, wing_length smallint, weight real, moult_code text, old_greater_coverts smallint, extra_text text, is_juv boolean DEFAULT false NOT NULL, id bigint DEFAULT nextval('public."Encounters_id_seq"'::regclass) NOT NULL, bird_id bigint NOT NULL, session_id bigint NOT NULL, ringing_group_id bigint NOT NULL, age_code smallint NOT NULL, max_hatch_year smallint NOT NULL, min_hatch_year smallint NOT NULL);
ALTER SEQUENCE public."Encounters_id_seq" OWNED BY public."Encounters".id;
GRANT ALL ON SEQUENCE public."Encounters_id_seq" TO anon;
GRANT ALL ON SEQUENCE public."Encounters_id_seq" TO authenticated;
GRANT ALL ON SEQUENCE public."Encounters_id_seq" TO service_role;
COMMENT ON TABLE public."Encounters" IS 'Encounters with individual birds';
ALTER TABLE public."Encounters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Encounters" ADD CONSTRAINT "Encounters_pkey" PRIMARY KEY (id);
ALTER TABLE public."Encounters" ADD CONSTRAINT encounters_bird_id_fkey FOREIGN KEY (bird_id) REFERENCES public."Birds"(id);
ALTER TABLE public."Encounters" ADD CONSTRAINT encounters_bird_id_session_id_unique UNIQUE (bird_id, session_id);
GRANT ALL ON public."Encounters" TO anon;
GRANT ALL ON public."Encounters" TO authenticated;
GRANT ALL ON public."Encounters" TO service_role;
CREATE INDEX idx_encounters_ringing_group_id ON public."Encounters" (ringing_group_id);
CREATE INDEX idx_encounters_session_id ON public."Encounters" (session_id);
CREATE INDEX idx_encounters_bird_id ON public."Encounters" (bird_id);
CREATE TRIGGER trigger_add_bird_ringing_group_id AFTER INSERT ON public."Encounters" FOR EACH ROW EXECUTE FUNCTION public.add_bird_ringing_group_id();
CREATE TRIGGER trigger_encounters_refresh_bird_proven_age AFTER INSERT OR DELETE OR UPDATE ON public."Encounters" FOR EACH ROW EXECUTE FUNCTION public.trg_encounters_refresh_bird_proven_age();
CREATE TRIGGER trigger_remove_bird_ringing_group_id BEFORE DELETE ON public."Encounters" FOR EACH ROW EXECUTE FUNCTION public.remove_bird_ringing_group_id();
CREATE TRIGGER trigger_set_encounter_generated_fields BEFORE INSERT OR UPDATE OF session_id, capture_time ON public."Encounters" FOR EACH ROW EXECUTE FUNCTION public.set_encounter_generated_fields();
CREATE TRIGGER trigger_update_bird_ringing_group_id AFTER UPDATE OF ringing_group_id ON public."Encounters" FOR EACH ROW EXECUTE FUNCTION public.update_bird_ringing_group_id();
CREATE POLICY group_encounters_access ON public."Encounters" FOR SELECT USING ((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint));
CREATE POLICY group_encounters_insert ON public."Encounters" FOR INSERT WITH CHECK ((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint));
CREATE POLICY group_encounters_update ON public."Encounters" FOR UPDATE USING ((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint)) WITH CHECK ((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint));
CREATE TABLE public."Locations" (location_name text NOT NULL, ringing_group_id bigint NOT NULL, id bigint DEFAULT nextval('public."Locations_id_seq"'::regclass) NOT NULL);
ALTER SEQUENCE public."Locations_id_seq" OWNED BY public."Locations".id;
GRANT ALL ON SEQUENCE public."Locations_id_seq" TO anon;
GRANT ALL ON SEQUENCE public."Locations_id_seq" TO authenticated;
GRANT ALL ON SEQUENCE public."Locations_id_seq" TO service_role;
COMMENT ON TABLE public."Locations" IS 'Ringing locations';
ALTER TABLE public."Locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Locations" ADD CONSTRAINT "Locations_location_name_unique" UNIQUE (location_name);
ALTER TABLE public."Locations" ADD CONSTRAINT "Locations_pkey" PRIMARY KEY (id);
GRANT ALL ON public."Locations" TO anon;
GRANT ALL ON public."Locations" TO authenticated;
GRANT ALL ON public."Locations" TO service_role;
CREATE INDEX idx_locations_ringing_group_id ON public."Locations" (ringing_group_id);
CREATE POLICY group_locations_access ON public."Locations" FOR SELECT USING ((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint));
CREATE POLICY group_locations_insert ON public."Locations" FOR INSERT WITH CHECK ((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint));
CREATE POLICY group_locations_update ON public."Locations" FOR UPDATE USING ((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint)) WITH CHECK ((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint));
CREATE TABLE public."RingingGroups" (group_name text NOT NULL, id bigint DEFAULT nextval('public."RingingGroups_id_seq"'::regclass) NOT NULL);
ALTER SEQUENCE public."RingingGroups_id_seq" OWNED BY public."RingingGroups".id;
GRANT ALL ON SEQUENCE public."RingingGroups_id_seq" TO anon;
GRANT ALL ON SEQUENCE public."RingingGroups_id_seq" TO authenticated;
GRANT ALL ON SEQUENCE public."RingingGroups_id_seq" TO service_role;
COMMENT ON TABLE public."RingingGroups" IS 'Ringing groups';
ALTER TABLE public."RingingGroups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."RingingGroups" ADD CONSTRAINT "RingingGroups_group_name_unique" UNIQUE (group_name);
ALTER TABLE public."RingingGroups" ADD CONSTRAINT "RingingGroups_pkey" PRIMARY KEY (id);
ALTER TABLE public."Encounters" ADD CONSTRAINT encounters_ringing_group_id_fkey FOREIGN KEY (ringing_group_id) REFERENCES public."RingingGroups"(id);
ALTER TABLE public."Locations" ADD CONSTRAINT locations_ringing_group_id_fkey FOREIGN KEY (ringing_group_id) REFERENCES public."RingingGroups"(id);
GRANT ALL ON public."RingingGroups" TO anon;
GRANT ALL ON public."RingingGroups" TO authenticated;
GRANT ALL ON public."RingingGroups" TO service_role;
CREATE POLICY ringing_groups_access ON public."RingingGroups" FOR SELECT USING (true);
CREATE POLICY ringing_groups_insert ON public."RingingGroups" FOR INSERT WITH CHECK (true);
CREATE POLICY ringing_groups_update ON public."RingingGroups" FOR UPDATE USING ((id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint)) WITH CHECK ((id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint));
CREATE TABLE public."Sessions" (id bigint DEFAULT nextval('public."Sessions_id_seq"'::regclass) NOT NULL, visit_date date NOT NULL, location_id bigint NOT NULL, ringing_group_id bigint NOT NULL);
ALTER SEQUENCE public."Sessions_id_seq" OWNED BY public."Sessions".id;
GRANT ALL ON SEQUENCE public."Sessions_id_seq" TO anon;
GRANT ALL ON SEQUENCE public."Sessions_id_seq" TO authenticated;
GRANT ALL ON SEQUENCE public."Sessions_id_seq" TO service_role;
ALTER TABLE public."Sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Sessions" ADD CONSTRAINT "Sessions_pkey" PRIMARY KEY (id);
ALTER TABLE public."Encounters" ADD CONSTRAINT encounters_session_id_fkey FOREIGN KEY (session_id) REFERENCES public."Sessions"(id);
ALTER TABLE public."Sessions" ADD CONSTRAINT "Sessions_visit_date_location_id_key" UNIQUE (visit_date, location_id);
ALTER TABLE public."Sessions" ADD CONSTRAINT sessions_location_id_fkey FOREIGN KEY (location_id) REFERENCES public."Locations"(id);
ALTER TABLE public."Sessions" ADD CONSTRAINT sessions_ringing_group_id_fkey FOREIGN KEY (ringing_group_id) REFERENCES public."RingingGroups"(id);
GRANT ALL ON public."Sessions" TO anon;
GRANT ALL ON public."Sessions" TO authenticated;
GRANT ALL ON public."Sessions" TO service_role;
CREATE INDEX idx_sessions_ringing_group_id ON public."Sessions" (ringing_group_id);
CREATE INDEX idx_sessions_location_id ON public."Sessions" (location_id);
CREATE TRIGGER trigger_set_session_generated_fields BEFORE INSERT OR UPDATE OF location_id ON public."Sessions" FOR EACH ROW EXECUTE FUNCTION public.set_session_generated_fields();
CREATE POLICY group_sessions_access ON public."Sessions" FOR SELECT USING ((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint));
CREATE POLICY group_sessions_insert ON public."Sessions" FOR INSERT WITH CHECK ((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint));
CREATE POLICY group_sessions_update ON public."Sessions" FOR UPDATE USING ((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint)) WITH CHECK ((ringing_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint));
CREATE TABLE public."Species" (species_name text NOT NULL, id bigint DEFAULT nextval('public."Species_id_seq"'::regclass) NOT NULL);
ALTER SEQUENCE public."Species_id_seq" OWNED BY public."Species".id;
GRANT ALL ON SEQUENCE public."Species_id_seq" TO anon;
GRANT ALL ON SEQUENCE public."Species_id_seq" TO authenticated;
GRANT ALL ON SEQUENCE public."Species_id_seq" TO service_role;
COMMENT ON TABLE public."Species" IS 'Bird Species';
ALTER TABLE public."Species" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Species" ADD CONSTRAINT "Species_pkey" PRIMARY KEY (id);
ALTER TABLE public."Birds" ADD CONSTRAINT birds_species_id_fkey FOREIGN KEY (species_id) REFERENCES public."Species"(id);
ALTER TABLE public."Species" ADD CONSTRAINT species_species_name_unique UNIQUE (species_name);
GRANT ALL ON public."Species" TO anon;
GRANT ALL ON public."Species" TO authenticated;
GRANT ALL ON public."Species" TO service_role;
CREATE POLICY species_access ON public."Species" FOR SELECT USING (true);
CREATE POLICY species_insert ON public."Species" FOR INSERT WITH CHECK (true);
CREATE POLICY species_update ON public."Species" FOR UPDATE USING (true) WITH CHECK (true);
