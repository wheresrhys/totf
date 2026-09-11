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
export type AggregateStatsResult = {
	[K in keyof Database['public']['CompositeTypes']['aggregate_stats_result']]-?: NonNullable<
		Database['public']['CompositeTypes']['aggregate_stats_result'][K]
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
