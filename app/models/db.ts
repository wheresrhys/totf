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
// core_stats and its public wrapper public_core_stats share the
// core_stats_result composite type (#772). A Postgres composite type's
// attributes can never be NOT NULL, so `supabase gen types` marks every column
// nullable — but the RPC COALESCEs its count columns and only ever emits whole
// rows, and the app relied on the all-non-null contract the previous RETURNS TABLE
// signature generated. Strip the null back off here, in the one place the row type
// is defined, so every consumer keeps the same shape it had before the refactor.
// Post-#815-item-4 (the core_stats -> core_stats rename), the app's own call
// sites all call core_stats/public_core_stats instead (#830), so this type now
// sources from the byte-identical core_stats_result composite type rather than
// core_stats_result, and is itself renamed CoreStatsResult (from
// AggregateStatsResult) to match — same shape, just following the RPC rename.
//
// #924 explored replacing this blanket-NonNullable mapped type (and the same
// pattern on DemographicsStatsResult/BiometricsStatsResult below) with a 4-way
// discriminated union keyed to the RPC's (group_by_species, group_by_time_period)
// call shape — CoreStatsUnscopedResult/CoreStatsPeriodResult/CoreStatsSpeciesResult/
// CoreStatsSpeciesPeriodResult — so a fixture/row's real species_name/time_period
// nullability would be checked directly instead of needing an
// `eslint-disable-next-line no-restricted-syntax` escape hatch at each of the
// ~8 genuine mismatch sites. Concluded not worth it at the current call-site count:
// - The RPC layer has no literal foothold to discriminate on: `group_by_time_period`
//   is generated as bare `string` (Postgres `text`), not a literal union, so an
//   overloaded fetch signature would first need its own hand-written literal
//   parameter type layered on top of every RPC wrapper — a separate, unscoped
//   precursor change, not a consequence of the union itself.
// - Two funnels between the RPC and the ~50 non-test read sites — the shared
//   `fetchAuthorisedCoreStats`/`runCoreStats` (app/lib/auth/group-summary-access.ts)
//   and ~8 ad hoc direct `.rpc('core_stats', ...)` calls duplicated across
//   underlying-stats.ts/pay-off-stats.ts/sp-data.ts/page.tsx — would each need a
//   4-way overload set (or a manually-chosen cast per call site, which is close to
//   what already exists today via `as Promise<CoreStatsResult[] | null>`).
// - Individual leaf consumers (month-totals.ts, period-totals.ts, species-stats.ts,
//   StatsHistoryChart.tsx, SpDemographicsTab.tsx, ...) each consistently use exactly
//   one of the four shapes, so a swap-in-place would be mechanical for them — but
//   a few shared components (e.g. PeriodTotalsTable, SummaryTotalsSection) genuinely
//   take more than one shape across distinctly-named props, and cross-family merge
//   helpers (mergeBiometricsFields, mergeSpeciesBiometrics, CoreStatsWithBiometrics,
//   SpeciesStatsRow) combine two of the three families along a dimension (biometric
//   nullability) that's orthogonal to the species/period discriminant this ticket
//   targets — a 4-way split would ripple through those without a matching benefit.
// - Repeating the same 4-way split across all three RPC families (core/demographics/
//   biometrics stats) would roughly triple the boilerplate for a benefit concentrated
//   in a handful of real sites — most concretely `month-totals.ts`'s
//   `synthesizeZeroStats`, whose existing `as unknown as CoreStatsResult` is a
//   narrower, cheaper fix on its own than rearchitecting the shared type family.
// If this needs revisiting, start from a narrower slice (e.g. just the period-shaped
// callers) rather than the full 4-way cross product across all three RPCs.
export type CoreStatsResult = {
	[K in keyof Database['public']['CompositeTypes']['core_stats_result']]-?: NonNullable<
		Database['public']['CompositeTypes']['core_stats_result'][K]
	>;
};

// demographics_stats is core_stats' companion RPC (#800, renamed from
// population_stats in #878), carrying the age-split + young-trends derivations
// in its own demographics_stats_result composite type. Same null-stripping
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

// biometrics_stats is core_stats' companion RPC (#822/#823), carrying the 8
// wing/weight summary statistics (max/avg/min/median for both) in its own
// biometrics_stats_result composite type. Unlike CoreStatsResult above, the
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

// The 8 wing/weight columns that biometrics_stats owns. core_stats no
// longer carries its own copies (#827 removed them from core_stats_result
// now that biometrics_stats is the sole source), so callers that want the
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

// An core_stats row with the 8 biometrics_stats wing/weight fields merged
// back on (the species detail + monthly-history read path, #821). Since
// core_stats_result no longer declares these columns (#827), the merged
// shape has to add them explicitly — this is the detail/history counterpart of
// species-stats.ts's SpeciesStatsRow (the /species list read path, #823). The
// fields are always present here (mergeBiometricsFields coalesces a missing
// biometrics row to null, matching the old null-valued core_stats columns),
// so consumers can read them without an undefined check.
export type CoreStatsWithBiometrics = CoreStatsResult &
	Pick<BiometricsStatsResult, BiometricFieldName>;

// Wing/weight fields merged from a biometrics_stats row onto an
// core_stats row (#821 — species page migration to biometrics_stats). The
// grouping/identity columns (species_name, time_period) are intentionally
// excluded from the merge: they belong to the core_stats row's own
// shape, and biometrics_stats' copies are only used by callers to find the
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
export type StatsPerDayAndSpeciesResult =
	Database['public']['Functions']['stats_per_day_and_species']['Returns'][number];
export type GroupTicksResult =
	Database['public']['Functions']['group_ticks']['Returns'][number];
