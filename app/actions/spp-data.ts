'use server';
import {
	fetchAuthorisedCoreStats,
	resolveStatsCacheQueryPlan,
	type GroupSummaryAccessLevel,
	type StatsCacheQueryPlan
} from '@/app/lib/auth/group-summary-access';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { catchSupabaseErrors, fetchAllPaginatedRows } from '@/lib/supabase';
import type {
	BiometricFieldName,
	BiometricsStatsResult
} from '@/app/models/db';
import {
	mergeSpeciesBiometrics,
	type SpeciesStatsRow
} from '@/app/lib/species-stats';
import type { ViewedGroup } from '@/app/lib/group-slug';

/**
 * The 8 wing/weight columns `biometrics_stats` returns, every one of which
 * `SimpleStatsCacheBySpecies` carries under the same name. `species_name` is
 * on neither cache table (they key on a `species_id` FK), so it comes back
 * through an embedded `Species` select instead.
 *
 * A fourth local copy of a cache-column list, for the same reason the other
 * three are local: this is a `'use server'` module, so every export of it
 * must be an async function and a shared `const` cannot live here. #1214
 * tracks lifting all of them into a shared constants module.
 */
const BIOMETRIC_CACHE_COLUMNS: BiometricFieldName[] = [
	'max_weight',
	'avg_weight',
	'min_weight',
	'median_weight',
	'max_wing',
	'avg_wing',
	'min_wing',
	'median_wing'
];

/**
 * A `SimpleStatsCacheBySpecies` row as PostgREST returns it for the read
 * below: the 8 biometric columns plus the embedded species name. The embed is
 * a to-one relationship over a non-null `species_id` FK, so it always comes
 * back as a single object.
 */
type BiometricsCacheTableRow = Pick<
	BiometricsStatsResult,
	BiometricFieldName | 'encounter_count'
> & {
	Species: { species_name: string };
};

/**
 * Reads the already-materialized `SimpleStatsCacheBySpecies` cell `plan`
 * names — one row per species — and reshapes it into the
 * `BiometricsStatsResult` rows the live RPC used to return.
 *
 * Only `plan.temporalUnit`/`plan.timePeriod` are consulted, which is every
 * field the plans reaching here can carry: `fetchBiometricsStats` never
 * passes `group_by_time_period`, so `resolveStatsCacheQueryPlan` can only ever
 * take one of its *ungrouped* branches — all-time, a squashed calendar month,
 * a whole calendar year, or a whole calendar month — each of which is exactly
 * one cache cell per species and so sets at most a single `timePeriod`. The
 * range/`calendarMonth`/relabel fields belong to the grouped-by-time-period
 * branches alone; if this call site ever starts grouping by time period, they
 * have to be handled here too.
 *
 * `time_period` comes back `null` rather than the cell's own date, because
 * that is what the ungrouped RPC returned and the return shape is unchanged
 * on both paths. Nothing downstream reads it: `mergeSpeciesBiometrics`
 * (`app/lib/species-stats.ts`) joins on `species_name` and copies only the 8
 * metrics across.
 *
 * Paginated and ordered by the embedded species name — a group with more
 * species than one PostgREST page would otherwise be silently truncated here
 * while the counts half (`fetchAuthorisedCoreStats`, which pages the same
 * table) returned all of them, leaving the two halves of the same row set
 * misaligned. Ordering parent rows by an embedded to-one column needs
 * PostgREST's `order=Species(species_name)` spelling, NOT supabase-js'
 * `{referencedTable}` option — see `app/actions/stats-cache.ts`.
 */
async function readBiometricsFromStatsCache(
	viewedGroup: ViewedGroup,
	plan: StatsCacheQueryPlan
): Promise<BiometricsStatsResult[]> {
	const client = await getAuthenticatedSupabaseClient();
	const selectedColumns = [
		...BIOMETRIC_CACHE_COLUMNS,
		// The ninth column of `biometrics_stats_result`, carried verbatim by the
		// cache too. No consumer of these rows reads it, but the return shape is
		// unchanged on both paths and the RPC supplies it.
		'encounter_count',
		'Species(species_name)'
	].join(', ');

	const rows = await fetchAllPaginatedRows<BiometricsCacheTableRow>(
		(fromRow, toRow) => {
			// The select string is assembled at runtime, so supabase-js can't
			// infer the row shape from a string literal — name it explicitly.
			let filtered = client
				.from('SimpleStatsCacheBySpecies')
				.select<string, BiometricsCacheTableRow>(selectedColumns)
				.eq('group_id', viewedGroup.id)
				.eq('temporal_unit', plan.temporalUnit);
			if (plan.timePeriod) {
				filtered = filtered.eq('time_period', plan.timePeriod);
			}
			// `.order()` returns a transform builder no further filter can be
			// chained onto, so it comes after every filter.
			return filtered.order('Species(species_name)').range(fromRow, toRow);
		}
	);

	return rows.map(({ Species, ...biometrics }) => ({
		...biometrics,
		species_name: Species.species_name,
		time_period: null
	}));
}

