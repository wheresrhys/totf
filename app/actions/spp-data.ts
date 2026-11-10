'use server';
import {
	fetchAuthorisedCoreStats,
	resolveStatsCacheQueryPlan,
	type AuthorisedStatsRow,
	type GroupSummaryAccessLevel,
	type StatsCacheQueryPlan
} from '@/app/lib/auth/group-summary-access';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import {
	BiometricStatNames,
	readStatsCacheRows,
	type BiometricsMetricsRow,
	type BiometricStatName,
	type StatsCacheBySpeciesResult
	// The client-safe barrel: this module is `'use server'`, but
	// `SppStatsTable` (`'use client'`) imports `fetchSpeciesData` out of it, so
	// it counts as reachable from a Client Component — see `modules/stats`'
	// CLAUDE.md's "Barrel split". Nothing here needs the server-only surface.
} from '@/modules/stats/browser';
import type { ViewedGroup } from '@/app/lib/group-slug';

/**
 * The 8 wing/weight columns of a stats cell, as a cache row carries them. The
 * column list itself comes from `modules/stats`' `BiometricStatNames` (#1214,
 * #1372) rather than the fourth local copy that used to live here: this is a
 * `'use server'` module, so every export of it must be an async function and a
 * shared `const` cannot live here — which is precisely why the list has to be
 * imported from elsewhere.
 */
type BiometricStats = Pick<StatsCacheBySpeciesResult, BiometricStatName>;

/**
 * The 4 count columns a cache row carries that
 * `stats_cache_basic_session_metrics` — the live-recompute source behind the
 * counts half of this page's arbitrary-window path — does not produce. Filled
 * with a placeholder `0` on that path only, for the same reason
 * `group-summary-access.ts`' `UNAVAILABLE_AGE_BUCKET_COLUMNS` fills the 10
 * age-bucket columns with one: `StatsCacheBySpeciesResult` requires every
 * column to be present, and nothing on this call path reads them — the
 * `/species` list page renders only `species_name`/`bird_count`/
 * `encounter_count`/`session_count`/`max_per_session` plus the 8 biometric
 * columns (`speciesStatConfigs`, `modules/stats-view/lib/species-stats.ts`).
 *
 * Deliberately a separate const from `UNAVAILABLE_AGE_BUCKET_COLUMNS` rather
 * than an extension of it: that one is owned by `group-summary-access.ts` and
 * is being extended by #1417. A future caller wanting a real value for any of
 * these four on an arbitrary window has the same obligation its doc comment
 * spells out — fetch the missing metric RPCs and merge them by `species_id` the
 * way `modules/stats/lib/refresh/merge-metric-rows.ts` does — rather than
 * reading the placeholder.
 *
 * Spread *before* the counts row below, so a cache-served row's own real
 * values win and the placeholder only fills a genuine gap.
 */
const UNAVAILABLE_NEW_YOUNG_COUNT_COLUMNS = {
	new_young_bird_count: 0,
	new_postjuv_enc_count: 0,
	new_postjuv_juv_enc_count: 0,
	postjuv_juv_enc_count: 0
} satisfies Pick<
	StatsCacheBySpeciesResult,
	| 'new_young_bird_count'
	| 'new_postjuv_enc_count'
	| 'new_postjuv_juv_enc_count'
	| 'postjuv_juv_enc_count'
>;

/**
 * The 8 biometric columns of one species' row, read off whatever source has
 * them — or all `null` when nothing does. `null` rather than absent because
 * `StatsCacheBySpeciesResult` declares all 8 present-but-nullable, which is
 * also the value a real cache cell carries for a species with no
 * biometric-eligible encounters (an empty `MAX`/`AVG`/`MIN`/`PERCENTILE_CONT`).
 */
function pickBiometricStats(
	source: Partial<BiometricStats> | undefined
): BiometricStats {
	return Object.fromEntries(
		BiometricStatNames.map((name) => [name, source?.[name] ?? null])
	) as BiometricStats;
}

