import { Database } from '@/types/supabase.types';
import type {
	BiometricStatName,
	StatsCacheBySpeciesResult,
	StatsCacheResult
} from '@/modules/stats/browser';

export type SpeciesRow = Database['public']['Tables']['Species']['Row'];
export type SessionRow = Database['public']['Tables']['Sessions']['Row'];
export type EncounterRow = Database['public']['Tables']['Encounters']['Row'];
export type BirdRow = Database['public']['Tables']['Birds']['Row'];
export type LocationRow = Database['public']['Tables']['Locations']['Row'];
export type RingingGroupRow =
	Database['public']['Tables']['RingingGroups']['Row'];
export type RingSequenceRow =
	Database['public']['Tables']['RingSequences']['Row'];
export type RingSize = Database['public']['Enums']['ring_size'];
export type ResightingRecordType =
	Database['public']['Enums']['resighting_record_type'];

/** @deprecated Use `StatsCacheResult` from `@/modules/stats` instead (#1372). */
export type SimpleStatsCacheRow = StatsCacheResult;
/** @deprecated Use `StatsCacheBySpeciesResult` from `@/modules/stats` instead (#1372). */
export type SimpleStatsCacheBySpeciesRow = StatsCacheBySpeciesResult;
// Serves both an ImportJobs row's own `status` and its three
// `*_stats_refresh_status` columns — see the enum's own schema file for why one type
// covers both.
export type ImportJobStatus = Database['public']['Enums']['import_job_status'];

/** @deprecated Use `StatsCacheBySpeciesResult` from `@/modules/stats` instead (#1372). */
export type CoreStatsResult = StatsCacheBySpeciesResult;

// demographics_stats is a companion RPC of the long-since-dropped core_stats
// (#800, renamed from population_stats in #878), carrying the new-adult count,
// young-trends and returning-age (#843) derivations in its own
// demographics_stats_result composite type. A Postgres composite type's
// attributes can never be NOT NULL, so `supabase gen types` marks every column
// nullable; this type strips that back off via a NonNullable mapped type, since
// the RPC COALESCEs its counts and only ever emits whole rows.
export type DemographicsStatsResult = {
	[K in keyof Database['public']['CompositeTypes']['demographics_stats_result']]-?: NonNullable<
		Database['public']['CompositeTypes']['demographics_stats_result'][K]
	>;
};

// arrivals_stats is another companion RPC of the dropped core_stats (#858),
// counting each bird once per calendar year (at its first classifiable encounter
// of that year) rather than once per (species, time_period) cell, split across
// the five arrival buckets in its own arrivals_stats_result composite type. Same
// null-stripping rationale as DemographicsStatsResult above.
export type ArrivalsStatsResult = {
	[K in keyof Database['public']['CompositeTypes']['arrivals_stats_result']]-?: NonNullable<
		Database['public']['CompositeTypes']['arrivals_stats_result'][K]
	>;
};

/** @deprecated Use `StatsCacheBySpeciesResult` from `@/modules/stats` instead (#1372). */
export type BiometricsStatsResult = StatsCacheBySpeciesResult;

/** @deprecated Use `BiometricStatName` from `@/modules/stats` instead (#1372). */
export type BiometricFieldName = BiometricStatName;

/** @deprecated Use `StatsCacheBySpeciesResult` from `@/modules/stats` instead (#1372). */
export type CoreStatsWithBiometrics = StatsCacheBySpeciesResult;

// Copies the 8 wing/weight columns of one stats cell onto another row, or nulls
// them out when there is no matching cell. Vestigial now that both halves of a
// stats cell are read off one cache row (#1372) — #1419 deletes it; nothing
// outside this file should start calling it.
export function mergeBiometricsFields<T extends CoreStatsResult>(
	aggregateRow: T,
	biometricsRow: BiometricsStatsResult | undefined
): T & Pick<BiometricsStatsResult, BiometricFieldName> {
	return {
		...aggregateRow,
		min_weight: biometricsRow?.min_weight ?? null,
		max_weight: biometricsRow?.max_weight ?? null,
		avg_weight: biometricsRow?.avg_weight ?? null,
		median_weight: biometricsRow?.median_weight ?? null,
		min_wing: biometricsRow?.min_wing ?? null,
		max_wing: biometricsRow?.max_wing ?? null,
		avg_wing: biometricsRow?.avg_wing ?? null,
		median_wing: biometricsRow?.median_wing ?? null
	};
}

export type DiscrepenciesResult =
	Database['public']['Functions']['find_discrepencies']['Returns'][number];
export type NotableRetrapsResult =
	Database['public']['Functions']['notable_retraps']['Returns'][number];
export type LongAbsenceRetrapsResult =
	Database['public']['Functions']['long_absence_retraps']['Returns'][number];
export type GroupTicksResult =
	Database['public']['Functions']['group_ticks']['Returns'][number];
export type StatsSpineResult =
	Database['public']['Functions']['stats_spine']['Returns'][number];
