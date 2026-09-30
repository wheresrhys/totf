import type { CoreStatsResult } from '@/app/models/db';

/**
 * A `CoreStatsResult` row fixture: flat overrides merged over sensible
 * defaults, covering every column `core_stats` returns (see
 * `core_stats_result` in `types/supabase.types.ts`) plus the 8
 * `max_weight`/`avg_weight`/`min_weight`/`median_weight`/`max_wing`/
 * `avg_wing`/`min_wing`/`median_wing` fields several call sites still
 * override even though `core_stats_result` no longer declares them (#827
 * moved biometrics onto `biometrics_stats`) — kept here as harmless extras
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
		total_effort: '18:00:00',
		effort_per_session: '02:00:00',
		effort_per_encounter: '02:34:17',
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
	total_effort: '00:00:00',
	effort_per_session: '00:00:00',
	effort_per_encounter: '00:00:00',
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