/**
 * One `/species` row: a counts row with its biometric half applied over the
 * top. `species_id` is dropped — it is the pre-resolution form of the
 * `species_name` the counts row already carries, and `StatsCacheBySpeciesResult`
 * omits it for that reason.
 *
 * The biometric spread comes last and always writes all 8 columns, which is
 * what keeps them blank for a `'public'`/`'blocked'` viewer (#1231): the cache
 * read behind `fetchAuthorisedCoreStats` is a `select('*')`, so its rows carry
 * real wing/weight values at runtime even when the viewer isn't entitled to
 * see them. Blanking them used to happen as a side effect of
 * `mergeSpeciesBiometrics` copying only its biometrics half's 8 columns across;
 * with that merge gone it has to be explicit.
 */
function buildSpeciesRow(
	countsRow: AuthorisedStatsRow,
	biometrics: Partial<BiometricStats> | undefined
): StatsCacheBySpeciesResult {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to drop species_id
	const { species_id, ...counts } = countsRow;
	return {
		...UNAVAILABLE_NEW_YOUNG_COUNT_COLUMNS,
		...counts,
		...pickBiometricStats(biometrics)
	};
}

/**
 * Reads the already-materialized `SimpleStatsCacheBySpecies` cell `plan`
 * names — one whole row per species, counts and biometrics together, which is
 * the whole point: on this path both halves of the `/species` table are
 * columns of the same row and were never apart (#1372).
 *
 * **This is the second read of the same cache cell**, and knowingly so: on a
 * cache-aligned window `fetchAuthorisedCoreStats` has already issued the
 * identical `SimpleStatsCacheBySpecies` query for the counts half, and only
 * its `accessLevel` is used here. Collapsing the two means changing that
 * function's contract, which #1417 is already doing for other reasons, so
 * #1421 does the collapse afterwards rather than two tickets editing one
 * signature at once. Don't "fix" it by trusting the counts rows
 * unconditionally — see `buildSpeciesRow` on why the 8 biometric columns have
 * to be blanked for a `'public'`/`'blocked'` viewer.
 *
 * Everything the read needs — the `Species(species_name)` embed, flattening
 * that name back onto each row, the `group_id`/`temporal_unit`/`time_period`
 * filters, the `order=Species(species_name)` spelling an embedded to-one
 * ordering needs, and the pagination a group with more species than one
 * PostgREST page would otherwise be silently truncated by — belongs to
 * `readStatsCacheRows` (`modules/stats`), exactly as it does for
 * `app/actions/sp-data.ts`'s `fetchSpeciesStatsCacheRows` and
 * `group-summary-access.ts`' own `runStatsCacheRead`.
 *
 * Only `plan.temporalUnit`/`plan.timePeriod` can be set on a plan reaching
 * here, which is why `runStatsCacheRead`'s two row transforms have no
 * counterpart below: `fetchSpeciesRowsWithBiometrics` never passes
 * `group_by_time_period`, so `resolveStatsCacheQueryPlan` can only take one of
 * its *ungrouped* branches — all-time, a squashed calendar month, a whole
 * calendar year, or a whole calendar month — each of which is exactly one
 * cache cell per species. The range/`calendarMonth`/relabel fields belong to
 * the grouped-by-time-period branches alone; the range pair is still forwarded
 * so this read stays a faithful translation of any plan, but if this call site
 * ever starts grouping by time period, `calendarMonth` and
 * `relabelTimePeriodToYearStart` have to be handled here too.
 */
async function readWholeRowsFromStatsCache(
	viewedGroup: ViewedGroup,
	plan: StatsCacheQueryPlan
): Promise<StatsCacheBySpeciesResult[]> {
	// `readStatsCacheRows` select('*')s and leaves narrowing to its caller, so
	// name the row shape this read is known to produce here. A whole
	// `SimpleStatsCacheBySpecies` row is a structural superset of
	// `StatsCacheBySpeciesResult` — it also carries the bookkeeping columns the
	// result type omits, which no consumer reads by name.
	return (await readStatsCacheRows({
		viewedGroup,
		bySpecies: true,
		temporalUnit: plan.temporalUnit,
		// A plan carries either an exact cell or a range, never both — which is
		// also the one-of-the-two contract `readStatsCacheRows` applies.
		timePeriod: plan.timePeriod,
		fromDate: plan.fromTimePeriod,
		toDate: plan.toTimePeriod
	})) as StatsCacheBySpeciesResult[];
}

