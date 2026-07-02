'use server';
import { SPECIES_PAGE_BATCH_SIZE } from '@/app/constants';
import {
	enrichBird,
	type BirdOfSpecies,
	type EnrichedBirdOfSpecies
} from '@/app/models/bird';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { NotableRetrapsResult } from '@/app/models/db';
import { getSexOfBird, type EncounterOfBird } from '@/app/models/bird';
import type { GraphableBird } from '@/app/components/WeightAndWingChart';
import type { SexedGraphableBird } from '@/app/components/WeightAndWingChart';
import type { AggregateStatsRow } from '@/app/models/db';
export async function fetchPageOfBirds(
	speciesId: number,
	viewedGroupId: number,
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
			proven_age,
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
		.contains('ringing_group_ids', [viewedGroupId])
		.order('last_encountered_timestamp', { ascending: false })
		.range(
			page * SPECIES_PAGE_BATCH_SIZE,
			(page + 1) * SPECIES_PAGE_BATCH_SIZE - 1
		)
		.then(catchSupabaseErrors)) as BirdOfSpecies[];
	return paginatedBirdResults.map(enrichBird) as EnrichedBirdOfSpecies[];
}

export async function fetchNotableRetraps(
	speciesName: string,
	viewedGroupId: number
): Promise<NotableRetrapsResult[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('notable_retraps', {
			ringing_group_filter: viewedGroupId,
			species_filter: speciesName,
			result_limit: 10,
			min_proven_age: 3,
			min_encounter_count: 6
		})
		.then(catchSupabaseErrors) as Promise<NotableRetrapsResult[]>;
}

export async function fetchGraphableEncounterData(
	speciesId: number,
	viewedGroupId: number
): Promise<SexedGraphableBird[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	const paginatedBirdResults = (await supabase
		.from('Birds')
		.select(
			`encounters:Encounters (
				age_code,
				sex,
				weight,
				wing_length
			)`
		)
		.eq('species_id', speciesId)
		.contains('ringing_group_ids', [viewedGroupId])
		.then(catchSupabaseErrors)) as GraphableBird[];
	return paginatedBirdResults.map(
		(bird) =>
			({
				...bird,
				...getSexOfBird(bird.encounters as EncounterOfBird[])
			}) as SexedGraphableBird
	);
}

export async function getSpeciesStatsHistory(
	species: string,
	viewedGroupId: number
) {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('aggregate_stats', {
			species_name_filter: species,
			ringing_group_filter: viewedGroupId,
			group_by_time_period: 'month'
		})
		.then(catchSupabaseErrors) as Promise<AggregateStatsRow[]>;
}
