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
export type ResightingRecordType =
	Database['public']['Enums']['resighting_record_type'];

// Serves both an ImportJobs row's own `status` and its three
// `*_stats_refresh_status` columns — see the enum's own schema file for why one type
// covers both.
export type ImportJobStatus = Database['public']['Enums']['import_job_status'];

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