/**
 * The arbitrary-window fallback: the one window shape where the two halves of
 * this page genuinely come from two different sources, so they genuinely have
 * to be merged. `stats_cache_biometrics_metrics` recomputes the 8 wing/weight
 * columns live for the window, and each of its rows is applied onto the
 * matching counts row `fetchAuthorisedCoreStats` already recomputed from
 * `stats_cache_basic_session_metrics`.
 *
 * That RPC exists to feed the `SimpleStatsCacheBySpecies` write, but nothing
 * about it is cache-specific — it takes the same 8-arg window signature
 * `biometrics_stats` did and recomputes from `Encounters` on every call — so
 * it answers an uncacheable window just as correctly, and #1224 verified it as
 * an exact column-for-column drop-in. `group_by_time_period` is deliberately
 * not passed: this call site wants a single aggregate per species over the
 * whole window.
 *
 * **The merge keys on `species_id`, not `species_name`.** Both metrics RPCs
 * key on it (`stats_cache_biometrics_metrics_result` and
 * `stats_cache_basic_session_metrics_result` alike), and joining on an integer
 * FK beats joining on a display string. It is reachable here because
 * `runLiveMetricsRecompute` now keeps `species_id` on the rows it returns
 * (`AuthorisedStatsRow`) instead of discarding it once the name is resolved.
 *
 * Iterating the counts rows rather than the union of both sides is deliberate
 * and not a behaviour change: a biometrics row requires measurable encounters
 * and a counts row requires only encounters, over the same window — so the
 * biometrics species set is always a subset of the counts one, and the union
 * `mergeSpeciesBiometrics` keyed off was always just the counts set. A
 * biometrics row with no counts row is therefore a genuine anomaly, logged and
 * dropped rather than emitted as a row with an empty counts half.
 */
async function mergeLiveBiometricsIntoCountsRows(
	viewedGroup: ViewedGroup,
	countsRows: AuthorisedStatsRow[],
	fromDate?: string,
	toDate?: string,
	monthFilter?: number
): Promise<StatsCacheBySpeciesResult[]> {
	const client = await getAuthenticatedSupabaseClient();
	const biometricsRows = (await client
		.rpc('stats_cache_biometrics_metrics', {
			ringing_group_filter: viewedGroup.id,
			from_date: fromDate,
			to_date: toDate,
			group_by_species: true,
			...(monthFilter ? { month_filter: monthFilter } : {})
		})
		.then(catchSupabaseErrors)) as BiometricsMetricsRow[] | null;

	const biometricsBySpeciesId = new Map(
		(biometricsRows ?? []).flatMap((row) =>
			row.species_id === null ? [] : [[row.species_id, row] as const]
		)
	);
	const countsSpeciesIds = new Set(
		countsRows.flatMap(({ species_id }) =>
			species_id === null || species_id === undefined ? [] : [species_id]
		)
	);
	const unmatchedSpeciesIds = [...biometricsBySpeciesId.keys()].filter(
		(speciesId) => !countsSpeciesIds.has(speciesId)
	);
	if (unmatchedSpeciesIds.length > 0) {
		// Unreachable in principle — see this function's doc comment on why the
		// biometrics species set is a subset of the counts one. Dropping the
		// rows is still better than emitting a species row with no counts, so
		// log and move on.
		console.error(
			'Dropped stats_cache_biometrics_metrics rows whose species_id matched no counts row',
			{
				viewedGroupId: viewedGroup.id,
				speciesIds: unmatchedSpeciesIds,
				fromDate,
				toDate,
				monthFilter
			}
		);
	}

	return countsRows.map((countsRow) =>
		buildSpeciesRow(
			countsRow,
			countsRow.species_id === null || countsRow.species_id === undefined
				? undefined
				: biometricsBySpeciesId.get(countsRow.species_id)
		)
	);
}

