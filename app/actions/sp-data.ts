'use server';
import { SPECIES_PAGE_BATCH_SIZE } from '@/app/constants';
import {
	enrichBird,
	type BirdOfSpecies,
	type EnrichedBirdOfSpecies
} from '@/app/models/bird';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import { fetchGroupEffortHistory } from '@/lib/underlying-stats';
import { postgresIntervalToHours } from '@/lib/postgres-interval';
import type { NotableRetrapsResult } from '@/app/models/db';
import { getSexOfBird, type EncounterOfBird } from '@/app/models/bird';
import type { GraphableBird } from '@/app/components/pages/species/WeightAndWingChart';
import type { SexedGraphableBird } from '@/app/components/pages/species/WeightAndWingChart';
import type {
	AggregateStatsResult,
	PopulationStatsResult
} from '@/app/models/db';
import type { PeriodTotalsGrouping } from '@/app/models/period-totals';
import { getTopPeriodsByMetric } from '@/app/actions/top-performers';
import type { TopMetricsFilterParams, TopPeriodsResult } from '@/app/models/db';
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

/**
 * The species page's "Busiest sessions" section (Highlights tab) — the top 5
 * sessions by encounter count for this species, optionally scoped to a
 * year/month. Reuses `getTopPeriodsByMetric` with the same
 * day/encounters/limit-5 shape the headline stats' "Top sessions" line used
 * before #782 moved it into the Highlights tab.
 */
export async function fetchTopSessions(
	speciesName: string,
	viewedGroupId: number,
	year?: number,
	month?: number
): Promise<TopPeriodsResult[]> {
	return getTopPeriodsByMetric({
		temporal_unit: 'day',
		metric_name: 'encounters',
		filters: {
			species_filter: speciesName,
			ringing_group_filter: viewedGroupId,
			...(year !== undefined ? { year_filter: year } : {}),
			...(month !== undefined ? { month_filter: month } : {})
		} as TopMetricsFilterParams,
		result_limit: 5
	}) as Promise<TopPeriodsResult[]>;
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
 * Monthly age-split + young-trends history for a single species — the
 * `population_stats` sibling of `getSpeciesStatsHistory`. #800 split these
 * derivations (new-adult/first-summer/old-timer age split, and the 3J/postjuv
 * young-trends counts) into their own RPC rather than folding them into
 * `aggregate_stats`, so the "Population" tab's Age split, Young counts and New
 * young counts tiles (#839 split the original single Young trends tile into
 * the latter two) fetch here while its Counts tile keeps using
 * `getSpeciesStatsHistory`. Same
 * call shape (species-filtered, month-grouped) as `getSpeciesStatsHistory`.
 */
export async function getSpeciesPopulationStats(
	species: string,
	viewedGroupId: number,
	fromDate?: string,
	toDate?: string
) {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('population_stats', {
			species_name_filter: species,
			ringing_group_filter: viewedGroupId,
			group_by_time_period: 'month',
			...(fromDate ? { from_date: fromDate } : {}),
			...(toDate ? { to_date: toDate } : {})
		})
		.then(catchSupabaseErrors) as Promise<PopulationStatsResult[]>;
}

/**
 * Group-wide (not species-filtered) monthly ringing-effort history for the
 * species page's Population/Biometrics tabs — effort is a property of a
 * session, not of the species caught in it, so this wraps
 * `fetchGroupEffortHistory` (`lib/underlying-stats.ts`, cached across both
 * tabs within a session) rather than filtering by species. Shapes the raw
 * `total_effort` interval into fractional hours and pairs it with
 * `time_period`, matching the `[time_period, value]` tuple shape
 * `YearComparisonTrendChart`'s existing series already use (see
 * `getCounts`/`getYoungsters` in
 * `app/components/pages/species/StatsHistoryChart.tsx`), so it can be zipped
 * against a species-filtered series by `time_period`.
 */
export async function getGroupEffortHistory(
	viewedGroupId: number
): Promise<[string, number][]> {
	const statsHistory = await fetchGroupEffortHistory(viewedGroupId);
	if (!statsHistory) return [];
	return statsHistory.map((row): [string, number] => [
		row.time_period,
		postgresIntervalToHours(row.total_effort)
	]);
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
	timeInterval: PeriodTotalsGrouping,
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
			group_by_time_period: timeInterval
		})
		.then(catchSupabaseErrors) as Promise<AggregateStatsResult[]>;
}
