SET check_function_bodies = false;
CREATE FUNCTION public.upsert_complex_stats_cache_rows(p_group_id bigint, p_temporal_unit text, p_group_by_species boolean, p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  -- The null-pattern this whole batch declares, derived from the two scalar
  -- parameters rather than sniffed from the rows: p_group_by_species decides
  -- whether species_id carries a value, and the all-time grain is the one
  -- grain with no time_period.
  v_has_species boolean := p_group_by_species;
  v_has_period boolean := p_temporal_unit <> 'all-time';
BEGIN
  IF p_rows IS NULL OR jsonb_array_length(p_rows) = 0 THEN
    RETURN;
  END IF;

  -- Defensive guard. A row whose own null-pattern disagrees with the declared
  -- one would still insert happily below — through the WRONG arbiter index,
  -- which polices a different column list — and would only surface as a
  -- duplicate-row bug on some LATER refresh of the same cell. Fail loudly here
  -- instead.
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_rows) AS t (species_id bigint, time_period date)
    WHERE (t.species_id IS NOT NULL) IS DISTINCT FROM v_has_species
       OR (t.time_period IS NOT NULL) IS DISTINCT FROM v_has_period
  ) THEN
    RAISE EXCEPTION
      'upsert_complex_stats_cache_rows: a row''s null-pattern does not match the batch''s declared pattern (p_group_by_species=%, p_temporal_unit=%)',
      p_group_by_species, p_temporal_unit
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_has_species AND v_has_period THEN
    -- Case A: per-species, per-period — arbiter the plain UNIQUE constraint (complex_stats_cache_group_species_grain_period_key).
    INSERT INTO public."ComplexStatsCache" (
      group_id,
      species_id,
      temporal_unit,
      time_period,
      new_adult_bird_count,
      returning_age_1_bird_count,
      returning_age_2_bird_count,
      returning_age_3_plus_bird_count,
      returning_new_unknown_age_bird_count
    )
    SELECT
      p_group_id,
      t.species_id,
      p_temporal_unit,
      t.time_period,
      t.new_adult_bird_count,
      t.returning_age_1_bird_count,
      t.returning_age_2_bird_count,
      t.returning_age_3_plus_bird_count,
      t.returning_new_unknown_age_bird_count
    FROM jsonb_to_recordset(p_rows) AS t (
      species_id bigint,
      time_period date,
      new_adult_bird_count bigint,
      returning_age_1_bird_count bigint,
      returning_age_2_bird_count bigint,
      returning_age_3_plus_bird_count bigint,
      returning_new_unknown_age_bird_count bigint
    )
    ON CONFLICT ON CONSTRAINT complex_stats_cache_group_species_grain_period_key
    DO UPDATE SET
      new_adult_bird_count = EXCLUDED.new_adult_bird_count,
      returning_age_1_bird_count = EXCLUDED.returning_age_1_bird_count,
      returning_age_2_bird_count = EXCLUDED.returning_age_2_bird_count,
      returning_age_3_plus_bird_count = EXCLUDED.returning_age_3_plus_bird_count,
      returning_new_unknown_age_bird_count = EXCLUDED.returning_new_unknown_age_bird_count;

  ELSIF NOT v_has_species AND v_has_period THEN
    -- Case B: all-species, per-period — arbiter complex_stats_cache_group_period_allspecies_key.
    INSERT INTO public."ComplexStatsCache" (
      group_id,
      species_id,
      temporal_unit,
      time_period,
      new_adult_bird_count,
      returning_age_1_bird_count,
      returning_age_2_bird_count,
      returning_age_3_plus_bird_count,
      returning_new_unknown_age_bird_count
    )
    SELECT
      p_group_id,
      t.species_id,
      p_temporal_unit,
      t.time_period,
      t.new_adult_bird_count,
      t.returning_age_1_bird_count,
      t.returning_age_2_bird_count,
      t.returning_age_3_plus_bird_count,
      t.returning_new_unknown_age_bird_count
    FROM jsonb_to_recordset(p_rows) AS t (
      species_id bigint,
      time_period date,
      new_adult_bird_count bigint,
      returning_age_1_bird_count bigint,
      returning_age_2_bird_count bigint,
      returning_age_3_plus_bird_count bigint,
      returning_new_unknown_age_bird_count bigint
    )
    ON CONFLICT (group_id, temporal_unit, time_period) WHERE species_id IS NULL AND time_period IS NOT NULL
    DO UPDATE SET
      new_adult_bird_count = EXCLUDED.new_adult_bird_count,
      returning_age_1_bird_count = EXCLUDED.returning_age_1_bird_count,
      returning_age_2_bird_count = EXCLUDED.returning_age_2_bird_count,
      returning_age_3_plus_bird_count = EXCLUDED.returning_age_3_plus_bird_count,
      returning_new_unknown_age_bird_count = EXCLUDED.returning_new_unknown_age_bird_count;

  ELSIF v_has_species AND NOT v_has_period THEN
    -- Case C: per-species, all-time — arbiter complex_stats_cache_group_species_alltime_key.
    INSERT INTO public."ComplexStatsCache" (
      group_id,
      species_id,
      temporal_unit,
      time_period,
      new_adult_bird_count,
      returning_age_1_bird_count,
      returning_age_2_bird_count,
      returning_age_3_plus_bird_count,
      returning_new_unknown_age_bird_count
    )
    SELECT
      p_group_id,
      t.species_id,
      p_temporal_unit,
      t.time_period,
      t.new_adult_bird_count,
      t.returning_age_1_bird_count,
      t.returning_age_2_bird_count,
      t.returning_age_3_plus_bird_count,
      t.returning_new_unknown_age_bird_count
    FROM jsonb_to_recordset(p_rows) AS t (
      species_id bigint,
      time_period date,
      new_adult_bird_count bigint,
      returning_age_1_bird_count bigint,
      returning_age_2_bird_count bigint,
      returning_age_3_plus_bird_count bigint,
      returning_new_unknown_age_bird_count bigint
    )
    ON CONFLICT (group_id, species_id, temporal_unit) WHERE species_id IS NOT NULL AND time_period IS NULL
    DO UPDATE SET
      new_adult_bird_count = EXCLUDED.new_adult_bird_count,
      returning_age_1_bird_count = EXCLUDED.returning_age_1_bird_count,
      returning_age_2_bird_count = EXCLUDED.returning_age_2_bird_count,
      returning_age_3_plus_bird_count = EXCLUDED.returning_age_3_plus_bird_count,
      returning_new_unknown_age_bird_count = EXCLUDED.returning_new_unknown_age_bird_count;

  ELSE
    -- Case D: all-species, all-time — arbiter complex_stats_cache_group_alltime_allspecies_key.
    INSERT INTO public."ComplexStatsCache" (
      group_id,
      species_id,
      temporal_unit,
      time_period,
      new_adult_bird_count,
      returning_age_1_bird_count,
      returning_age_2_bird_count,
      returning_age_3_plus_bird_count,
      returning_new_unknown_age_bird_count
    )
    SELECT
      p_group_id,
      t.species_id,
      p_temporal_unit,
      t.time_period,
      t.new_adult_bird_count,
      t.returning_age_1_bird_count,
      t.returning_age_2_bird_count,
      t.returning_age_3_plus_bird_count,
      t.returning_new_unknown_age_bird_count
    FROM jsonb_to_recordset(p_rows) AS t (
      species_id bigint,
      time_period date,
      new_adult_bird_count bigint,
      returning_age_1_bird_count bigint,
      returning_age_2_bird_count bigint,
      returning_age_3_plus_bird_count bigint,
      returning_new_unknown_age_bird_count bigint
    )
    ON CONFLICT (group_id, temporal_unit) WHERE species_id IS NULL AND time_period IS NULL
    DO UPDATE SET
      new_adult_bird_count = EXCLUDED.new_adult_bird_count,
      returning_age_1_bird_count = EXCLUDED.returning_age_1_bird_count,
      returning_age_2_bird_count = EXCLUDED.returning_age_2_bird_count,
      returning_age_3_plus_bird_count = EXCLUDED.returning_age_3_plus_bird_count,
      returning_new_unknown_age_bird_count = EXCLUDED.returning_new_unknown_age_bird_count;
  END IF;
