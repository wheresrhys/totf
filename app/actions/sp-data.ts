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
import type { GraphableBird } from '@/app/components/pages/species/WeightAndWingChart';
import type { SexedGraphableBird } from '@/app/components/pages/species/WeightAndWingChart';
import type { AggregateStatsResult } from '@/app/models/db';
import type { PeriodTotalsGrouping } from '@/app/models/period-totals';
export async function fetchPageOfBirds(
	speciesId: number,
	viewedGroupId: number,
	page: number = 0,
	fromDate?: string,
	toDate?: string
) {
	const supabase = await getAuthenticatedSupabaseClient();
	// When a date range is supplied, inner-join the encounter (and its session) so
	// that only birds with at least one in-range encounter are returned, and only
	// their in-range encounters appear in the embedded array. The encounter's date
	// lives on its session (`visit_date`) — `Encounters.capture_time` is a
	// time-of-day only, so range filtering happens on `session.visit_date`.
	const hasDateRange = Boolean(fromDate || toDate);
	const encountersRelation = hasDateRange ? 'Encounters!inner' : 'Encounters';
	const sessionRelation = hasDateRange ? 'Sessions!inner' : 'Sessions';
	let query = supabase
		.from('Birds')
		.select(
			`id,
			ring_no,
			last_encountered_timestamp,
			ringing_group_ids,
			proven_age,
			encounters:${encountersRelation} (
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
				session:${sessionRelation} (
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
		);
	if (fromDate) {
		query = query.filter('encounters.session.visit_date', 'gte', fromDate);
	}
	if (toDate) {
		query = query.filter('encounters.session.visit_date', 'lte', toDate);
	}
	const paginatedBirdResults = (await query.then(
		catchSupabaseErrors
	)) as BirdOfSpecies[];
	return paginatedBirdResults.map(enrichBird) as EnrichedBirdOfSpecies[];
}

export async function fetchNotableRetraps(
	speciesName: string,
	viewedGroupId: number,
	fromDate?: string,
	toDate?: string
): Promise<NotableRetrapsResult[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('notable_retraps', {
			ringing_group_filter: viewedGroupId,
			species_filter: speciesName,
			result_limit: 10,
			min_proven_age: 3,
			min_encounter_count: 6,
			...(fromDate ? { from_date: fromDate } : {}),
			...(toDate ? { to_date: toDate } : {})
		})
		.then(catchSupabaseErrors) as Promise<NotableRetrapsResult[]>;
}

export async function fetchGraphableEncounterData(
	speciesId: number,
	viewedGroupId: number,
	fromDate?: string,
	toDate?: string
): Promise<SexedGraphableBird[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	// See `fetchPageOfBirds` for the inner-join + `session.visit_date` rationale:
	// range filtering keeps only birds with an in-range encounter, and prunes the
	// embedded array to just those encounters.
	const hasDateRange = Boolean(fromDate || toDate);
	// The date lives on the session, so when filtering we inner-join it into the
	// encounters embed purely to constrain on `visit_date` (the field is unused by
	// the graph itself).
	const encountersEmbed = hasDateRange
		? `encounters:Encounters!inner (
				age_code,
				is_juv,
				sex,
				weight,
				wing_length,
				session:Sessions!inner ( visit_date )
			)`
		: `encounters:Encounters (
				age_code,
				is_juv,
				sex,
				weight,
				wing_length
			)`;
	let query = supabase
		.from('Birds')
		.select(encountersEmbed)
		.eq('species_id', speciesId)
		.contains('ringing_group_ids', [viewedGroupId]);
	if (fromDate) {
		query = query.filter('encounters.session.visit_date', 'gte', fromDate);
	}
	if (toDate) {
		query = query.filter('encounters.session.visit_date', 'lte', toDate);
	}
	const paginatedBirdResults = (await query.then(
		catchSupabaseErrors
	)) as GraphableBird[];
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
	viewedGroupId: number,
	fromDate?: string,
	toDate?: string
) {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('aggregate_stats', {
			species_name_filter: species,
			ringing_group_filter: viewedGroupId,
			group_by_time_period: 'month',
			...(fromDate ? { from_date: fromDate } : {}),
			...(toDate ? { to_date: toDate } : {})
		})
		.then(catchSupabaseErrors) as Promise<AggregateStatsResult[]>;
}

/**
 * Per-time-period totals for a single species — the species-scoped sibling of
 * `fetchPeriodTotals` (`app/actions/period-totals.ts`): same `aggregate_stats`
 * call shape, but filtered to one species (`species_name_filter`) instead of
 * grouped across all of them (`group_by_species: false`). Feeds the species
 * page's "Year totals" (all-time page), "Month totals" (year-scoped page), and
 * "Session totals" (all-time/year-scoped pages, day-grouped) tabs via the
 * shared `PeriodTotalsTable`.
 */
export async function fetchSpeciesPeriodTotals(
	speciesName: string,
	viewedGroupId: number,
	grouping: PeriodTotalsGrouping,
	fromDate?: string,
	toDate?: string
): Promise<AggregateStatsResult[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('aggregate_stats', {
			...(fromDate ? { from_date: fromDate } : {}),
			...(toDate ? { to_date: toDate } : {}),
			ringing_group_filter: viewedGroupId,
			species_name_filter: speciesName,
			group_by_time_period: grouping
		})
		.then(catchSupabaseErrors) as Promise<AggregateStatsResult[]>;
}
