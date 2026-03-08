import { SPECIES_PAGE_BATCH_SIZE } from '@/app/constants';
import {
	orderBirdsByRecency,
	enrichBird,
	type EncounterOfBird,
	type BirdOfSpecies,
	type EnrichedBirdOfSpecies
} from '@/app/models/bird';
import type { PaginatedBirdsResult } from '@/app/models/db';
import { supabase, catchSupabaseErrors } from '@/lib/supabase';

function convertPaginatedBirdResultsToBirds(
	paginatedBirdResults: PaginatedBirdsResult[]
): BirdOfSpecies[] {
	const birdsMap: Record<string, BirdOfSpecies> = {};
	paginatedBirdResults.forEach((result) => {
		if (!birdsMap[result.ring_no]) {
			birdsMap[result.ring_no] = {
				id: result.bird_id,
				ring_no: result.ring_no,
				encounters: [] as EncounterOfBird[]
			} as BirdOfSpecies;
		}
		birdsMap[result.ring_no].encounters.push({
			id: result.encounter_id,
			capture_time: result.capture_time,
			age_code: result.age_code,
			is_juv: result.is_juv,
			minimum_years: result.minimum_years,
			record_type: result.record_type,
			sex: result.sex,
			weight: result.weight,
			wing_length: result.wing_length,
			session: {
				id: result.session_id,
				visit_date: result.visit_date
			}
		} as EncounterOfBird);
	});
	return Object.values(birdsMap);
}

export async function fetchPageOfBirds(species: string, page: number = 0) {
	const paginatedBirdResults = (await supabase
		.rpc('paginated_birds_table', {
			species_name_param: species,
			result_limit: SPECIES_PAGE_BATCH_SIZE,
			result_offset: page * SPECIES_PAGE_BATCH_SIZE
		})
		.then(catchSupabaseErrors)) as PaginatedBirdsResult[];

	return orderBirdsByRecency<EnrichedBirdOfSpecies>(
		convertPaginatedBirdResultsToBirds(paginatedBirdResults).map(enrichBird),
		{
			direction: 'desc',
			type: 'last',
			encountersAlreadySorted: true
		}
	);
}