END;
$function$;
GRANT ALL ON FUNCTION public.upsert_complex_stats_cache_rows(bigint, text, boolean, jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.upsert_complex_stats_cache_rows(bigint, text, boolean, jsonb) TO service_role;
CREATE FUNCTION public.upsert_simple_stats_cache_rows(p_group_id bigint, p_temporal_unit text, p_group_by_species boolean, p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  -- The null-pattern this whole batch declares, derived from the two scalar
  -- parameters rather than sniffed from the rows: p_group_by_species decides
  -- whether species_id carries a value, and the all-time grain is the one
  -- grain with no time_period.
  v_has_species boolean := p_group_by_species;
  v_has_period boolean := p_temporal_unit <> 'all-time';
BEGIN
  IF p_rows IS NULL OR jsonb_array_length(p_rows) = 0 THEN
    RETURN;
  END IF;

  -- Defensive guard. A row whose own null-pattern disagrees with the declared
  -- one would still insert happily below — through the WRONG arbiter index,
  -- which polices a different column list — and would only surface as a
  -- duplicate-row bug on some LATER refresh of the same cell. Fail loudly here
  -- instead.
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_rows) AS t (species_id bigint, time_period date)
    WHERE (t.species_id IS NOT NULL) IS DISTINCT FROM v_has_species
       OR (t.time_period IS NOT NULL) IS DISTINCT FROM v_has_period
  ) THEN
    RAISE EXCEPTION
      'upsert_simple_stats_cache_rows: a row''s null-pattern does not match the batch''s declared pattern (p_group_by_species=%, p_temporal_unit=%)',
      p_group_by_species, p_temporal_unit
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_has_species AND v_has_period THEN
    -- Case A: per-species, per-period — arbiter the plain UNIQUE constraint (simple_stats_cache_group_species_grain_period_key).
    INSERT INTO public."SimpleStatsCache" (
      group_id,
      species_id,
      temporal_unit,
      time_period,
      species_count,
      bird_count,
      encounter_count,
      new_bird_count,
      session_count,
      total_effort,
      effort_per_session,
      effort_per_encounter,
      avg_encounters_per_session,
      max_per_session,
      max_new_per_session,
      max_weight,
      avg_weight,
      min_weight,
      median_weight,
      max_wing,
      avg_wing,
      min_wing,
      median_wing,
      pullus_bird_count,
      juv_bird_count,
      postjuv_bird_count,
      adult_bird_count,
      unknown_age_bird_count,
      new_young_bird_count,
      pullus_enc_count,
      juv_enc_count,
      postjuv_enc_count,
      adult_enc_count,
      unknown_age_enc_count,
      postjuv_juv_enc_count,
      new_postjuv_juv_enc_count,
      new_postjuv_enc_count
    )
    SELECT
      p_group_id,
      t.species_id,
      p_temporal_unit,
      t.time_period,
      t.species_count,
      t.bird_count,
      t.encounter_count,
      t.new_bird_count,
      t.session_count,
      t.total_effort,
      t.effort_per_session,
      t.effort_per_encounter,
      t.avg_encounters_per_session,
      t.max_per_session,
      t.max_new_per_session,
      t.max_weight,
      t.avg_weight,
      t.min_weight,
      t.median_weight,
      t.max_wing,
      t.avg_wing,
      t.min_wing,
      t.median_wing,
      t.pullus_bird_count,
      t.juv_bird_count,
      t.postjuv_bird_count,
      t.adult_bird_count,
      t.unknown_age_bird_count,
      t.new_young_bird_count,
      t.pullus_enc_count,
      t.juv_enc_count,
      t.postjuv_enc_count,
      t.adult_enc_count,
      t.unknown_age_enc_count,
      t.postjuv_juv_enc_count,
      t.new_postjuv_juv_enc_count,
      t.new_postjuv_enc_count
    FROM jsonb_to_recordset(p_rows) AS t (
      species_id bigint,
      time_period date,
      species_count bigint,
      bird_count bigint,
      encounter_count bigint,
      new_bird_count bigint,
      session_count bigint,
      total_effort interval,
      effort_per_session interval,
      effort_per_encounter interval,
      avg_encounters_per_session numeric,
      max_per_session bigint,
      max_new_per_session bigint,
      max_weight real,
      avg_weight numeric,
      min_weight real,
      median_weight numeric,
      max_wing smallint,
      avg_wing numeric,
      min_wing smallint,
      median_wing numeric,
      pullus_bird_count bigint,
      juv_bird_count bigint,
      postjuv_bird_count bigint,
      adult_bird_count bigint,
      unknown_age_bird_count bigint,
      new_young_bird_count bigint,
      pullus_enc_count bigint,
      juv_enc_count bigint,
      postjuv_enc_count bigint,
      adult_enc_count bigint,
      unknown_age_enc_count bigint,
      postjuv_juv_enc_count bigint,
      new_postjuv_juv_enc_count bigint,
      new_postjuv_enc_count bigint
    )
    ON CONFLICT ON CONSTRAINT simple_stats_cache_group_species_grain_period_key
    DO UPDATE SET
      species_count = EXCLUDED.species_count,
      bird_count = EXCLUDED.bird_count,
      encounter_count = EXCLUDED.encounter_count,
      new_bird_count = EXCLUDED.new_bird_count,
      session_count = EXCLUDED.session_count,
      total_effort = EXCLUDED.total_effort,
      effort_per_session = EXCLUDED.effort_per_session,
      effort_per_encounter = EXCLUDED.effort_per_encounter,
      avg_encounters_per_session = EXCLUDED.avg_encounters_per_session,
      max_per_session = EXCLUDED.max_per_session,
      max_new_per_session = EXCLUDED.max_new_per_session,
      max_weight = EXCLUDED.max_weight,
      avg_weight = EXCLUDED.avg_weight,
      min_weight = EXCLUDED.min_weight,
      median_weight = EXCLUDED.median_weight,
      max_wing = EXCLUDED.max_wing,
      avg_wing = EXCLUDED.avg_wing,
      min_wing = EXCLUDED.min_wing,
      median_wing = EXCLUDED.median_wing,
      pullus_bird_count = EXCLUDED.pullus_bird_count,
      juv_bird_count = EXCLUDED.juv_bird_count,
      postjuv_bird_count = EXCLUDED.postjuv_bird_count,
      adult_bird_count = EXCLUDED.adult_bird_count,
      unknown_age_bird_count = EXCLUDED.unknown_age_bird_count,
      new_young_bird_count = EXCLUDED.new_young_bird_count,
      pullus_enc_count = EXCLUDED.pullus_enc_count,
      juv_enc_count = EXCLUDED.juv_enc_count,
      postjuv_enc_count = EXCLUDED.postjuv_enc_count,
      adult_enc_count = EXCLUDED.adult_enc_count,
      unknown_age_enc_count = EXCLUDED.unknown_age_enc_count,
      postjuv_juv_enc_count = EXCLUDED.postjuv_juv_enc_count,
      new_postjuv_juv_enc_count = EXCLUDED.new_postjuv_juv_enc_count,
      new_postjuv_enc_count = EXCLUDED.new_postjuv_enc_count;

  ELSIF NOT v_has_species AND v_has_period THEN
    -- Case B: all-species, per-period — arbiter simple_stats_cache_group_period_allspecies_key.
    INSERT INTO public."SimpleStatsCache" (
      group_id,
      species_id,
      temporal_unit,
      time_period,
      species_count,
      bird_count,
      encounter_count,
      new_bird_count,
      session_count,
      total_effort,
      effort_per_session,
      effort_per_encounter,
      avg_encounters_per_session,
      max_per_session,
      max_new_per_session,
      max_weight,
      avg_weight,
      min_weight,
      median_weight,
      max_wing,
      avg_wing,
      min_wing,
      median_wing,
      pullus_bird_count,
      juv_bird_count,
      postjuv_bird_count,
      adult_bird_count,
      unknown_age_bird_count,
      new_young_bird_count,
      pullus_enc_count,
      juv_enc_count,
      postjuv_enc_count,
      adult_enc_count,
      unknown_age_enc_count,
      postjuv_juv_enc_count,
      new_postjuv_juv_enc_count,
      new_postjuv_enc_count
    )
    SELECT
      p_group_id,
      t.species_id,
      p_temporal_unit,
      t.time_period,
      t.species_count,
      t.bird_count,
      t.encounter_count,
      t.new_bird_count,
      t.session_count,
      t.total_effort,
      t.effort_per_session,
      t.effort_per_encounter,
      t.avg_encounters_per_session,
      t.max_per_session,
      t.max_new_per_session,
      t.max_weight,
      t.avg_weight,
      t.min_weight,
      t.median_weight,
      t.max_wing,
      t.avg_wing,
      t.min_wing,
      t.median_wing,
      t.pullus_bird_count,
      t.juv_bird_count,
      t.postjuv_bird_count,
      t.adult_bird_count,
      t.unknown_age_bird_count,
      t.new_young_bird_count,
      t.pullus_enc_count,
      t.juv_enc_count,
      t.postjuv_enc_count,
      t.adult_enc_count,
      t.unknown_age_enc_count,
      t.postjuv_juv_enc_count,
      t.new_postjuv_juv_enc_count,
      t.new_postjuv_enc_count
    FROM jsonb_to_recordset(p_rows) AS t (
      species_id bigint,
      time_period date,
      species_count bigint,
      bird_count bigint,
      encounter_count bigint,
      new_bird_count bigint,
      session_count bigint,
      total_effort interval,
      effort_per_session interval,
      effort_per_encounter interval,
      avg_encounters_per_session numeric,
      max_per_session bigint,
      max_new_per_session bigint,
      max_weight real,
      avg_weight numeric,
      min_weight real,
      median_weight numeric,
      max_wing smallint,
      avg_wing numeric,
      min_wing smallint,
      median_wing numeric,
      pullus_bird_count bigint,
      juv_bird_count bigint,
      postjuv_bird_count bigint,
      adult_bird_count bigint,
      unknown_age_bird_count bigint,
      new_young_bird_count bigint,
      pullus_enc_count bigint,
      juv_enc_count bigint,
      postjuv_enc_count bigint,
      adult_enc_count bigint,
      unknown_age_enc_count bigint,
      postjuv_juv_enc_count bigint,
      new_postjuv_juv_enc_count bigint,
      new_postjuv_enc_count bigint
    )
    ON CONFLICT (group_id, temporal_unit, time_period) WHERE species_id IS NULL AND time_period IS NOT NULL
    DO UPDATE SET
      species_count = EXCLUDED.species_count,
      bird_count = EXCLUDED.bird_count,
      encounter_count = EXCLUDED.encounter_count,
      new_bird_count = EXCLUDED.new_bird_count,
      session_count = EXCLUDED.session_count,
      total_effort = EXCLUDED.total_effort,
      effort_per_session = EXCLUDED.effort_per_session,
      effort_per_encounter = EXCLUDED.effort_per_encounter,
      avg_encounters_per_session = EXCLUDED.avg_encounters_per_session,
      max_per_session = EXCLUDED.max_per_session,
      max_new_per_session = EXCLUDED.max_new_per_session,
      max_weight = EXCLUDED.max_weight,
      avg_weight = EXCLUDED.avg_weight,
      min_weight = EXCLUDED.min_weight,
      median_weight = EXCLUDED.median_weight,
      max_wing = EXCLUDED.max_wing,
      avg_wing = EXCLUDED.avg_wing,
      min_wing = EXCLUDED.min_wing,
      median_wing = EXCLUDED.median_wing,
      pullus_bird_count = EXCLUDED.pullus_bird_count,
      juv_bird_count = EXCLUDED.juv_bird_count,
      postjuv_bird_count = EXCLUDED.postjuv_bird_count,
      adult_bird_count = EXCLUDED.adult_bird_count,
      unknown_age_bird_count = EXCLUDED.unknown_age_bird_count,
      new_young_bird_count = EXCLUDED.new_young_bird_count,
      pullus_enc_count = EXCLUDED.pullus_enc_count,
      juv_enc_count = EXCLUDED.juv_enc_count,
      postjuv_enc_count = EXCLUDED.postjuv_enc_count,
      adult_enc_count = EXCLUDED.adult_enc_count,
      unknown_age_enc_count = EXCLUDED.unknown_age_enc_count,
      postjuv_juv_enc_count = EXCLUDED.postjuv_juv_enc_count,
      new_postjuv_juv_enc_count = EXCLUDED.new_postjuv_juv_enc_count,
      new_postjuv_enc_count = EXCLUDED.new_postjuv_enc_count;

  ELSIF v_has_species AND NOT v_has_period THEN
    -- Case C: per-species, all-time — arbiter simple_stats_cache_group_species_alltime_key.
    INSERT INTO public."SimpleStatsCache" (
      group_id,
      species_id,
      temporal_unit,
      time_period,
      species_count,
      bird_count,
      encounter_count,
      new_bird_count,
      session_count,
      total_effort,
      effort_per_session,
      effort_per_encounter,
      avg_encounters_per_session,
      max_per_session,
      max_new_per_session,
      max_weight,
      avg_weight,
      min_weight,
      median_weight,
      max_wing,
      avg_wing,
      min_wing,
      median_wing,
      pullus_bird_count,
      juv_bird_count,
      postjuv_bird_count,
      adult_bird_count,
      unknown_age_bird_count,
      new_young_bird_count,
      pullus_enc_count,
      juv_enc_count,
      postjuv_enc_count,
      adult_enc_count,
      unknown_age_enc_count,
      postjuv_juv_enc_count,
      new_postjuv_juv_enc_count,
      new_postjuv_enc_count
    )
    SELECT
      p_group_id,
      t.species_id,
      p_temporal_unit,
      t.time_period,
      t.species_count,
      t.bird_count,
      t.encounter_count,
      t.new_bird_count,
      t.session_count,
      t.total_effort,
      t.effort_per_session,
      t.effort_per_encounter,
      t.avg_encounters_per_session,
      t.max_per_session,
      t.max_new_per_session,
      t.max_weight,
      t.avg_weight,
      t.min_weight,
      t.median_weight,
      t.max_wing,
      t.avg_wing,
      t.min_wing,
      t.median_wing,
      t.pullus_bird_count,
      t.juv_bird_count,
      t.postjuv_bird_count,
      t.adult_bird_count,
      t.unknown_age_bird_count,
      t.new_young_bird_count,
      t.pullus_enc_count,
      t.juv_enc_count,
      t.postjuv_enc_count,
      t.adult_enc_count,
      t.unknown_age_enc_count,
      t.postjuv_juv_enc_count,
      t.new_postjuv_juv_enc_count,
      t.new_postjuv_enc_count
    FROM jsonb_to_recordset(p_rows) AS t (
      species_id bigint,
      time_period date,
      species_count bigint,
      bird_count bigint,
      encounter_count bigint,
      new_bird_count bigint,
      session_count bigint,
      total_effort interval,
      effort_per_session interval,
      effort_per_encounter interval,
      avg_encounters_per_session numeric,
      max_per_session bigint,
      max_new_per_session bigint,
      max_weight real,
      avg_weight numeric,
      min_weight real,
      median_weight numeric,
      max_wing smallint,
      avg_wing numeric,
      min_wing smallint,
      median_wing numeric,
      pullus_bird_count bigint,
      juv_bird_count bigint,
      postjuv_bird_count bigint,
      adult_bird_count bigint,
      unknown_age_bird_count bigint,
      new_young_bird_count bigint,
      pullus_enc_count bigint,
      juv_enc_count bigint,
      postjuv_enc_count bigint,
      adult_enc_count bigint,
      unknown_age_enc_count bigint,
      postjuv_juv_enc_count bigint,
      new_postjuv_juv_enc_count bigint,
      new_postjuv_enc_count bigint
    )
    ON CONFLICT (group_id, species_id, temporal_unit) WHERE species_id IS NOT NULL AND time_period IS NULL
    DO UPDATE SET
      species_count = EXCLUDED.species_count,
      bird_count = EXCLUDED.bird_count,
      encounter_count = EXCLUDED.encounter_count,
      new_bird_count = EXCLUDED.new_bird_count,
      session_count = EXCLUDED.session_count,
      total_effort = EXCLUDED.total_effort,
      effort_per_session = EXCLUDED.effort_per_session,
      effort_per_encounter = EXCLUDED.effort_per_encounter,
      avg_encounters_per_session = EXCLUDED.avg_encounters_per_session,
      max_per_session = EXCLUDED.max_per_session,
      max_new_per_session = EXCLUDED.max_new_per_session,
      max_weight = EXCLUDED.max_weight,
      avg_weight = EXCLUDED.avg_weight,
      min_weight = EXCLUDED.min_weight,
      median_weight = EXCLUDED.median_weight,
      max_wing = EXCLUDED.max_wing,
      avg_wing = EXCLUDED.avg_wing,
      min_wing = EXCLUDED.min_wing,
      median_wing = EXCLUDED.median_wing,
      pullus_bird_count = EXCLUDED.pullus_bird_count,
      juv_bird_count = EXCLUDED.juv_bird_count,
      postjuv_bird_count = EXCLUDED.postjuv_bird_count,
      adult_bird_count = EXCLUDED.adult_bird_count,
      unknown_age_bird_count = EXCLUDED.unknown_age_bird_count,
      new_young_bird_count = EXCLUDED.new_young_bird_count,
      pullus_enc_count = EXCLUDED.pullus_enc_count,
      juv_enc_count = EXCLUDED.juv_enc_count,
      postjuv_enc_count = EXCLUDED.postjuv_enc_count,
      adult_enc_count = EXCLUDED.adult_enc_count,
      unknown_age_enc_count = EXCLUDED.unknown_age_enc_count,
      postjuv_juv_enc_count = EXCLUDED.postjuv_juv_enc_count,
      new_postjuv_juv_enc_count = EXCLUDED.new_postjuv_juv_enc_count,
      new_postjuv_enc_count = EXCLUDED.new_postjuv_enc_count;

  ELSE
    -- Case D: all-species, all-time — arbiter simple_stats_cache_group_alltime_allspecies_key.
    INSERT INTO public."SimpleStatsCache" (
      group_id,
      species_id,
      temporal_unit,
      time_period,
      species_count,
      bird_count,
      encounter_count,
      new_bird_count,
      session_count,
      total_effort,
      effort_per_session,
      effort_per_encounter,
      avg_encounters_per_session,
      max_per_session,
      max_new_per_session,
      max_weight,
      avg_weight,
      min_weight,
      median_weight,
      max_wing,
      avg_wing,
      min_wing,
      median_wing,
      pullus_bird_count,
      juv_bird_count,
      postjuv_bird_count,
      adult_bird_count,
      unknown_age_bird_count,
      new_young_bird_count,
      pullus_enc_count,
      juv_enc_count,
      postjuv_enc_count,
      adult_enc_count,
      unknown_age_enc_count,
      postjuv_juv_enc_count,
      new_postjuv_juv_enc_count,
      new_postjuv_enc_count
    )
    SELECT
      p_group_id,
      t.species_id,
      p_temporal_unit,
      t.time_period,
      t.species_count,
      t.bird_count,
      t.encounter_count,
      t.new_bird_count,
      t.session_count,
      t.total_effort,
      t.effort_per_session,
      t.effort_per_encounter,
      t.avg_encounters_per_session,
      t.max_per_session,
      t.max_new_per_session,
      t.max_weight,
      t.avg_weight,
      t.min_weight,
      t.median_weight,
      t.max_wing,
      t.avg_wing,
      t.min_wing,
      t.median_wing,
      t.pullus_bird_count,
      t.juv_bird_count,
      t.postjuv_bird_count,
      t.adult_bird_count,
      t.unknown_age_bird_count,
      t.new_young_bird_count,
      t.pullus_enc_count,
      t.juv_enc_count,
      t.postjuv_enc_count,
      t.adult_enc_count,
      t.unknown_age_enc_count,
      t.postjuv_juv_enc_count,
      t.new_postjuv_juv_enc_count,
      t.new_postjuv_enc_count
    FROM jsonb_to_recordset(p_rows) AS t (
      species_id bigint,
      time_period date,
      species_count bigint,
      bird_count bigint,
      encounter_count bigint,
      new_bird_count bigint,
      session_count bigint,
      total_effort interval,
      effort_per_session interval,
      effort_per_encounter interval,
      avg_encounters_per_session numeric,
      max_per_session bigint,
      max_new_per_session bigint,
      max_weight real,
      avg_weight numeric,
      min_weight real,
      median_weight numeric,
      max_wing smallint,
      avg_wing numeric,
      min_wing smallint,
      median_wing numeric,
      pullus_bird_count bigint,
      juv_bird_count bigint,
      postjuv_bird_count bigint,
      adult_bird_count bigint,
      unknown_age_bird_count bigint,
      new_young_bird_count bigint,
      pullus_enc_count bigint,
      juv_enc_count bigint,
      postjuv_enc_count bigint,
      adult_enc_count bigint,
      unknown_age_enc_count bigint,
      postjuv_juv_enc_count bigint,
      new_postjuv_juv_enc_count bigint,
      new_postjuv_enc_count bigint
    )
    ON CONFLICT (group_id, temporal_unit) WHERE species_id IS NULL AND time_period IS NULL
    DO UPDATE SET
      species_count = EXCLUDED.species_count,
      bird_count = EXCLUDED.bird_count,
      encounter_count = EXCLUDED.encounter_count,
      new_bird_count = EXCLUDED.new_bird_count,
      session_count = EXCLUDED.session_count,
      total_effort = EXCLUDED.total_effort,
      effort_per_session = EXCLUDED.effort_per_session,
      effort_per_encounter = EXCLUDED.effort_per_encounter,
      avg_encounters_per_session = EXCLUDED.avg_encounters_per_session,
      max_per_session = EXCLUDED.max_per_session,
      max_new_per_session = EXCLUDED.max_new_per_session,
      max_weight = EXCLUDED.max_weight,
      avg_weight = EXCLUDED.avg_weight,
      min_weight = EXCLUDED.min_weight,
      median_weight = EXCLUDED.median_weight,
      max_wing = EXCLUDED.max_wing,
      avg_wing = EXCLUDED.avg_wing,
      min_wing = EXCLUDED.min_wing,
      median_wing = EXCLUDED.median_wing,
      pullus_bird_count = EXCLUDED.pullus_bird_count,
      juv_bird_count = EXCLUDED.juv_bird_count,
      postjuv_bird_count = EXCLUDED.postjuv_bird_count,
      adult_bird_count = EXCLUDED.adult_bird_count,
      unknown_age_bird_count = EXCLUDED.unknown_age_bird_count,
      new_young_bird_count = EXCLUDED.new_young_bird_count,
      pullus_enc_count = EXCLUDED.pullus_enc_count,
      juv_enc_count = EXCLUDED.juv_enc_count,
      postjuv_enc_count = EXCLUDED.postjuv_enc_count,
      adult_enc_count = EXCLUDED.adult_enc_count,
      unknown_age_enc_count = EXCLUDED.unknown_age_enc_count,
      postjuv_juv_enc_count = EXCLUDED.postjuv_juv_enc_count,
      new_postjuv_juv_enc_count = EXCLUDED.new_postjuv_juv_enc_count,
      new_postjuv_enc_count = EXCLUDED.new_postjuv_enc_count;
  END IF;
