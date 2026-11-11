import type { StatsCacheBySpeciesResult } from '@/modules/stats/browser';
import alphaBySpeciesSnapshot from '@/test-fixtures/snapshots/tables/SimpleStatsCacheBySpecies/alpha.by-species.json';
import betaBySpeciesSnapshot from '@/test-fixtures/snapshots/tables/SimpleStatsCacheBySpecies/beta.by-species.json';
import gammaBySpeciesSnapshot from '@/test-fixtures/snapshots/tables/SimpleStatsCacheBySpecies/gamma.by-species.json';
import alphaSummaryTotalsSnapshot from '@/test-fixtures/snapshots/tables/SimpleStatsCache/alpha.summary-totals.json';
import alphaHomePageSummarySnapshot from '@/test-fixtures/snapshots/tables/SimpleStatsCache/alpha.home-page-summary.json';
import robinAlphaHeadlineSnapshot from '@/test-fixtures/snapshots/tables/SimpleStatsCacheBySpecies/robin-alpha.headline.json';

/**
 * A `StatsCacheBySpeciesResult` row fixture: flat overrides merged over sensible
 * defaults, covering every column the now-deleted `core_stats` RPC
 * returned (`modules/stats`' `StatsCacheBySpeciesResult` — the
 * `SimpleStatsCacheBySpecies` row minus bookkeeping — is the type that shape
 * now lives in, #1244/#1372) plus the 8
 * `max_weight`/`avg_weight`/`min_weight`/`median_weight`/`max_wing`/
 * `avg_wing`/`min_wing`/`median_wing` fields several call sites override,
 * which that type carries on the same row (#1372 — they used to come from a
 * separate `biometrics_stats` source, #827). Coerced via
 * `as StatsCacheBySpeciesResult` rather than constructing a full-fat instance, per this
 * repo's fixture-builder convention.
 *
 * Was independently hand-rolled ~13 times across test files
 * (`buildStat`/`buildAggregateRow`/`buildDayStat`/`buildYearlyStat`/
 * `buildMonthlyStat`/`buildDailyStat`) — see `reports/test-quality.md`'s
 * duplicated-stats-row-fixture-builders finding. A caller relying on a
 * specific default value from one of those local builders (rather than just
 * overriding the field it cares about) should pass that value explicitly as
 * an override here instead of forking this builder.
 */
export function buildCoreStatsRow(
	overrides: Partial<StatsCacheBySpeciesResult> = {}
): StatsCacheBySpeciesResult {
	return {
		species_name: null,
		time_period: '2026-01-01',
		session_count: 4,
		avg_encounters_per_session: 1.75,
		max_per_session: 3,
		species_count: 12,
		bird_count: 40,
		encounter_count: 55,
		new_bird_count: 30,
		max_new_per_session: 3,
		max_weight: 13.1,
		avg_weight: 11.2,
		min_weight: 9.8,
		median_weight: 10.8,
		max_wing: 68,
		avg_wing: 66.6,
		min_wing: 65,
		median_wing: 67,
		pullus_bird_count: 2,
		juv_bird_count: 5,
		postjuv_bird_count: 3,
		adult_bird_count: 15,
		unknown_age_bird_count: 5,
		pullus_enc_count: 2,
		juv_enc_count: 3,
		postjuv_enc_count: 1,
		adult_enc_count: 1,
		unknown_age_enc_count: 0,
		// The four young/postjuv transition counts both cache tables carry
		// (#1417) — absent from this literal for as long as `StatsCacheBySpeciesResult` was
		// a hand-maintained 21-column type that didn't declare them, so a
		// "whole row" fixture was in fact four columns short at runtime.
		new_young_bird_count: 8,
		new_postjuv_enc_count: 2,
		new_postjuv_juv_enc_count: 1,
		postjuv_juv_enc_count: 3,
		...overrides
	} as StatsCacheBySpeciesResult;
}

/**
 * `buildCoreStatsRow` with a day-shaped `time_period` default, for tests
 * building a "session totals" (day-grouped) row without caring about the
 * exact date — pass `time_period` as an override to set a specific date.
 */
export function buildDailyStatsRow(
	overrides: Partial<StatsCacheBySpeciesResult> = {}
): StatsCacheBySpeciesResult {
	return buildCoreStatsRow({ time_period: '2026-08-16', ...overrides });
}

