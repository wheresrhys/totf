-- One of six small, read-only "metric-group" RPCs (#1149, sibling of #1145's
-- stats_cache_biometrics_metrics and #1148's stats_cache_bird_age_metrics) a
-- later orchestrator (T8a, refresh_simple_stats_cache) calls to populate the
-- merged SimpleStatsCache table (T1a). This RPC only returns rows; writing into
-- SimpleStatsCache is T8a's job.
--
-- It collapses into one place the ENCOUNTER-level age-bucket projection
-- core_stats and demographics_stats each derive independently today, in a
-- near-identical encounter_age_bucket_counts CTE apiece:
--
--   * core_stats':         pullus/juv/postjuv/adult/unknown_age_enc_count
--   * demographics_stats': juv/postjuv_enc_count (byte-identical duplicates of
--                          core's), plus postjuv_juv / new_postjuv_juv /
--                          new_postjuv_enc_count
--
-- juv_enc_count and postjuv_enc_count are therefore computed exactly ONCE here,
-- not once per originating RPC — that dedup is the point of the merge, and the
-- integration test asserts the single column agrees with both callers.
--
-- The three young-trends columns filter on age_code/is_juv/record_type rather
-- than on age_bucket, exactly as demographics_stats does, because they cut
-- ACROSS the bucket boundary: postjuv_juv is the age_code = 3 half of the 'juv'
-- bucket (which also admits 1J), and new_postjuv is the record_type = 'N' half
-- of the 'postjuv' bucket. stats_encounter_age_classification carries
-- age_code/is_juv/record_type alongside age_bucket precisely so a consumer can
-- do this without re-deriving the classification.
--
-- No top-level encounter_count column: that is a plain count off
-- raw_encounters, not off the age classification, and belongs with
-- stats_cache_basic_session_metrics' (T2) session/count metrics.
--
-- The spine IS joined, exactly as core_stats, demographics_stats and the two
-- sibling stats_cache_* RPCs do, even though
-- stats_encounter_age_classification is this RPC's only row SOURCE: a cell with
-- no matching encounters must appear with zero counts rather than vanish, so
-- these rows line up row-for-row with core_stats'/demographics_stats' for
-- identical filters (and so T8a writes a cache row per cell, not just per
-- non-empty cell). No COALESCE is needed on the eight count columns — every one
-- of them is a COUNT(*) FILTER, which over a LEFT JOIN's unmatched row is
-- already 0, not NULL, unlike biometrics' MAX/AVG/MIN.
--
-- LANGUAGE sql STABLE, not plpgsql, like stats_spine /
-- stats_encounter_age_classification themselves — this is a plain single-SELECT
-- utility RPC, not one of the plpgsql orchestrators (T8a/T8b) whose
-- shape-parameterized join needs SET plan_cache_mode TO 'force_custom_plan' to
-- avoid the generic-plan-cliff (see CLAUDE.md). That mitigation does not apply
-- here.
--
-- The final projection is wrapped in jsonb_populate_record rather than returned
-- as a bare positional SELECT, for the same reason as every sibling RPC in this
-- family: a bare final SELECT binds to the composite return type's columns by
-- ORDINAL POSITION, not by the "AS" alias names below, and that position is
-- only as stable as whatever DDL a given environment's schema-diff run happens
-- to emit for the type's physical attribute order (two db:schema:apply runs on
-- the same source files produced two different orders — see
-- biometrics_stats.sql's header for the #800 postmortem). Routing through
-- to_jsonb(...)/jsonb_populate_record binds every column by NAME instead, and
-- it is evaluated via CROSS JOIN LATERAL (once per outer row) rather than as a
-- bare `(...).*` projection, which Postgres would expand at parse time into one
-- independent call PER OUTPUT COLUMN.
CREATE FUNCTION public.stats_cache_encounter_age_metrics (
	species_name_filter text DEFAULT NULL::text,
	from_date date DEFAULT NULL::date,
	to_date date DEFAULT NULL::date,
	ringing_group_filter bigint DEFAULT NULL::bigint,
	group_by_species boolean DEFAULT FALSE,
	group_by_time_period text DEFAULT NULL::text,
	year_filter smallint DEFAULT NULL::smallint,
	month_filter smallint DEFAULT NULL::smallint
) RETURNS SETOF public.stats_cache_encounter_age_metrics_result LANGUAGE sql STABLE AS $function$
  SELECT r.*
  FROM (
  WITH spine AS (
    SELECT * FROM public.stats_spine(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
  ), encounter_age_classification AS (
    SELECT * FROM public.stats_encounter_age_classification(species_name_filter, from_date, to_date, ringing_group_filter, group_by_species, group_by_time_period, year_filter, month_filter)
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

    -- core_stats' five mutually-exclusive, exhaustive buckets.
    COUNT(*) FILTER (WHERE eac.age_bucket = 'pullus') AS "pullus_enc_count",
    COUNT(*) FILTER (WHERE eac.age_bucket = 'juv') AS "juv_enc_count",
    COUNT(*) FILTER (WHERE eac.age_bucket = 'postjuv') AS "postjuv_enc_count",
    COUNT(*) FILTER (WHERE eac.age_bucket = 'adult') AS "adult_enc_count",
    COUNT(*) FILTER (WHERE eac.age_bucket = 'unknown') AS "unknown_age_enc_count",

    -- demographics_stats' young-trends slices. The first is the 3J-only part of
    -- the 'juv' bucket above (1J encounters are juv but not postjuv_juv); the
    -- other two are the 'N'-record_type parts of 3J and of bare age 3.
    COUNT(*) FILTER (WHERE eac.age_code = 3 AND eac.is_juv) AS "postjuv_juv_enc_count",
    COUNT(*) FILTER (WHERE eac.age_code = 3 AND eac.is_juv AND eac.record_type = 'N') AS "new_postjuv_juv_enc_count",
    COUNT(*) FILTER (WHERE eac.age_code = 3 AND NOT eac.is_juv AND eac.record_type = 'N') AS "new_postjuv_enc_count"

  FROM spine
  -- eac.species_id / eac.time_period are already resolved to the same cell axis
  -- the spine uses (stats_encounter_age_classification applies the same
  -- group_by_* CASEs), so this joins on them directly rather than re-deriving
  -- session_day/month/year.
  LEFT JOIN encounter_age_classification eac ON
  (NOT group_by_species OR spine.species_id = eac.species_id)
  AND (
    (group_by_time_period IN ('day', 'month', 'year', 'month-squashed') AND spine.time_period = eac.time_period)
    OR (group_by_time_period IS NULL OR group_by_time_period NOT IN ('month', 'year', 'day', 'month-squashed'))
  )
  GROUP BY CASE
    WHEN group_by_species THEN spine.species_id
    ELSE NULL::bigint
  END, CASE
    WHEN group_by_time_period = 'day' THEN spine.time_period
    WHEN group_by_time_period = 'month' THEN spine.time_period
    WHEN group_by_time_period = 'year' THEN spine.time_period
    WHEN group_by_time_period = 'month-squashed' THEN spine.time_period
    ELSE NULL::date
  END
  ) AS agg
  CROSS JOIN LATERAL jsonb_populate_record(NULL::public.stats_cache_encounter_age_metrics_result, to_jsonb(agg)) AS r
  ORDER BY r.species_id ASC, r.time_period ASC;
$function$;

GRANT ALL ON FUNCTION public.stats_cache_encounter_age_metrics (
	text,
	date,
	date,
	bigint,
	boolean,
	text,
	smallint,
	smallint
) TO anon;

GRANT ALL ON FUNCTION public.stats_cache_encounter_age_metrics (
	text,
	date,
	date,
	bigint,
	boolean,
	text,
	smallint,
	smallint
) TO authenticated;

GRANT ALL ON FUNCTION public.stats_cache_encounter_age_metrics (
	text,
	date,
	date,
	bigint,
	boolean,
	text,
	smallint,
	smallint
) TO service_role;
