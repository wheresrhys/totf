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

export type SimpleStatsCacheRow =
	Database['public']['Tables']['SimpleStatsCache']['Row'] & {
		species_name: null;
	};
export type SimpleStatsCacheBySpeciesRow =
	Database['public']['Tables']['SimpleStatsCacheBySpecies']['Row'] & {
		species_name: string;
	};
// Serves both an ImportJobs row's own `status` and its three
// `*_stats_refresh_status` columns — see the enum's own schema file for why one type
// covers both.
export type ImportJobStatus = Database['public']['Enums']['import_job_status'];

// Unlike its DemographicsStatsResult/ArrivalsStatsResult siblings below, this
// one is a standalone TypeScript type rather than a view over a generated
// Postgres composite type (#1245-style precedent, applied here at #1244's
// removal of core_stats). It used to derive from `core_stats_result`, the
// composite both core_stats and its public wrapper public_core_stats
// returned — a Postgres composite type's attributes can never be NOT NULL,
// so `supabase gen types` marked every column nullable, which this type
// stripped back off via a NonNullable mapped type, since the RPC COALESCEd
// its count columns and only ever emitted whole rows. Every app call site
// now reads the already-materialized SimpleStatsCache/SimpleStatsCacheBySpecies
// tables instead (#1234/#1244), and the RPC pair (plus core_stats_result)
// was dropped from the schema outright once nothing called them. The app
// owns this shape now; the columns below are the ones the composite
// carried, unchanged — still all non-null, since every cache-table row
// still carries a real value for each of them (NOT NULL columns on both
// tables, see "SimpleStatsCache".sql).
export type CoreStatsResult = {
	species_name: string;
	time_period: string;
	session_count: number;
	avg_encounters_per_session: number;
	max_per_session: number;
	species_count: number;
	bird_count: number;
	encounter_count: number;
	new_bird_count: number;
	pullus_bird_count: number;
	juv_bird_count: number;
	postjuv_bird_count: number;
	adult_bird_count: number;
	unknown_age_bird_count: number;
	pullus_enc_count: number;
	juv_enc_count: number;
	postjuv_enc_count: number;
	adult_enc_count: number;
	unknown_age_enc_count: number;
	max_new_per_session: number;
};

// demographics_stats is core_stats' companion RPC (#800, renamed from
// population_stats in #878), carrying the new-adult count, young-trends and
// returning-age (#843) derivations in its own demographics_stats_result
// composite type. Same null-stripping
// rationale as CoreStatsResult above: composite-type attributes are
// always nullable in the generated types, but the RPC COALESCEs its counts and
// only ever emits whole rows.
export type DemographicsStatsResult = {
	[K in keyof Database['public']['CompositeTypes']['demographics_stats_result']]-?: NonNullable<
		Database['public']['CompositeTypes']['demographics_stats_result'][K]
	>;
};

// arrivals_stats is core_stats' companion RPC (#858), counting each bird once
// per calendar year (at its first classifiable encounter of that year) rather than
// once per (species, time_period) cell, split across the five arrival buckets in
// its own arrivals_stats_result composite type. Same null-stripping rationale as
// CoreStatsResult above: composite-type attributes are always nullable in the
// generated types, but the RPC COALESCEs its counts and only ever emits whole rows.
export type ArrivalsStatsResult = {
	[K in keyof Database['public']['CompositeTypes']['arrivals_stats_result']]-?: NonNullable<
		Database['public']['CompositeTypes']['arrivals_stats_result'][K]
	>;
};

// The 8 wing/weight summary statistics (max/avg/min/median for both) for one
// (species, time_period) cell, plus the encounter count they were derived from.
//
// Unlike its CoreStatsResult/DemographicsStatsResult/ArrivalsStatsResult
// siblings above, this one is a standalone TypeScript type rather than a view
// over a generated Postgres composite type (#1245). It used to derive from
// `biometrics_stats_result`, the composite returned by the biometrics_stats RPC
// (#822/#823), but every app call site now reads the already-materialized
// SimpleStatsCache/SimpleStatsCacheBySpecies tables instead (#1223, #1244), and
// #1246 dropped that RPC and its composite from the schema outright. The
// replacement RPC's composite (`stats_cache_biometrics_metrics_result`) is NOT a
// drop-in substitute to re-point at: it keys on species_id rather than the
// display-oriented species_name, and it has no encounter_count column, which
// compare-species.ts's toBiometricsStatsResult populates for its own callers. So
// the app owns this shape outright now; the columns below are the ones the
// composite carried, unchanged.
//
// The nullability is deliberate and not uniform. The metric columns stay
// nullable because MAX/AVG/MIN/PERCENTILE_CONT over an empty set genuinely
// returns NULL — no COALESCE was ever applied — so a real "no biometric-eligible
// encounters for this species/period" cell has to be representable.
// species_name is non-null because every producer left in app code groups by
// species and so always resolves a real name (spp-data.ts's two read paths and
// compare-species.ts's toBiometricsStatsResult); the only data with a literal
// null there is the legacy ungrouped-RPC headline fixture, which consequently
// needs a double assertion — see app/CLAUDE.md's "App tests".
export type BiometricsStatsResult = {
	species_name: string;
	time_period: string | null;
	max_weight: number | null;
	avg_weight: number | null;
	min_weight: number | null;
	median_weight: number | null;
	max_wing: number | null;
	avg_wing: number | null;
	min_wing: number | null;
	median_wing: number | null;
	encounter_count: number | null;
};

// The 8 wing/weight columns that BiometricsStatsResult owns. core_stats no
// longer carries its own copies (#827 removed them from core_stats_result
// once biometrics became a separate source), so callers that want the
// biometric stats alongside an core_stats row merge them in explicitly
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

// An core_stats row with the 8 BiometricsStatsResult wing/weight fields merged
// back on (the species detail + monthly-history read path, #821). Since
// core_stats_result no longer declares these columns (#827), the merged
// shape has to add them explicitly — this is the detail/history counterpart of
// species-stats.ts's SpeciesStatsRow (the /species list read path, #823). The
// fields are always present here (mergeBiometricsFields coalesces a missing
// biometrics row to null, matching the old null-valued core_stats columns),
// so consumers can read them without an undefined check.
export type CoreStatsWithBiometrics = CoreStatsResult &
	Pick<BiometricsStatsResult, BiometricFieldName>;

// Wing/weight fields merged from a BiometricsStatsResult row onto an
// core_stats row (#821 — species page migration onto a separate biometrics
// source). The grouping/identity columns (species_name, time_period) are
// intentionally excluded from the merge: they belong to the core_stats row's own
// shape, and the biometrics row's copies are only used by callers to find the
// matching row (e.g. joining a time series on time_period) before merging.
// A missing biometrics row (no biometric-eligible encounters for this
// species/period) coalesces every metric to null, so the merged row always
// carries all 8 fields — matching the null-valued columns core_stats used
// to return before #827 removed them.
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
