import { SPECIES_PAGE_BATCH_SIZE } from '@/app/constants';
import {
	enrichBird,
	type BirdOfSpecies,
	type EnrichedBirdOfSpecies
} from '@/app/models/bird';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';

export async function fetchPageOfBirds(species: string, page: number = 0) {
	const supabase = await getAuthenticatedSupabaseClient();
	const { id: speciesId } = (await supabase
		.from('Species')
		.select('id')
		.eq('species_name', species)
		.single()
		.then(catchSupabaseErrors)) as { id: number };
	if (!speciesId) {
		throw new Error(`Species ${species} not found`);
	}
	const paginatedBirdResults = (await supabase
		.from('Birds')
		.select(
			`
			id,
			ring_no,
			last_encountered_timestamp,
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
		.order('last_encountered_timestamp', { ascending: false })
		.range(
			page * SPECIES_PAGE_BATCH_SIZE,
			(page + 1) * SPECIES_PAGE_BATCH_SIZE - 1
		)
		.then(catchSupabaseErrors)) as BirdOfSpecies[];
	return paginatedBirdResults.map(enrichBird) as EnrichedBirdOfSpecies[];
}