END;
$function$;
GRANT ALL ON FUNCTION public.upsert_simple_stats_cache_rows(bigint, text, boolean, jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.upsert_simple_stats_cache_rows(bigint, text, boolean, jsonb) TO service_role;
ALTER TABLE public."ComplexStatsCache" ALTER COLUMN species_id DROP NOT NULL;
ALTER TABLE public."ComplexStatsCache" ALTER COLUMN time_period DROP NOT NULL;
ALTER TABLE public."SimpleStatsCache" ALTER COLUMN species_id DROP NOT NULL;
ALTER TABLE public."SimpleStatsCache" ALTER COLUMN time_period DROP NOT NULL;
COMMENT ON COLUMN public."ComplexStatsCache".species_id IS 'NULL means "all species combined" (the group_by_species=false shape of demographics_stats and every stats_cache_*_metrics RPC). Uniqueness across the NULL and non-NULL cases is split over four indexes — see the unique-index block in the table''s schema file.';
COMMENT ON COLUMN public."ComplexStatsCache".time_period IS 'NULL for the all-time grain (the group_by_time_period IS NULL shape of demographics_stats). Uniqueness across the NULL and non-NULL cases is split over four indexes — see the unique-index block in the table''s schema file.';
CREATE UNIQUE INDEX complex_stats_cache_group_period_allspecies_key ON public."ComplexStatsCache" (group_id, temporal_unit, time_period) WHERE species_id IS NULL AND time_period IS NOT NULL;
CREATE UNIQUE INDEX complex_stats_cache_group_alltime_allspecies_key ON public."ComplexStatsCache" (group_id, temporal_unit) WHERE species_id IS NULL AND time_period IS NULL;
CREATE UNIQUE INDEX complex_stats_cache_group_species_alltime_key ON public."ComplexStatsCache" (group_id, species_id, temporal_unit) WHERE species_id IS NOT NULL AND time_period IS NULL;
COMMENT ON COLUMN public."SimpleStatsCache".species_id IS 'NULL means "all species combined" (the group_by_species=false shape of core_stats/biometrics_stats/demographics_stats and every stats_cache_*_metrics RPC). Uniqueness across the NULL and non-NULL cases is split over four indexes — see the unique-index block in the table''s schema file.';
COMMENT ON COLUMN public."SimpleStatsCache".time_period IS 'NULL for the all-time grain (the group_by_time_period IS NULL shape of core_stats/biometrics_stats/demographics_stats). Uniqueness across the NULL and non-NULL cases is split over four indexes — see the unique-index block in the table''s schema file.';
CREATE UNIQUE INDEX simple_stats_cache_group_alltime_allspecies_key ON public."SimpleStatsCache" (group_id, temporal_unit) WHERE species_id IS NULL AND time_period IS NULL;
CREATE UNIQUE INDEX simple_stats_cache_group_period_allspecies_key ON public."SimpleStatsCache" (group_id, temporal_unit, time_period) WHERE species_id IS NULL AND time_period IS NOT NULL;
CREATE UNIQUE INDEX simple_stats_cache_group_species_alltime_key ON public."SimpleStatsCache" (group_id, species_id, temporal_unit) WHERE species_id IS NOT NULL AND time_period IS NULL;
