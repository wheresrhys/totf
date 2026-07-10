'use server';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { EncounterOfBird } from '@/app/models/bird';

export async function fetchBirdEncounters(
	ringNo: string
): Promise<EncounterOfBird[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	const bird = await supabase
		.from('Birds')
		.select('id')
		.eq('ring_no', ringNo)
		.maybeSingle()
		.then(catchSupabaseErrors);

	if (!bird) {
		return [];
	}

	return supabase
		.from('Encounters')
		.select(
			`
			bird_id,
			id,
			age_code,
			breeding_condition,
			is_juv,
			capture_time,
			max_hatch_year,
			min_hatch_year,
			moult_code,
			record_type,
			sex,
			sexing_method,
			ringing_group_id,
			weight,
			wing_length,
			session:Sessions(
				visit_date
			)
		`
		)
		.eq('bird_id', bird.id)
		.then(catchSupabaseErrors) as Promise<EncounterOfBird[]>;
}
