SET check_function_bodies = false;
CREATE FUNCTION public.merge_upsert_encounters(encounter_rows jsonb)
 RETURNS TABLE(id bigint, bird_id bigint, location_id bigint, visit_date date)
 LANGUAGE sql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
	WITH incoming AS (
		SELECT
			element.element_order,
			populated.*
		FROM jsonb_array_elements(encounter_rows)
			WITH ORDINALITY AS element (value, element_order),
			LATERAL jsonb_populate_record(NULL::public."Encounters", element.value) AS populated
	),
	-- The input batch may itself hold both halves of a duplicate pair (two rows
	-- of one chunk), and Postgres rejects a multi-row ON CONFLICT DO UPDATE that
	-- targets the same conflict key twice ("command cannot affect row a second
	-- time"), so same-batch duplicates are folded here first — by the same rule
	-- the ON CONFLICT clause below applies, so the rule lives in exactly one
	-- place.
	folded AS (
		SELECT
			i.bird_id,
			i.location_id,
			i.visit_date,
			(array_agg(i.session_id ORDER BY i.element_order DESC))[1] AS session_id,
			MIN(i.capture_time) AS capture_time,
			(array_remove(array_agg(i.record_type ORDER BY i.capture_time, i.element_order), NULL))[1] AS record_type,
			(array_remove(array_agg(i.age_code ORDER BY i.capture_time, i.element_order), NULL))[1] AS age_code,
			(array_remove(array_agg(i.breeding_condition ORDER BY i.capture_time, i.element_order), NULL))[1] AS breeding_condition,
			(array_remove(array_agg(i.capture_method ORDER BY i.capture_time, i.element_order), NULL))[1] AS capture_method,
			(array_remove(array_agg(i.extra_text ORDER BY i.capture_time, i.element_order), NULL))[1] AS extra_text,
			(array_remove(array_agg(i.fat ORDER BY i.capture_time, i.element_order), NULL))[1] AS fat,
			(array_remove(array_agg(i.finding_circumstances ORDER BY i.capture_time, i.element_order), NULL))[1] AS finding_circumstances,
			(array_remove(array_agg(i.finding_condition ORDER BY i.capture_time, i.element_order), NULL))[1] AS finding_condition,
			(array_remove(array_agg(i.is_juv ORDER BY i.capture_time, i.element_order), NULL))[1] AS is_juv,
			(array_remove(array_agg(i.moult_code ORDER BY i.capture_time, i.element_order), NULL))[1] AS moult_code,
			(array_remove(array_agg(i.old_greater_coverts ORDER BY i.capture_time, i.element_order), NULL))[1] AS old_greater_coverts,
			(array_remove(array_agg(i.pectoral_muscle ORDER BY i.capture_time, i.element_order), NULL))[1] AS pectoral_muscle,
			(array_remove(array_agg(i.primary_moult ORDER BY i.capture_time, i.element_order), NULL))[1] AS primary_moult,
			(array_remove(array_agg(i.scheme ORDER BY i.capture_time, i.element_order), NULL))[1] AS scheme,
			(array_remove(array_agg(i.sex ORDER BY i.capture_time, i.element_order), NULL))[1] AS sex,
			(array_remove(array_agg(i.sexing_method ORDER BY i.capture_time, i.element_order), NULL))[1] AS sexing_method,
			(array_remove(array_agg(i.weight ORDER BY i.capture_time, i.element_order), NULL))[1] AS weight,
			(array_remove(array_agg(i.wing_length ORDER BY i.capture_time, i.element_order), NULL))[1] AS wing_length
		FROM incoming i
		GROUP BY i.bird_id, i.location_id, i.visit_date
	)
	INSERT INTO public."Encounters" AS stored (
		bird_id,
		location_id,
		visit_date,
		session_id,
		capture_time,
		record_type,
		age_code,
		breeding_condition,
		capture_method,
		extra_text,
		fat,
		finding_circumstances,
		finding_condition,
		is_juv,
		moult_code,
		old_greater_coverts,
		pectoral_muscle,
		primary_moult,
		scheme,
		sex,
		sexing_method,
		weight,
		wing_length
	)
	SELECT
		f.bird_id,
		f.location_id,
		f.visit_date,
		f.session_id,
		f.capture_time,
		f.record_type,
		f.age_code,
		f.breeding_condition,
		f.capture_method,
		f.extra_text,
		f.fat,
		f.finding_circumstances,
		f.finding_condition,
		COALESCE(f.is_juv, FALSE),
		f.moult_code,
		f.old_greater_coverts,
		f.pectoral_muscle,
		f.primary_moult,
		f.scheme,
		f.sex,
		f.sexing_method,
		f.weight,
		f.wing_length
	FROM folded f
	-- Inserting in natural-key order means two concurrent calls holding
	-- overlapping keys always lock them in the same order and cannot deadlock —
	-- the same reason `EncounterRowBatchWriter.bulkUpsert` sorts its payload.
	ORDER BY f.bird_id, f.location_id, f.visit_date
	ON CONFLICT (bird_id, location_id, visit_date) DO UPDATE SET
		session_id = EXCLUDED.session_id,
		capture_time = LEAST(stored.capture_time, EXCLUDED.capture_time),
		record_type = CASE WHEN EXCLUDED.capture_time < stored.capture_time THEN COALESCE(EXCLUDED.record_type, stored.record_type) ELSE COALESCE(stored.record_type, EXCLUDED.record_type) END,
		age_code = CASE WHEN EXCLUDED.capture_time < stored.capture_time THEN COALESCE(EXCLUDED.age_code, stored.age_code) ELSE COALESCE(stored.age_code, EXCLUDED.age_code) END,
		breeding_condition = CASE WHEN EXCLUDED.capture_time < stored.capture_time THEN COALESCE(EXCLUDED.breeding_condition, stored.breeding_condition) ELSE COALESCE(stored.breeding_condition, EXCLUDED.breeding_condition) END,
		capture_method = CASE WHEN EXCLUDED.capture_time < stored.capture_time THEN COALESCE(EXCLUDED.capture_method, stored.capture_method) ELSE COALESCE(stored.capture_method, EXCLUDED.capture_method) END,
		extra_text = CASE WHEN EXCLUDED.capture_time < stored.capture_time THEN COALESCE(EXCLUDED.extra_text, stored.extra_text) ELSE COALESCE(stored.extra_text, EXCLUDED.extra_text) END,
		fat = CASE WHEN EXCLUDED.capture_time < stored.capture_time THEN COALESCE(EXCLUDED.fat, stored.fat) ELSE COALESCE(stored.fat, EXCLUDED.fat) END,
		finding_circumstances = CASE WHEN EXCLUDED.capture_time < stored.capture_time THEN COALESCE(EXCLUDED.finding_circumstances, stored.finding_circumstances) ELSE COALESCE(stored.finding_circumstances, EXCLUDED.finding_circumstances) END,
		finding_condition = CASE WHEN EXCLUDED.capture_time < stored.capture_time THEN COALESCE(EXCLUDED.finding_condition, stored.finding_condition) ELSE COALESCE(stored.finding_condition, EXCLUDED.finding_condition) END,
		is_juv = CASE WHEN EXCLUDED.capture_time < stored.capture_time THEN COALESCE(EXCLUDED.is_juv, stored.is_juv) ELSE COALESCE(stored.is_juv, EXCLUDED.is_juv) END,
		moult_code = CASE WHEN EXCLUDED.capture_time < stored.capture_time THEN COALESCE(EXCLUDED.moult_code, stored.moult_code) ELSE COALESCE(stored.moult_code, EXCLUDED.moult_code) END,
		old_greater_coverts = CASE WHEN EXCLUDED.capture_time < stored.capture_time THEN COALESCE(EXCLUDED.old_greater_coverts, stored.old_greater_coverts) ELSE COALESCE(stored.old_greater_coverts, EXCLUDED.old_greater_coverts) END,
		pectoral_muscle = CASE WHEN EXCLUDED.capture_time < stored.capture_time THEN COALESCE(EXCLUDED.pectoral_muscle, stored.pectoral_muscle) ELSE COALESCE(stored.pectoral_muscle, EXCLUDED.pectoral_muscle) END,
		primary_moult = CASE WHEN EXCLUDED.capture_time < stored.capture_time THEN COALESCE(EXCLUDED.primary_moult, stored.primary_moult) ELSE COALESCE(stored.primary_moult, EXCLUDED.primary_moult) END,
		scheme = CASE WHEN EXCLUDED.capture_time < stored.capture_time THEN COALESCE(EXCLUDED.scheme, stored.scheme) ELSE COALESCE(stored.scheme, EXCLUDED.scheme) END,
		sex = CASE WHEN EXCLUDED.capture_time < stored.capture_time THEN COALESCE(EXCLUDED.sex, stored.sex) ELSE COALESCE(stored.sex, EXCLUDED.sex) END,
		sexing_method = CASE WHEN EXCLUDED.capture_time < stored.capture_time THEN COALESCE(EXCLUDED.sexing_method, stored.sexing_method) ELSE COALESCE(stored.sexing_method, EXCLUDED.sexing_method) END,
		weight = CASE WHEN EXCLUDED.capture_time < stored.capture_time THEN COALESCE(EXCLUDED.weight, stored.weight) ELSE COALESCE(stored.weight, EXCLUDED.weight) END,
		wing_length = CASE WHEN EXCLUDED.capture_time < stored.capture_time THEN COALESCE(EXCLUDED.wing_length, stored.wing_length) ELSE COALESCE(stored.wing_length, EXCLUDED.wing_length) END
	RETURNING stored.id, stored.bird_id, stored.location_id, stored.visit_date;
$function$;
GRANT ALL ON FUNCTION public.merge_upsert_encounters(jsonb) TO anon;
GRANT ALL ON FUNCTION public.merge_upsert_encounters(jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.merge_upsert_encounters(jsonb) TO service_role;