// The /species list page's wing/weight half, split exactly the way its counts
// half (`fetchAuthorisedCoreStats`) is — same window, same resolver, same
// fallback, deliberately in lockstep (#1223):
//
// - A cache-aligned window (all time, a whole calendar year, a whole calendar
//   month, a squashed calendar month — i.e. the page's default and year-select
//   views) reads `SimpleStatsCacheBySpecies` directly, where the post-import
//   refresh queue has already materialized these 8 columns per species.
// - An arbitrary window (the page's "CES only" range and its two free-text
//   date inputs) keeps calling the live `biometrics_stats` RPC. `MAX`/`MIN`
//   would survive being recombined from finer cells, but `AVG`/`MEDIAN` are
//   not associative: `avg_weight`/`median_weight`/`avg_wing`/`median_wing`
//   cannot be derived from a set of narrower cache cells at all, not even
//   approximately. The live RPC is the only correct source for them outside a
//   cache cell.
//
// Either way this needs an authenticated session to be meaningful: both reads
// go out as the viewer, and neither `biometrics_stats` nor the cache tables'
// SELECT policy has a `public_areas` branch that would admit an anonymous
// caller. So it's only called once fetchAuthorisedCoreStats confirms an
// authenticated session actually resolved data ('own' or 'shared'); a
// 'blocked' or 'public' accessLevel contributes no biometrics rows.
//
// That 'public' case is now live rather than theoretical: the /species list
// page became anonymously viewable for a `public_areas: ['summary']` group
// (#1231), so an anonymous visitor sees the counts half of the table with the
// 8 wing/weight columns blank. Widening the biometrics half to match would
// mean publishing measurement data a group only opted its *summary* into, so
// it stays gated until `public_areas` grows a tag that says otherwise.
async function fetchBiometricsStats(
	viewedGroup: ViewedGroup,
	fromDate?: string,
	toDate?: string,
	monthFilter?: number
): Promise<BiometricsStatsResult[]> {
	const cacheQueryPlan = resolveStatsCacheQueryPlan({
		from_date: fromDate,
		to_date: toDate,
		month_filter: monthFilter
	});

	if (cacheQueryPlan) {
		return readBiometricsFromStatsCache(viewedGroup, cacheQueryPlan);
	}

	const client = await getAuthenticatedSupabaseClient();
	const rows = (await client
		.rpc('biometrics_stats', {
			ringing_group_filter: viewedGroup.id,
			from_date: fromDate,
			to_date: toDate,
			group_by_species: true,
			...(monthFilter ? { month_filter: monthFilter } : {})
		})
		.then(catchSupabaseErrors)) as BiometricsStatsResult[] | null;
	return rows ?? [];
}

/**
 * `fetchSpeciesData`'s result alongside the `accessLevel` that served it —
 * for the one caller (the `/species` list page, #1232) that needs to know
 * whether the viewer can reach the arbitrary-window fallback (the "CES only"
 * checkbox and its two free-text date inputs) at all. Every other caller
 * keeps using the rows-only `fetchSpeciesData` below, unaffected.
 */
export type SpeciesDataWithAccessLevel = {
	accessLevel: GroupSummaryAccessLevel;
	rows: SpeciesStatsRow[];
};

async function resolveSpeciesData(
	viewedGroup: ViewedGroup,
	fromDate?: string,
	toDate?: string,
	monthFilter?: number
): Promise<SpeciesDataWithAccessLevel> {
	const { accessLevel, rows } = await fetchAuthorisedCoreStats(viewedGroup, {
		from_date: fromDate,
		to_date: toDate,
		group_by_species: true,
		...(monthFilter ? { month_filter: monthFilter } : {})
	});

	const biometricsRows =
		accessLevel === 'own' || accessLevel === 'shared'
			? await fetchBiometricsStats(viewedGroup, fromDate, toDate, monthFilter)
			: [];

	return { accessLevel, rows: mergeSpeciesBiometrics(rows, biometricsRows) };
}

export async function fetchSpeciesData(
	viewedGroup: ViewedGroup,
	fromDate?: string,
	toDate?: string,
	monthFilter?: number
): Promise<SpeciesStatsRow[]> {
	const { rows } = await resolveSpeciesData(
		viewedGroup,
		fromDate,
		toDate,
		monthFilter
	);
	return rows;
}

/**
 * Same read as `fetchSpeciesData`, but surfaces the `accessLevel` that
 * `fetchAuthorisedCoreStats` resolved instead of discarding it — see
 * `SpeciesDataWithAccessLevel`'s doc comment for who needs this and why.
 */
export async function fetchSpeciesDataWithAccessLevel(
	viewedGroup: ViewedGroup,
	fromDate?: string,
	toDate?: string,
	monthFilter?: number
): Promise<SpeciesDataWithAccessLevel> {
	return resolveSpeciesData(viewedGroup, fromDate, toDate, monthFilter);
}
