'use server';
import { SPECIES_PAGE_BATCH_SIZE } from '@/app/constants';
import {
	enrichBird,
	type BirdOfSpecies,
	type EnrichedBirdOfSpecies
} from '@/app/models/bird';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';

export async function fetchPageOfBirds(
	speciesId: number,
	groupId: number,
	page: number = 0
) {
	const supabase = await getAuthenticatedSupabaseClient();
	const paginatedBirdResults = (await supabase
		.from('Birds')
		.select(
			`id,
			ring_no,
			last_encountered_timestamp,
			ringing_group_ids,
			encounters:Encounters (
				id,
				capture_time,
				min_hatch_year,
				max_hatch_year,
				age_code,
				is_juv,
				record_type,
				sex,
				weight,
				wing_length,
				session:Sessions (
					id,
					visit_date
				)
			)`
		)
		.eq('species_id', speciesId)
		.contains('ringing_group_ids', [groupId])
		.order('last_encountered_timestamp', { ascending: false })
		.range(
			page * SPECIES_PAGE_BATCH_SIZE,
			(page + 1) * SPECIES_PAGE_BATCH_SIZE - 1
		)
		.then(catchSupabaseErrors)) as BirdOfSpecies[];
	return paginatedBirdResults.map(enrichBird) as EnrichedBirdOfSpecies[];
}
