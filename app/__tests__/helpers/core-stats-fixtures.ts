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
