import { Database } from '@/types/supabase.types';

export type SpeciesRow = Database['public']['Tables']['Species']['Row'];
export type SessionRow = Database['public']['Tables']['Sessions']['Row'];
export type EncounterRow = Database['public']['Tables']['Encounters']['Row'];
export type BirdRow = Database['public']['Tables']['Birds']['Row'];
export type LocationRow = Database['public']['Tables']['Locations']['Row'];
export type RingingGroupRow =
	Database['public']['Tables']['RingingGroups']['Row'];

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
export type AggregateStatsRow =
	Database['public']['Functions']['aggregate_stats']['Returns'][number];

export type DiscrepenciesResult =
	Database['public']['Functions']['find_discrepencies']['Returns'][number];
export type NotableRetrapsResult =
	Database['public']['Functions']['notable_retraps']['Returns'][number];
export type LongAbsenceRetrapsResult =
	Database['public']['Functions']['long_absence_retraps']['Returns'][number];
export type StatsPerDayAndSpeciesRow =
	Database['public']['Functions']['stats_per_day_and_species']['Returns'][number];