// Every count/effort column zeroed out, for a calendar month with no sessions
// in any year of a group's history — the shape a real `'month-squashed'`
// `group_by_time_period` (#996) row has for such a month.
const ZERO_MONTH_SQUASHED_STATS: Partial<StatsCacheBySpeciesResult> = {
	session_count: 0,
	avg_encounters_per_session: 0,
	max_per_session: 0,
	species_count: 0,
	bird_count: 0,
	encounter_count: 0,
	new_bird_count: 0,
	max_new_per_session: 0,
	pullus_bird_count: 0,
	juv_bird_count: 0,
	postjuv_bird_count: 0,
	adult_bird_count: 0,
	unknown_age_bird_count: 0,
	...({
		pullus_enc_count: 0,
		juv_enc_count: 0,
		postjuv_enc_count: 0,
		adult_enc_count: 0,
		unknown_age_enc_count: 0
	} as Partial<StatsCacheBySpeciesResult>)
};

/**
 * A realistic 12-row `core_stats` `group_by_time_period: 'month-squashed'`
 * (#996) fixture — one row per calendar month (sentinel `time_period`
 * `2000-<mm>-01`), all-zero except the 1-indexed months named in
 * `overridesByMonth`. Mirrors the RPC's own density guarantee
 * (`stats_spine`'s unconditional `generate_series(1, 12)`), which
 * `buildCombinedMonthTotalsRows` (`app/lib/month-totals.ts`) now trusts
 * rather than zero-filling client-side — a mock for this RPC call should
 * return 12 rows just like the real one does.
 */
export function buildMonthSquashedFixture(
	overridesByMonth: Partial<
		Record<number, Partial<StatsCacheBySpeciesResult>>
	> = {}
): StatsCacheBySpeciesResult[] {
	return Array.from({ length: 12 }, (_unused, index) => {
		const month = index + 1;
		return buildCoreStatsRow({
			time_period: `2000-${String(month).padStart(2, '0')}-01`,
			...ZERO_MONTH_SQUASHED_STATS,
			...overridesByMonth[month]
		});
	});
}

/**
 * Snapshot-backed `StatsCacheBySpeciesResult` row fixtures — one type now covers
 * both the count and the wing/weight halves these used to need two types for —
 * built from the generated `tables/SimpleStatsCache{,BySpecies}` snapshots
 * (#1244 — the real current source for every row that used to come from a
 * live `core_stats` RPC call, which has no remaining app call site). Follows
 * the same pattern `biometrics-stats-fixtures.ts` already established: the
 * generator writes the raw, verbatim table row (`Species` embed intact on a
 * by-species read, per the "no compound fixtures" rule — the join lives
 * here, not in the generator), and this module resolves it into the shape
 * production code actually works with.
 *
 * Unlike the old `core_stats`-RPC fixtures, a by-species row here already
 * carries the 8 biometric columns (`SimpleStatsCacheBySpecies` has them on
 * every row, #1222) — no separate merge against a biometrics fixture is
 * needed for these exports.
 */

/**
 * Resolves a raw `SimpleStatsCacheBySpecies` snapshot row (with its `Species`
 * embed intact) into a `StatsCacheBySpeciesResult` row — the embed's
 * `species_name` flattened on, matching what `readStatsCacheRows` does for a
 * real by-species read. The row's extra cache-only columns (`id`, `group_id`,
 * `species_id`, `temporal_unit`, `created_at`, `updated_at`) ride along
 * unread, the same superset `fetchSpeciesStatsCacheRows`' own doc comment
 * describes for the real read path.
 *
 * `modules/stats`' whole-cache-row `StatsCacheBySpeciesResult` since #1415,
 * rather than the narrower merged-row type this used to return: the snapshot is
 * a verbatim cache row, so it genuinely carries the four
 * `new_young_bird_count`/`new_postjuv_*`/`postjuv_juv_enc_count` columns that
 * narrower type omitted, and `fetchSpeciesData` now returns whole rows.
 */
function resolveBySpeciesRow(
	row: { Species: { species_name: string } } & Record<string, unknown>
): StatsCacheBySpeciesResult {
	const { Species, ...rest } = row;
	return {
		...rest,
		species_name: Species.species_name
	} as StatsCacheBySpeciesResult;
}

