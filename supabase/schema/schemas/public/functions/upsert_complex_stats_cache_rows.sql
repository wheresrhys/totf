-- The sole write path into "ComplexStatsCache" (#1162) — the exact mirror of
-- upsert_simple_stats_cache_rows, differing only in its target table and its
-- five lifetime-relative metric columns. See that function's header for the
-- full rationale: why this is an RPC rather than a native supabase-js .upsert()
-- (four partial unique indexes, which PostgREST's upsert API cannot name as a
-- conflict target), why one call carries exactly one null-pattern, why the four
-- branches are spelled out statically instead of built with EXECUTE format(),
-- why it is SECURITY INVOKER, and why it needs no plan_cache_mode override.
--
-- Keep the two in sync: a change to the branch structure, the guard or the
-- parameter list belongs in both files.
CREATE FUNCTION public.upsert_complex_stats_cache_rows (
	p_group_id bigint,
	p_temporal_unit text,
	p_group_by_species boolean,
	p_rows jsonb
) RETURNS void LANGUAGE plpgsql AS $function$
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

GRANT ALL ON FUNCTION public.upsert_complex_stats_cache_rows (bigint, text, boolean, jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.upsert_complex_stats_cache_rows (bigint, text, boolean, jsonb) TO service_role;
