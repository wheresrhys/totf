/**
 * Shared fixtures for the four DB integration test files that write to
 * "SimpleStatsCache"/"ComplexStatsCache" — the two table-schema test files and
 * the two upsert-RPC test files.
 *
 * The metric constants live here rather than being restated per file because
 * they enumerate every non-key column of their table: a column added to either
 * table has exactly one place to be added here, instead of two that can silently
 * drift apart.
 *
 * Each table's builder is split in two on purpose. The *cell* builder produces
 * only the per-row payload — species_id, time_period and the metrics — which is
 * exactly the shape of one element of the upsert RPCs' `p_rows` jsonb array.
 * The *row* builder wraps it with group_id/temporal_unit, which the RPCs take as
 * scalar parameters rather than per-row columns.
 */

import { psqlScalar } from './db-test-helpers';
import { randomFutureDate } from './test-isolation';

export type TemporalUnit = 'day' | 'month' | 'year' | 'month-squashed' | 'all-time';

/** Every non-key "SimpleStatsCache" column, with one representative,
 * round-trip-safe value per source type (bigint, interval, numeric, real,
 * smallint) — so most tests need only override species_id/time_period. */
export const DEFAULT_SIMPLE_METRICS = {
	species_count: 7,
	bird_count: 42,
	encounter_count: 100,
	new_bird_count: 5,
	session_count: 3,
	total_effort: '10:30:00',
	effort_per_session: '03:30:00',
	effort_per_encounter: '00:06:18',
	avg_encounters_per_session: 12.5,
	max_per_session: 40,
	max_new_per_session: 10,
	max_weight: 15.75,
	avg_weight: 12.345,
	min_weight: 9.5,
	median_weight: 12,
	max_wing: 95,
	avg_wing: 88.4,
	min_wing: 80,
	median_wing: 85,
	pullus_bird_count: 1,
	juv_bird_count: 2,
	postjuv_bird_count: 3,
	adult_bird_count: 36,
	unknown_age_bird_count: 0,
	new_young_bird_count: 2,
	pullus_enc_count: 1,
	juv_enc_count: 2,
	postjuv_enc_count: 3,
	adult_enc_count: 90,
	unknown_age_enc_count: 4,
	postjuv_juv_enc_count: 5,
	new_postjuv_juv_enc_count: 1,
	new_postjuv_enc_count: 1,
} as const;

/** The five lifetime-relative "ComplexStatsCache" metric columns, with a
 * distinct representative bigint value each so a round-trip test can tell them
 * apart if any were ever mis-mapped. */
export const DEFAULT_COMPLEX_METRICS = {
	new_adult_bird_count: 11,
	returning_age_1_bird_count: 22,
	returning_age_2_bird_count: 33,
	returning_age_3_plus_bird_count: 44,
	returning_new_unknown_age_bird_count: 55,
} as const;

/** The eight biometric columns are genuinely nullable in the schema (see
 * supabase/schema/schemas/public/tables/"SimpleStatsCache".sql) even though
 * DEFAULT_SIMPLE_METRICS gives each a representative non-null default — so the
 * builder's param type widens just these to `number | null` rather than
 * inheriting the inferred non-null `number` type. */
type NullableBiometricColumn =
	| 'max_weight'
	| 'avg_weight'
	| 'min_weight'
	| 'median_weight'
	| 'max_wing'
	| 'avg_wing'
	| 'min_wing'
	| 'median_wing';

/** `speciesId: null` means "all species combined" and `timePeriod: null` means
 * the all-time grain — both are real values in these tables, not missing data.
 * See either table's own column comments. */
type CellParams = {
	speciesId: number | null;
	timePeriod?: string | null;
};

export type SimpleStatsCacheCellParams = CellParams &
	Partial<Omit<typeof DEFAULT_SIMPLE_METRICS, NullableBiometricColumn>> &
	Partial<Record<NullableBiometricColumn, number | null>>;

export type ComplexStatsCacheCellParams = CellParams & Partial<typeof DEFAULT_COMPLEX_METRICS>;

/** One element of upsert_simple_stats_cache_rows' `p_rows` array. */
export function buildSimpleStatsCacheCell({
	speciesId,
	timePeriod = randomFutureDate(),
	...metricOverrides
}: SimpleStatsCacheCellParams) {
	return {
		species_id: speciesId,
		time_period: timePeriod,
		...DEFAULT_SIMPLE_METRICS,
		...metricOverrides,
	};
}

/** One element of upsert_complex_stats_cache_rows' `p_rows` array. */
export function buildComplexStatsCacheCell({
	speciesId,
	timePeriod = randomFutureDate(),
	...metricOverrides
}: ComplexStatsCacheCellParams) {
	return {
		species_id: speciesId,
		time_period: timePeriod,
		...DEFAULT_COMPLEX_METRICS,
		...metricOverrides,
	};
}

/** A full "SimpleStatsCache" row, for a direct PostgREST insert. */
export function buildSimpleStatsCacheRow({
	groupId,
	temporalUnit = 'month',
	...cellParams
}: SimpleStatsCacheCellParams & { groupId: number; temporalUnit?: TemporalUnit }) {
	return {
		group_id: groupId,
		temporal_unit: temporalUnit,
		...buildSimpleStatsCacheCell(cellParams),
	};
}

/** A full "ComplexStatsCache" row, for a direct PostgREST insert. */
export function buildComplexStatsCacheRow({
	groupId,
	temporalUnit = 'month',
	...cellParams
}: ComplexStatsCacheCellParams & { groupId: number; temporalUnit?: TemporalUnit }) {
	return {
		group_id: groupId,
		temporal_unit: temporalUnit,
		...buildComplexStatsCacheCell(cellParams),
	};
}

/** Creates a throwaway `Species` row and returns its id. */
export function createIsolatedSpecies(name: string): number {
	return Number(psqlScalar(`INSERT INTO "Species" (species_name) VALUES ('${name}') RETURNING id;`));
}
