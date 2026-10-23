/**
 * Shared fixtures for the four DB integration test files that write to the
 * stats-cache tables — "SimpleStatsCache"/"SimpleStatsCacheBySpecies" and
 * "ComplexStatsCache"/"ComplexStatsCacheBySpecies".
 *
 * The metric constants live here rather than being restated per file because
 * they enumerate every non-key column of their table: a column added to either
 * table family has exactly one place to be added here, instead of four that can
 * silently drift apart.
 *
 * One row builder per table *family*, not per table: the species and
 * non-species halves differ only in whether a species_id is present, so each
 * builder omits the column entirely when no `speciesId` is passed. Omitting
 * rather than nulling matters — the non-species tables have no such column at
 * all (#1169).
 */

import { psqlScalar } from './db-test-helpers';
import { randomFutureDate } from './test-isolation';

export type TemporalUnit =
	| 'day'
	| 'month'
	| 'year'
	| 'month-squashed'
	| 'all-time';

/**
 * The `time_period` value every stats-cache table uses for the all-time grain.
 * Duplicated from `lib/stats-cache-refresh.ts`'s own `ALL_TIME_SENTINEL_DATE`
 * rather than imported, the same convention `TemporalUnit` above follows:
 * `lib/` doesn't reach into `supabase/__tests__/`, and a test asserting on the
 * schema's convention shouldn't be satisfied by whatever the writer happens to
 * send.
 */
export const ALL_TIME_SENTINEL_DATE = '0001-01-01';

/** Every non-key "SimpleStatsCache"/"SimpleStatsCacheBySpecies" column, with
 * one representative, round-trip-safe value per source type (bigint, interval,
 * numeric, real, smallint) — so most tests need only override the key
 * columns. */
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
	new_postjuv_enc_count: 1
} as const;

/** The five lifetime-relative "ComplexStatsCache"/"ComplexStatsCacheBySpecies"
 * metric columns, with a distinct representative bigint value each so a
 * round-trip test can tell them apart if any were ever mis-mapped. */
export const DEFAULT_COMPLEX_METRICS = {
	new_adult_bird_count: 11,
	returning_age_1_bird_count: 22,
	returning_age_2_bird_count: 33,
	returning_age_3_plus_bird_count: 44,
	returning_new_unknown_age_bird_count: 55
} as const;

/** The eight biometric columns are genuinely nullable in the schema (see
 * supabase/schema/schemas/public/tables/"SimpleStatsCache".sql) even though
 * DEFAULT_SIMPLE_METRICS gives each a representative non-null default — so the
 * builder's param type widens just these to `number | null` rather than
 * inheriting the inferred non-null `number` type. */
export const NULLABLE_BIOMETRIC_COLUMNS = [
	'max_weight',
	'avg_weight',
	'min_weight',
	'median_weight',
	'max_wing',
	'avg_wing',
	'min_wing',
	'median_wing'
] as const;

type NullableBiometricColumn = (typeof NULLABLE_BIOMETRIC_COLUMNS)[number];

/**
 * The key columns both halves of a cache family share, plus the `speciesId`
 * that tells a builder which half it is building for. `timePeriod` is a real
 * date even for the all-time grain — that grain uses
 * `ALL_TIME_SENTINEL_DATE`, not a NULL.
 */
type RowParams = {
	groupId: number;
	/** Omitted entirely for the all-species-combined tables, which have no
	 * species_id column at all. */
	speciesId?: number;
	temporalUnit?: TemporalUnit;
	timePeriod?: string;
};

export type SimpleStatsCacheRowParams = RowParams &
	Partial<Omit<typeof DEFAULT_SIMPLE_METRICS, NullableBiometricColumn>> &
	Partial<Record<NullableBiometricColumn, number | null>>;

export type ComplexStatsCacheRowParams = RowParams &
	Partial<typeof DEFAULT_COMPLEX_METRICS>;

/** A full "SimpleStatsCache" row, or — given a `speciesId` — a full
 * "SimpleStatsCacheBySpecies" one. */
export function buildSimpleStatsCacheRow({
	groupId,
	speciesId,
	temporalUnit = 'month',
	timePeriod = randomFutureDate(),
	...metricOverrides
}: SimpleStatsCacheRowParams) {
	return {
		group_id: groupId,
		temporal_unit: temporalUnit,
		time_period: timePeriod,
		...(speciesId === undefined ? {} : { species_id: speciesId }),
		...DEFAULT_SIMPLE_METRICS,
		...metricOverrides
	};
}

/** A full "ComplexStatsCache" row, or — given a `speciesId` — a full
 * "ComplexStatsCacheBySpecies" one. */
export function buildComplexStatsCacheRow({
	groupId,
	speciesId,
	temporalUnit = 'month',
	timePeriod = randomFutureDate(),
	...metricOverrides
}: ComplexStatsCacheRowParams) {
	return {
		group_id: groupId,
		temporal_unit: temporalUnit,
		time_period: timePeriod,
		...(speciesId === undefined ? {} : { species_id: speciesId }),
		...DEFAULT_COMPLEX_METRICS,
		...metricOverrides
	};
}

/** Creates a throwaway `Species` row and returns its id. */
export function createIsolatedSpecies(name: string): number {
	return Number(
		psqlScalar(
			`INSERT INTO "Species" (species_name) VALUES ('${name}') RETURNING id;`
		)
	);
}
