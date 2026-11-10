import type { CoreStatsResult } from '@/app/models/db';
import type { StatsCacheBySpeciesResult } from '@/modules/stats/browser';
import alphaBySpeciesSnapshot from '@/test-fixtures/snapshots/tables/SimpleStatsCacheBySpecies/alpha.by-species.json';
import betaBySpeciesSnapshot from '@/test-fixtures/snapshots/tables/SimpleStatsCacheBySpecies/beta.by-species.json';
import gammaBySpeciesSnapshot from '@/test-fixtures/snapshots/tables/SimpleStatsCacheBySpecies/gamma.by-species.json';
import alphaSummaryTotalsSnapshot from '@/test-fixtures/snapshots/tables/SimpleStatsCache/alpha.summary-totals.json';
import alphaHomePageSummarySnapshot from '@/test-fixtures/snapshots/tables/SimpleStatsCache/alpha.home-page-summary.json';
import robinAlphaHeadlineSnapshot from '@/test-fixtures/snapshots/tables/SimpleStatsCacheBySpecies/robin-alpha.headline.json';

/**
 * A `CoreStatsResult` row fixture: flat overrides merged over sensible
 * defaults, covering every column the now-deleted `core_stats` RPC
 * returned (`CoreStatsResult` in `app/models/db.ts` is the app-owned
 * standalone type that shape now lives in, #1244) plus the 8
 * `max_weight`/`avg_weight`/`min_weight`/`median_weight`/`max_wing`/
 * `avg_wing`/`min_wing`/`median_wing` fields several call sites still
 * override even though `CoreStatsResult` doesn't declare them (#827
 * moved biometrics onto a separate source) — kept here as harmless extras
 * so every pre-existing override site keeps working unchanged. Coerced via
 * `as CoreStatsResult` rather than constructing a full-fat instance, per this
 * repo's fixture-builder convention.
 *
 * Was independently hand-rolled ~13 times across test files
 * (`buildStat`/`buildAggregateRow`/`buildDayStat`/`buildYearlyStat`/
 * `buildMonthlyStat`/`buildDailyStat`) — see `reports/test-quality.md`,
 * "Duplicated `CoreStatsResult` row-fixture builders". A caller relying on a
 * specific default value from one of those local builders (rather than just
 * overriding the field it cares about) should pass that value explicitly as
 * an override here instead of forking this builder.
 */
export function buildCoreStatsRow(
	overrides: Partial<CoreStatsResult> = {}
): CoreStatsResult {
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
		...overrides
	} as CoreStatsResult;
}

/**
 * `buildCoreStatsRow` with a day-shaped `time_period` default, for tests
 * building a "session totals" (day-grouped) row without caring about the
 * exact date — pass `time_period` as an override to set a specific date.
 */
export function buildDailyStatsRow(
	overrides: Partial<CoreStatsResult> = {}
): CoreStatsResult {
	return buildCoreStatsRow({ time_period: '2026-08-16', ...overrides });
}

// Every count/effort column zeroed out, for a calendar month with no sessions
// in any year of a group's history — the shape a real `'month-squashed'`
// `group_by_time_period` (#996) row has for such a month.
const ZERO_MONTH_SQUASHED_STATS: Partial<CoreStatsResult> = {
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
	} as Partial<CoreStatsResult>)
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
	overridesByMonth: Partial<Record<number, Partial<CoreStatsResult>>> = {}
): CoreStatsResult[] {
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
 * Snapshot-backed `CoreStatsResult`/`CoreStatsWithBiometrics` row fixtures,
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
 * `StatsCacheBySpeciesResult` (`modules/stats`) rather than the narrower
 * `CoreStatsWithBiometrics` since #1415: the snapshot is a verbatim cache row,
 * so it genuinely carries the four `new_young_bird_count`/`new_postjuv_*`/
 * `postjuv_juv_enc_count` columns that type omits, and `fetchSpeciesData` now
 * returns whole rows. The richer type is assignable to the narrower one, so
 * every pre-existing consumer of the exports below is unaffected.
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
 * a `CoreStatsResult` — `species_name: null`, matching what the real
 * all-species read path returns (the table carries no species relationship
 * to flatten at all).
 */
function resolveAllSpeciesRow(row: Record<string, unknown>): CoreStatsResult {
	// `row`'s only known shape is an index signature, which doesn't carry
	// enough named properties for a single `as CoreStatsResult` to pass
	// TypeScript's "sufficient overlap" check — it genuinely has every
	// CoreStatsResult column at runtime (the raw SimpleStatsCache row), just
	// not expressible in `row`'s own type.
	// eslint-disable-next-line no-restricted-syntax -- see comment above
	return { ...row, species_name: null } as unknown as CoreStatsResult;
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
export const ALPHA_CORE_STATS_SUMMARY_TOTALS: CoreStatsResult | null =
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
	allTime: CoreStatsResult | null;
	thisYear: CoreStatsResult | null;
	lastYear: CoreStatsResult | null;
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