// The /species list page's rows, split exactly the way its counts half
// (`fetchAuthorisedCoreStats`) is — same window, same resolver, same fallback,
// deliberately in lockstep (#1223):
//
// - A cache-aligned window (all time, a whole calendar year, a whole calendar
//   month, a squashed calendar month — i.e. the page's default and year-select
//   views) reads whole `SimpleStatsCacheBySpecies` rows directly, where the
//   post-import refresh queue has already materialized the counts and the 8
//   wing/weight columns side by side on one row.
// - An arbitrary window (the page's two free-text date inputs) has its
//   biometric half computed live instead, by `stats_cache_biometrics_metrics`
//   (#1244 — it used to be `biometrics_stats`, which nothing here calls any
//   more), and merged onto the counts half. `MAX`/`MIN` would survive being
//   recombined from finer cells, but `AVG`/`MEDIAN` are not associative:
//   `avg_weight`/`median_weight`/`avg_wing`/`median_wing` cannot be derived
//   from a set of narrower cache cells at all, not even approximately. A live
//   recompute is the only correct source for them outside a cache cell.
//
// Either way this needs an authenticated session to be meaningful: both reads
// go out as the viewer, and neither `stats_cache_biometrics_metrics` nor the
// cache tables' SELECT policy has a `public_areas` branch that would admit an
// anonymous caller. So it's only called once fetchAuthorisedCoreStats confirms
// an authenticated session actually resolved data ('own' or 'shared'); a
// 'blocked' or 'public' accessLevel contributes no biometrics.
//
// That 'public' case is now live rather than theoretical: the /species list
// page became anonymously viewable for a `public_areas: ['summary']` group
// (#1231), so an anonymous visitor sees the counts half of the table with the
// 8 wing/weight columns blank. Widening the biometrics half to match would
// mean publishing measurement data a group only opted its *summary* into, so
// it stays gated until `public_areas` grows a tag that says otherwise.
async function fetchSpeciesRowsWithBiometrics(
	viewedGroup: ViewedGroup,
	countsRows: AuthorisedStatsRow[],
	fromDate?: string,
	toDate?: string,
	monthFilter?: number
): Promise<StatsCacheBySpeciesResult[]> {
	const cacheQueryPlan = resolveStatsCacheQueryPlan({
		from_date: fromDate,
		to_date: toDate,
		month_filter: monthFilter
	});

	return cacheQueryPlan
		? readWholeRowsFromStatsCache(viewedGroup, cacheQueryPlan)
		: mergeLiveBiometricsIntoCountsRows(
				viewedGroup,
				countsRows,
				fromDate,
				toDate,
				monthFilter
			);
}

/**
 * `fetchSpeciesData`'s result alongside the `accessLevel` that served it —
 * for the one caller (the `/species` list page, #1232) that needs to know
 * whether the viewer can reach the arbitrary-window fallback (the two
 * free-text date inputs) at all. Every other caller
 * keeps using the rows-only `fetchSpeciesData` below, unaffected.
 */
export type SpeciesDataWithAccessLevel = {
	accessLevel: GroupSummaryAccessLevel;
	rows: StatsCacheBySpeciesResult[];
};

async function resolveSpeciesData(
	viewedGroup: ViewedGroup,
	fromDate?: string,
	toDate?: string,
	monthFilter?: number
): Promise<SpeciesDataWithAccessLevel> {
	const { accessLevel, rows: countsRows } = await fetchAuthorisedCoreStats(
		viewedGroup,
		{
			from_date: fromDate,
			to_date: toDate,
			group_by_species: true,
			...(monthFilter ? { month_filter: monthFilter } : {})
		}
	);

	if (accessLevel !== 'own' && accessLevel !== 'shared') {
		// No biometrics for this viewer at all — see
		// `fetchSpeciesRowsWithBiometrics`' comment. `buildSpeciesRow` is still
		// what produces the rows, because blanking the 8 columns the
		// cache-served counts rows carry at runtime is now explicit rather than
		// a side effect of a merge.
		return {
			accessLevel,
			rows: countsRows.map((countsRow) => buildSpeciesRow(countsRow, undefined))
		};
	}

	return {
		accessLevel,
		rows: await fetchSpeciesRowsWithBiometrics(
			viewedGroup,
			countsRows,
			fromDate,
			toDate,
			monthFilter
		)
	};
}

export async function fetchSpeciesData(
	viewedGroup: ViewedGroup,
	fromDate?: string,
	toDate?: string,
	monthFilter?: number
): Promise<StatsCacheBySpeciesResult[]> {
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
