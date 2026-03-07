import { Database } from '@/types/supabase.types';

export type SpeciesRow = Database['public']['Tables']['Species']['Row'];
export type SessionRow = Database['public']['Tables']['Sessions']['Row'];
export type EncounterRow = Database['public']['Tables']['Encounters']['Row'];
export type BirdRow = Database['public']['Tables']['Birds']['Row'];

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
export type SpeciesStatsRow =
	Database['public']['Functions']['species_stats']['Returns'][number];

export type PaginatedBirdsResult =
	Database['public']['Functions']['paginated_birds_table']['Returns'][number];
