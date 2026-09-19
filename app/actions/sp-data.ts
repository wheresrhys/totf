'use server';
import { SPECIES_PAGE_BATCH_SIZE } from '@/app/constants';
import {
	enrichBird,
	type BirdOfSpecies,
	type EnrichedBirdOfSpecies
} from '@/app/models/bird';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import { fetchGroupEffortHistory } from '@/app/lib/underlying-stats';
import { postgresIntervalToHours } from '@/app/lib/postgres-interval';
import type { NotableRetrapsResult } from '@/app/models/db';
import { getSexOfBird, type EncounterOfBird } from '@/app/models/bird';
import type { GraphableBird } from '@/app/components/pages/species/WeightAndWingChart';
import type { SexedGraphableBird } from '@/app/components/pages/species/WeightAndWingChart';
import {
	mergeBiometricsFields,
	type CoreStatsResult,
	type CoreStatsWithBiometrics,
	type BiometricsStatsResult,
	type DemographicsStatsResult,
	type ArrivalsStatsResult
} from '@/app/models/db';
import type { PeriodTotalsGrouping } from '@/app/lib/period-totals';
import { buildPageOfBirdsSelect } from '@/queries';
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
	let query = supabase
		.from('Birds')
		.select(buildPageOfBirdsSelect(hasDateRange))
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

/**
 * Granularity of a species stats-history fetch. `'month'` (the default) is the
 * conventional per-month history every caller started with; `'year'` re-fetches
 * the same stats already grouped by calendar year at the RPC, which is *not*
 * the same as summing the monthly rows client-side: `core_stats`'
 * `bird_count` and `demographics_stats`' per-bird bucket counts are
 * `COUNT(DISTINCT bird_id)` within their cell, so a bird retrapped in several
 * months of one year would be counted once per month by a client-side sum but
 * exactly once by a year-grouped fetch (#852).
 */
export type StatsHistoryInterval = 'month' | 'year';

// Wing/weight + count history for a single species at `interval` granularity
// (monthly by default), merging
// biometrics_stats' wing/weight fields onto each core_stats row (#821).
// The two RPCs share the same species/group/date-range/group_by_time_period
// params, so their rows are grouped identically and joined here on
// `time_period` (rather than assumed to line up positionally) — a period
// present on one side but not the other is handled by the merge below: an
// core_stats row with no matching biometrics_stats row still gets all 8
// biometric fields, coalesced to null by mergeBiometricsFields (matching the
// null columns core_stats returned before #827 removed them), and a
// biometrics_stats row with no matching core_stats row is simply not
// included in the output (the output shape is driven by core_stats).
export async function getSpeciesStatsHistory(
	species: string,
	viewedGroupId: number,
	fromDate?: string,
	toDate?: string,
	interval: StatsHistoryInterval = 'month'
): Promise<CoreStatsWithBiometrics[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	const rpcArgs = {
		species_name_filter: species,
		ringing_group_filter: viewedGroupId,
		group_by_time_period: interval,
		...(fromDate ? { from_date: fromDate } : {}),
		...(toDate ? { to_date: toDate } : {})
	};
	const [aggregateRows, biometricsRows] = await Promise.all([
		supabase.rpc('core_stats', rpcArgs).then(catchSupabaseErrors) as Promise<
			CoreStatsResult[]
		>,
		supabase
			.rpc('biometrics_stats', rpcArgs)
			.then(catchSupabaseErrors) as Promise<BiometricsStatsResult[]>
	]);
	const biometricsRowsByPeriod = new Map(
		biometricsRows.map((row) => [row.time_period, row])
	);
	return aggregateRows.map((aggregateRow) =>
		mergeBiometricsFields(
			aggregateRow,
			biometricsRowsByPeriod.get(aggregateRow.time_period)
		)
	);
}

/**
 * Monthly age-split + young-trends history for a single species — the
 * `demographics_stats` sibling of `getSpeciesStatsHistory`. #800 split these
 * derivations (new-adult/first-summer/old-timer age split, and the 3J/postjuv
 * young-trends counts) into their own RPC (`population_stats`, renamed
 * `demographics_stats` in #878) rather than folding them into
 * `core_stats`, so the "Demographics" tab's Age split, Young counts and
 * New young counts tiles (#839 split the original single Young trends tile
 * into the latter two) fetch here while its Counts tile keeps using
 * `getSpeciesStatsHistory`. Same
 * call shape (species-filtered, `interval`-grouped, monthly by default) as
 * `getSpeciesStatsHistory`.
 */
export async function getSpeciesDemographicsStats(
	species: string,
	viewedGroupId: number,
	fromDate?: string,
	toDate?: string,
	interval: StatsHistoryInterval = 'month'
) {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('demographics_stats', {
			species_name_filter: species,
			ringing_group_filter: viewedGroupId,
			group_by_time_period: interval,
			...(fromDate ? { from_date: fromDate } : {}),
			...(toDate ? { to_date: toDate } : {})
		})
		.then(catchSupabaseErrors) as Promise<DemographicsStatsResult[]>;
}

/**
 * Monthly arrivals history for a single species — the `arrivals_stats`
 * sibling of `getSpeciesStatsHistory`/`getSpeciesDemographicsStats` (#858).
 * Counts each bird once per calendar year, at its first classifiable
 * encounter of that year, bucketed into `new_adult`/`returning_adult`/
 * `pullus`/`juv`/`postjuv` — feeds the "Demographics" tab's Arrivals tile
 * (#860). Same call shape (species-filtered, `interval`-grouped, monthly by
 * default) as its two siblings.
 */
export async function getSpeciesArrivalsStats(
	species: string,
	viewedGroupId: number,
	fromDate?: string,
	toDate?: string,
	interval: StatsHistoryInterval = 'month'
): Promise<ArrivalsStatsResult[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('arrivals_stats', {
			species_name_filter: species,
			ringing_group_filter: viewedGroupId,
			group_by_time_period: interval,
			...(fromDate ? { from_date: fromDate } : {}),
			...(toDate ? { to_date: toDate } : {})
		})
		.then(catchSupabaseErrors) as Promise<ArrivalsStatsResult[]>;
}

/**
 * Group-wide (not species-filtered) monthly ringing-effort history for the
 * species page's Demographics/Biometrics tabs — effort is a property of a
 * session, not of the species caught in it, so this wraps
 * `fetchGroupEffortHistory` (`lib/underlying-stats.ts`, cached across both
 * tabs within a session) rather than filtering by species. Shapes the raw
 * `total_effort` interval into fractional hours and pairs it with
 * `time_period`, matching the `[time_period, value]` tuple shape
 * `YearComparisonTrendChart`'s existing series already use (see
 * `getCounts`/`getReturningAges` in
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
 * `fetchPeriodTotals` (`app/actions/period-totals.ts`): same `core_stats`
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
): Promise<CoreStatsResult[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('core_stats', {
			...(fromDate ? { from_date: fromDate } : {}),
			...(toDate ? { to_date: toDate } : {}),
			ringing_group_filter: viewedGroupId,
			species_name_filter: speciesName,
			group_by_time_period: timeInterval
		})
		.then(catchSupabaseErrors) as Promise<CoreStatsResult[]>;
}
