import { Database } from '@/types/supabase.types';

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

export type TopPeriodsResult =
	Database['public']['Functions']['top_metrics_by_period']['Returns'][number];
export type TopSpeciesResult =
	Database['public']['Functions']['top_metrics_by_species_and_period']['Returns'][number];
export type TopPeriodsArgs =
	Database['public']['Functions']['top_metrics_by_period']['Args'];
export type TopSpeciesArgs =
	Database['public']['Functions']['top_metrics_by_species_and_period']['Args'];

export type TopMetricsFilterParams =
	Database['public']['CompositeTypes']['top_metrics_filter_params'];
// aggregate_stats and its public wrapper public_aggregate_stats share the
// aggregate_stats_result composite type (#772). A Postgres composite type's
// attributes can never be NOT NULL, so `supabase gen types` marks every column
// nullable — but the RPC COALESCEs its count columns and only ever emits whole
// rows, and the app relied on the all-non-null contract the previous RETURNS TABLE
// signature generated. Strip the null back off here, in the one place the row type
// is defined, so every consumer keeps the same shape it had before the refactor.
// Post-#815-item-4 (the aggregate_stats -> core_stats rename), the app's own call
// sites all call core_stats/public_core_stats instead (#830), so this type now
// sources from the byte-identical core_stats_result composite type rather than
// aggregate_stats_result — same name, same shape, no consumer changes needed.
export type AggregateStatsResult = {
	[K in keyof Database['public']['CompositeTypes']['core_stats_result']]-?: NonNullable<
		Database['public']['CompositeTypes']['core_stats_result'][K]
	>;
};

// population_stats is aggregate_stats' companion RPC (#800), carrying the
// age-split + young-trends derivations in its own population_stats_result
// composite type. Same null-stripping rationale as AggregateStatsResult above:
// composite-type attributes are always nullable in the generated types, but the
// RPC COALESCEs its counts and only ever emits whole rows.
export type PopulationStatsResult = {
	[K in keyof Database['public']['CompositeTypes']['population_stats_result']]-?: NonNullable<
		Database['public']['CompositeTypes']['population_stats_result'][K]
	>;
};

// arrivals_stats is aggregate_stats' companion RPC (#858), counting each bird once
// per calendar year (at its first classifiable encounter of that year) rather than
// once per (species, time_period) cell, split across the five arrival buckets in
// its own arrivals_stats_result composite type. Same null-stripping rationale as
// AggregateStatsResult above: composite-type attributes are always nullable in the
// generated types, but the RPC COALESCEs its counts and only ever emits whole rows.
export type ArrivalsStatsResult = {
	[K in keyof Database['public']['CompositeTypes']['arrivals_stats_result']]-?: NonNullable<
		Database['public']['CompositeTypes']['arrivals_stats_result'][K]
	>;
};

// biometrics_stats is aggregate_stats' companion RPC (#822/#823), carrying the 8
// wing/weight summary statistics (max/avg/min/median for both) in its own
// biometrics_stats_result composite type. Unlike AggregateStatsResult above, the
// metric columns here are deliberately NOT stripped of null — MAX/AVG/MIN/
// PERCENTILE_CONT over an empty set genuinely returns NULL (the RPC applies no
// COALESCE, see biometrics_stats.sql), so a real "no biometric-eligible
// encounters for this species/period" cell must stay nullable. Only species_name
// is stripped non-null, since every caller today calls the RPC with
// group_by_species: true.
export type BiometricsStatsResult = Omit<
	Database['public']['CompositeTypes']['biometrics_stats_result'],
	'species_name'
> & {
	species_name: NonNullable<
		Database['public']['CompositeTypes']['biometrics_stats_result']['species_name']
	>;
};

// The 8 wing/weight columns that biometrics_stats owns. aggregate_stats no
// longer carries its own copies (#827 removed them from aggregate_stats_result
// now that biometrics_stats is the sole source), so callers that want the
// biometric stats alongside an aggregate_stats row merge them in explicitly
// (see mergeBiometricsFields below and mergeSpeciesBiometrics in
// species-stats.ts, which reuses this same field list).
export type BiometricFieldName =
	| 'max_weight'
	| 'avg_weight'
	| 'min_weight'
	| 'median_weight'
	| 'max_wing'
	| 'avg_wing'
	| 'min_wing'
	| 'median_wing';

// An aggregate_stats row with the 8 biometrics_stats wing/weight fields merged
// back on (the species detail + monthly-history read path, #821). Since
// aggregate_stats_result no longer declares these columns (#827), the merged
// shape has to add them explicitly — this is the detail/history counterpart of
// species-stats.ts's SpeciesStatsRow (the /species list read path, #823). The
// fields are always present here (mergeBiometricsFields coalesces a missing
// biometrics row to null, matching the old null-valued aggregate_stats columns),
// so consumers can read them without an undefined check.
export type AggregateStatsWithBiometrics = AggregateStatsResult &
	Pick<BiometricsStatsResult, BiometricFieldName>;

// Wing/weight fields merged from a biometrics_stats row onto an
// aggregate_stats row (#821 — species page migration to biometrics_stats). The
// grouping/identity columns (species_name, time_period) are intentionally
// excluded from the merge: they belong to the aggregate_stats row's own
// shape, and biometrics_stats' copies are only used by callers to find the
// matching row (e.g. joining a time series on time_period) before merging.
// A missing biometrics row (no biometric-eligible encounters for this
// species/period) coalesces every metric to null, so the merged row always
// carries all 8 fields — matching the null-valued columns aggregate_stats used
// to return before #827 removed them.
export function mergeBiometricsFields<T extends AggregateStatsResult>(
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
export type StatsPerDayAndSpeciesResult =
	Database['public']['Functions']['stats_per_day_and_species']['Returns'][number];
export type GroupTicksResult =
	Database['public']['Functions']['group_ticks']['Returns'][number];