/**
 * Resolves a raw `SimpleStatsCache` (all-species-combined) snapshot row into
 * a `StatsCacheBySpeciesResult` — `species_name: null`, matching what the real
 * all-species read path returns (the table carries no species relationship
 * to flatten at all).
 */
function resolveAllSpeciesRow(
	row: Record<string, unknown>
): StatsCacheBySpeciesResult {
	// Two independent reasons the double assertion can't be downgraded here
	// (both re-probed in #1419, which deleted the last of the stale aliases):
	// spreading a bare index signature contributes no named properties at all,
	// so the literal is `{ species_name: null }` as far as `tsc` is concerned
	// and fails the "sufficient overlap" check against all 31 of the row type's
	// columns — even though every one of them is there at runtime; and the
	// honest `species_name: null` contradicts this type's `species_name: string`
	// anyway. The second half is the compiler-invisible grain lie #1424 fixes by
	// making the read path generic on `group_by_species`; until then these
	// all-species-combined exports have to borrow the by-species type, because
	// that is what `fetchAuthorisedCoreStats` still declares it returns.
	// eslint-disable-next-line no-restricted-syntax -- see comment above
	return { ...row, species_name: null } as unknown as StatsCacheBySpeciesResult;
}

/**
 * Alpha/Beta/Gamma's whole by-species result, one row per species — powers
 * `fetchSpeciesData`'s cache-aligned windows (the `/species` list page's
 * default and year-select views).
 */
export const ALPHA_CORE_STATS_BY_SPECIES: StatsCacheBySpeciesResult[] =
	alphaBySpeciesSnapshot.map(resolveBySpeciesRow);
export const BETA_CORE_STATS_BY_SPECIES: StatsCacheBySpeciesResult[] =
	betaBySpeciesSnapshot.map(resolveBySpeciesRow);
export const GAMMA_CORE_STATS_BY_SPECIES: StatsCacheBySpeciesResult[] =
	gammaBySpeciesSnapshot.map(resolveBySpeciesRow);

/** Alpha's all-time, ungrouped totals row — powers `fetchSummaryStats` called with no date window (the base `/summary` route). */
export const ALPHA_CORE_STATS_SUMMARY_TOTALS: StatsCacheBySpeciesResult | null =
	alphaSummaryTotalsSnapshot
		? resolveAllSpeciesRow(alphaSummaryTotalsSnapshot)
		: null;

/**
 * Alpha's home-page summary — the all-time cell plus whichever of the
 * current/previous calendar year cells the seed data actually has (`null`
 * for a year with no sessions, exactly as `fetchHomePageSummaryStats` itself
 * returns). Powers `fetchHomePageSummaryStats` (`app/(routes)/page.tsx`).
 */
export const ALPHA_HOME_PAGE_SUMMARY_STATS: {
	allTime: StatsCacheBySpeciesResult | null;
	thisYear: StatsCacheBySpeciesResult | null;
	lastYear: StatsCacheBySpeciesResult | null;
} = {
	allTime: alphaHomePageSummarySnapshot.allTime
		? resolveAllSpeciesRow(alphaHomePageSummarySnapshot.allTime)
		: null,
	thisYear: alphaHomePageSummarySnapshot.thisYear
		? resolveAllSpeciesRow(alphaHomePageSummarySnapshot.thisYear)
		: null,
	lastYear: alphaHomePageSummarySnapshot.lastYear
		? resolveAllSpeciesRow(alphaHomePageSummarySnapshot.lastYear)
		: null
};

/**
 * The Robin/Alpha *headline* row — a single aggregate over every Robin
 * encounter at the all-time grain, already carrying its own biometric
 * columns (unlike `biometrics-stats-fixtures.ts`'s
 * `ROBIN_ALPHA_BIOMETRICS_HEADLINE`, which exists for the one call site that
 * still fetches the two halves separately — see `species-stats.ts`). Powers
 * the species detail page's headline stats (#1222).
 */
export const ROBIN_ALPHA_HEADLINE: StatsCacheBySpeciesResult =
	resolveBySpeciesRow(robinAlphaHeadlineSnapshot[0]);
