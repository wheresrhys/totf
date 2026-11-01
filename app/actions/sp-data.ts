'use server';
import { SPECIES_PAGE_BATCH_SIZE } from '@/app/constants';
import {
	enrichBird,
	type BirdOfSpecies,
	type EnrichedBirdOfSpecies
} from '@/app/models/bird';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import { readStatsCacheRows } from '@/modules/stats';
import type { NotableRetrapsResult } from '@/app/models/db';
import { getSexOfBird, type EncounterOfBird } from '@/app/models/bird';
import type { GraphableBird } from '@/app/components/pages/species/WeightAndWingChart';
import type { SexedGraphableBird } from '@/app/components/pages/species/WeightAndWingChart';
import {
	type CoreStatsResult,
	type CoreStatsWithBiometrics,
	type DemographicsStatsResult,
	type ArrivalsStatsResult
} from '@/app/models/db';
import type { PeriodTotalsGrouping } from '@/app/lib/period-totals';
import type { TemporalUnit } from '@/modules/stats';
import { buildPageOfBirdsSelect } from '@/queries';
import type { ViewedGroup } from '@/app/lib/group-slug';

export async function fetchPageOfBirds(
	speciesId: number,
	viewedGroup: ViewedGroup,
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
		.contains('ringing_group_ids', [viewedGroup.id])
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
	viewedGroup: ViewedGroup,
	fromDate?: string,
	toDate?: string
): Promise<NotableRetrapsResult[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('notable_retraps', {
			ringing_group_filter: viewedGroup.id,
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
	viewedGroup: ViewedGroup,
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
		.contains('ringing_group_ids', [viewedGroup.id]);
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
 * conventional per-month history every caller started with; `'year'` fetches
 * the same stats already grouped by calendar year, which is *not*
 * the same as summing the monthly rows client-side: `bird_count` and the
 * per-bird bucket counts are `COUNT(DISTINCT bird_id)` within their cell, so a
 * bird retrapped in several months of one year would be counted once per month
 * by a client-side sum but exactly once by a year-grouped fetch (#852). Both
 * values are also literal `SimpleStatsCacheBySpecies.temporal_unit` values, so
 * they are passed straight through by the cache reads below.
 */
export type StatsHistoryInterval = 'month' | 'year';

/**
 * `time_period` is a `date` column, so PostgREST serialises it as
 * `YYYY-MM-DD` — read the calendar month straight off the middle component
 * rather than via `new Date(...)`, which would drag the server's timezone into
 * a pure calendar comparison.
 */
function calendarMonthOf(timePeriod: string): number {
	return Number(timePeriod.slice(5, 7));
}

/**
 * One `SimpleStatsCacheBySpecies` read for a single species — the shared read
 * path behind every species stats fetcher below (#1207) plus `page.tsx`'s
 * `getSpeciesStats` (#1222), replacing the live `core_stats`/`biometrics_stats`
 * aggregate queries each of them used to make with a single indexed table
 * read. Exported (rather than module-private) so `page.tsx` can call it
 * directly, same as every fetcher in this file already does.
 *
 * Since #1235 this is a thin species-flavoured adapter over
 * `readStatsCacheRows` (`app/actions/stats-cache.ts`) rather than its own
 * hand-rolled query: it mints the authenticated client, names the by-species
 * table via `bySpecies`, and narrows the generic reader's
 * `Record<string, unknown>[]` to whatever row type the caller asked for.
 * Everything the old implementation did itself now belongs to the reader —
 * the `!inner` `Species` embed that matches the species by *name* (the cache
 * keys on a `species_id` FK), flattening that embedded `species_name` back
 * onto every row, the `group_id`/`temporal_unit` equality filters, the
 * `from_date`/`to_date` → `time_period` range, and the ascending `time_period`
 * ordering every consumer (the history charts, the period-totals tables)
 * reads — so there is deliberately no post-processing left here.
 *
 * `includeBiometrics` is kept on the signature for its call sites but is a
 * no-op: the generic reader always `select('*')`s, so the 8 wing/weight
 * columns ride along on every row regardless. Rows therefore also carry the
 * raw cache columns a column-subset select used to omit (`id`, `group_id`,
 * `species_id`, `temporal_unit`) — a superset, which no consumer reads by
 * name.
 */
export async function fetchSpeciesStatsCacheRows<
	RowType extends CoreStatsResult = CoreStatsResult
>({
	speciesName,
	viewedGroup,
	temporalUnit,
	fromDate,
	toDate
}: {
	speciesName: string;
	viewedGroup: ViewedGroup;
	temporalUnit: TemporalUnit;
	fromDate?: string;
	toDate?: string;
	includeBiometrics?: boolean;
}): Promise<RowType[]> {
	return (await readStatsCacheRows({
		viewedGroup,
		bySpecies: true,
		species: speciesName,
		temporalUnit,
		fromDate,
		toDate
	})) as RowType[];
}

// Wing/weight + count history for a single species at `interval` granularity
// (monthly by default). This used to be two parallel RPC calls — `core_stats`
// for the counts and `biometrics_stats` for the 8 wing/weight fields (#821) —
// joined on `time_period` by `mergeBiometricsFields`, with a core row that had
// no matching biometrics row getting all 8 fields coalesced to null.
// `SimpleStatsCacheBySpecies` carries both halves on the same row, so there is
// exactly one source and nothing left to join: one cache read, no merge, and
// the per-cell nullability the biometric columns genuinely have (an empty
// MAX/AVG/MIN/PERCENTILE_CONT) is now carried by the row itself rather than
// synthesised from a missing sibling. `mergeBiometricsFields` is still the
// merge for the one remaining call site that fetches the two halves
// separately (`species-stats.ts`) — `page.tsx`'s `getSpeciesStats` moved onto
// this same cache read in #1222.
export async function getSpeciesStatsHistory(
	species: string,
	viewedGroup: ViewedGroup,
	fromDate?: string,
	toDate?: string,
	interval: StatsHistoryInterval = 'month'
): Promise<CoreStatsWithBiometrics[]> {
	return fetchSpeciesStatsCacheRows<CoreStatsWithBiometrics>({
		speciesName: species,
		viewedGroup,
		temporalUnit: interval,
		fromDate,
		toDate,
		includeBiometrics: true
	});
}

/**
 * Monthly demographics history for a single species — the
 * `demographics_stats` sibling of `getSpeciesStatsHistory`. #800 split these
 * derivations (the new-adult count and the 3J/postjuv young-trends counts;
 * #843 added the returning-age buckets) into their own RPC
 * (`population_stats`, renamed `demographics_stats` in #878) rather than
 * folding them into `core_stats`, so the "Demographics" tab's Returning ages,
 * Returning vs new, Young counts and New young counts tiles (#839 split the
 * original single Young trends tile into the latter two) fetch here while its
 * Counts tile keeps using `getSpeciesStatsHistory`. Same
 * call shape (species-filtered, `interval`-grouped, monthly by default) as
 * `getSpeciesStatsHistory`.
 */
export async function getSpeciesDemographicsStats(
	species: string,
	viewedGroup: ViewedGroup,
	fromDate?: string,
	toDate?: string,
	interval: StatsHistoryInterval = 'month'
) {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('demographics_stats', {
			species_name_filter: species,
			ringing_group_filter: viewedGroup.id,
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
	viewedGroup: ViewedGroup,
	fromDate?: string,
	toDate?: string,
	interval: StatsHistoryInterval = 'month'
): Promise<ArrivalsStatsResult[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('arrivals_stats', {
			species_name_filter: species,
			ringing_group_filter: viewedGroup.id,
			group_by_time_period: interval,
			...(fromDate ? { from_date: fromDate } : {}),
			...(toDate ? { to_date: toDate } : {})
		})
		.then(catchSupabaseErrors) as Promise<ArrivalsStatsResult[]>;
}

/**
 * Per-time-period totals for a single species — the species-scoped sibling of
 * `fetchPeriodTotals` (`app/actions/period-totals.ts`): the same per-period
 * counts, filtered to one species instead of grouped across all of them.
 * Feeds the species page's "Year totals" (all-time page), "Month totals"
 * (year-scoped page), and "Session totals" (all-time/year-scoped pages,
 * day-grouped) tabs via the shared `PeriodTotalsTable`.
 *
 * `timeInterval` is a literal `temporal_unit` value, and
 * `fromDate`/`toDate` a plain `time_period` range, so both go straight to
 * `fetchSpeciesStatsCacheRows`. `monthFilter` is the one argument with no
 * single-column equivalent — `time_period` is a `date` with no separate year
 * and month field, so "any year, this calendar month" isn't a filter
 * PostgREST can express — and it means two different things depending on the
 * grain it arrives with:
 *
 * - With `'day'` (the squashed-month route's "Session totals" tab, which can
 *   pass a date range at the same time), it narrows the day rows to the ones
 *   falling in that calendar month — a pure client-side filter over whatever
 *   the range filter already returned.
 * - With `'year'` (the squashed-month route's "Year totals" tab), `core_stats`
 *   used to return one row *per year* computed from that year's `monthFilter`
 *   sessions only. Scoped to a single calendar month of a single year, that
 *   cell is exactly the cache's own `(year, monthFilter)` `'month'` cell — so
 *   read the month grain instead and relabel each surviving row's
 *   `time_period` back to its year start, which keeps the year-grained rows
 *   (and the `YYYY-…` `time_period` their consumer slices the year out of)
 *   byte-identical to what the RPC returned.
 */
export async function fetchSpeciesPeriodTotals(
	speciesName: string,
	viewedGroup: ViewedGroup,
	timeInterval: PeriodTotalsGrouping,
	fromDate?: string,
	toDate?: string,
	monthFilter?: number
): Promise<CoreStatsResult[]> {
	const readsMonthGrainForYearTotals =
		timeInterval === 'year' && Boolean(monthFilter);
	const rows = await fetchSpeciesStatsCacheRows({
		speciesName,
		viewedGroup,
		temporalUnit: readsMonthGrainForYearTotals ? 'month' : timeInterval,
		fromDate,
		toDate
	});
	if (!monthFilter) {
		return rows;
	}
	const rowsInMonth = rows.filter(
		(row) => calendarMonthOf(row.time_period) === monthFilter
	);
	if (!readsMonthGrainForYearTotals) {
		return rowsInMonth;
	}
	return rowsInMonth.map((row) => ({
		...row,
		time_period: `${row.time_period.slice(0, 4)}-01-01`
	}));
}

// The single shared `params` shape for the species page's 6 `TabSet`-managed
// totals tabs (#1065 landed the first 3; #1066 appended the remaining 3) —
// `TabSet` forces one `ParamsType` across every tab in its array
// (app/components/shared/TabSet.tsx; a per-tab `ParamsType` was requested on
// #1058's PR review but never implemented), so this is a superset of
// whatever each dataFetcher below actually reads: `year` matters to
// `fetchMonthTotalsTabData`/`SpMonthTotalsTab` and the Highlights
// dataFetcher, `monthFilter` to `fetchSessionTotalsTabData`/
// `SpSessionTotalsTab` and (doubling as the squashed calendar month, the same
// value either way) `fetchSquashedMonthYearTotalsTabData`/
// `SpSquashedMonthYearTotalsTab`, and `month` only to the Highlights
// dataFetcher.
export type SpeciesTotalsTabParams = {
	speciesName: string;
	year?: number;
	month?: number;
	fromDate?: string;
	toDate?: string;
	monthFilter?: number;
};

/**
 * `TabConfig.dataFetcher`s (#1057) for the species page's Year/Month/Session
 * totals tabs (#1065) — thin wrappers around `fetchSpeciesPeriodTotals` above,
 * one per tab, matching `(params, viewedGroup) => Promise<DataType | null>`.
 * Live here rather than on the (`'use client'`) tab components themselves per
 * this repo's data-fetching convention (CLAUDE.md: data fetching happens in
 * server actions, never in client components) — `page.tsx`'s server-side
 * `prefetchActiveTabData` call and each tab's own `TabContent`-driven
 * client-side fetch both call the same function either way.
 */
export async function fetchYearTotalsTabData(
	params: SpeciesTotalsTabParams,
	viewedGroup: ViewedGroup
): Promise<CoreStatsResult[]> {
	return fetchSpeciesPeriodTotals(params.speciesName, viewedGroup, 'year');
}

export async function fetchMonthTotalsTabData(
	params: SpeciesTotalsTabParams,
	viewedGroup: ViewedGroup
): Promise<CoreStatsResult[]> {
	return fetchSpeciesPeriodTotals(
		params.speciesName,
		viewedGroup,
		'month',
		params.fromDate,
		params.toDate
	);
}

export async function fetchSessionTotalsTabData(
	params: SpeciesTotalsTabParams,
	viewedGroup: ViewedGroup
): Promise<CoreStatsResult[]> {
	return fetchSpeciesPeriodTotals(
		params.speciesName,
		viewedGroup,
		'day',
		params.fromDate,
		params.toDate,
		params.monthFilter
	);
}

/**
 * `TabConfig.dataFetcher` (#1066) for the squashed-month species page's own
 * "Year totals" tab — one row per year, scoped to a single calendar month
 * across the group's whole history. Thin wrapper around
 * `fetchSpeciesPeriodTotals`, same arguments/shape
 * `SpSquashedMonthYearTotalsTab`'s own handrolled `useEffect` fetch used
 * before this migration. Reuses `monthFilter` for the squashed calendar
 * month rather than adding a second field to `SpeciesTotalsTabParams` — it's
 * the same value `fetchSessionTotalsTabData` already reads for the same
 * purpose (a specific calendar month to scope sessions to).
 */
export async function fetchSquashedMonthYearTotalsTabData(
	params: SpeciesTotalsTabParams,
	viewedGroup: ViewedGroup
): Promise<CoreStatsResult[]> {
	return fetchSpeciesPeriodTotals(
		params.speciesName,
		viewedGroup,
		'year',
		undefined,
		undefined,
		params.monthFilter
	);
}

/**
 * One row per calendar month for a single species, summed across the group's
 * entire history — the `'month-squashed'` grain (#996), and the
 * species-scoped sibling of `fetchCombinedMonthTotals`
 * (`app/actions/summary-stats.ts`). Feeds the species page's "Month totals"
 * tab with "Combine years" on.
 *
 * No `time_period` range filter, since every `'month-squashed'` cache row
 * already spans the group's whole history (the same reasoning behind
 * `stats_spine`'s unconditional `month-squashed` branch) — the species and
 * grain filters are the whole query.
 */
export async function fetchSpeciesCombinedMonthTotals(
	speciesName: string,
	viewedGroup: ViewedGroup
): Promise<CoreStatsResult[]> {
	return fetchSpeciesStatsCacheRows({
		speciesName,
		viewedGroup,
		temporalUnit: 'month-squashed'
	});
}

// Data shape for the all-time species page's "Month totals" tab (#1066) —
// both the "Combine years OFF" per-(year, month) rows and the "ON" true
// cross-year aggregate per calendar month, fetched in parallel exactly as
// `SpCombinedMonthTotalsTab`'s own `useLazyTabData` call did before this
// migration.
export type SpCombinedMonthTotalsData = {
	monthlyStats: CoreStatsResult[];
	monthSquashedStats: CoreStatsResult[];
};

/**
 * `TabConfig.dataFetcher` (#1066) for the all-time species page's "Month
 * totals" tab — thin wrapper around `fetchSpeciesPeriodTotals` +
 * `fetchSpeciesCombinedMonthTotals`, same two parallel calls/arguments
 * `SpCombinedMonthTotalsTab`'s own `useLazyTabData` call made before this
 * migration.
 */
export async function fetchCombinedMonthTotalsTabData(
	params: SpeciesTotalsTabParams,
	viewedGroup: ViewedGroup
): Promise<SpCombinedMonthTotalsData> {
	const [monthlyStats, monthSquashedStats] = await Promise.all([
		fetchSpeciesPeriodTotals(params.speciesName, viewedGroup, 'month'),
		fetchSpeciesCombinedMonthTotals(params.speciesName, viewedGroup)
	]);
	return { monthlyStats, monthSquashedStats };
}
