import type {
  SimpleStatsCacheBySpeciesRow,
  SimpleStatsCacheRow
} from '@/app/models/db';
import type { StatsTemporalUnit } from '@/app/models/temporal-unit';
import type { Database } from '@/types/supabase.types';
export type StatsResult = SimpleStatsCacheBySpeciesRow | SimpleStatsCacheRow;


/**
 * Matches the existing stats-RPC filter convention
 * (`app/lib/auth/group-summary-access.ts`'s `CoreStatsRpcParams`,
 * `app/lib/supabase/temporal-filter.ts`) — except `ringing_group_filter` is
 * inlined here rather than supplied separately, since a dispatched event has
 * to carry every RPC arg a consumer needs with no surrounding request context.
 * `group_by_time_period` is typed optional rather than a literal `null`, so an
 * all-time event can omit the key entirely — the same "omit the key for
 * all-time" convention `app/actions/summary-stats.ts`'s `fetchSummaryStats`
 * uses.
 *
 * `periods` is the one member that isn't an RPC filter in its own right: it is
 * the exact set of `time_period` values the event's temporal unit should write,
 * in the literal string shape the metric RPCs return it in — a first-of-month
 * (`YYYY-MM-01`), first-of-year (`YYYY-01-01`) or sentinel-year squashed-month
 * (`2000-MM-01`) ISO date, since `stats_spine.sql`'s period_spine CTE computes
 * those cells as `date_trunc('month'|'year', d)::date` and `make_date(2000, m,
 * 1)` respectively. `refreshSimpleStatsCache` splits `periods` back into one
 * exact-match `year_filter`/`month_filter` metric-RPC call per distinct period
 * (#1176, #1178 — a period string parses straight into those numbers, so the
 * call selects precisely that month/year/calendar month with no date window
 * involved at all; see `buildSimpleMetricRpcParamsList` in
 * `lib/stats-cache-refresh.ts`), and `day` — the one unit that narrows by a
 * `from_date`/`to_date` window instead — filters its merged rows back down to
 * `periods` by literal string membership against `time_period`. Either way the
 * strings have to match that shape exactly.
 *
 * It replaced a per-event, single-value `year_filter`/`month_filter` pair on
 * this type, which no event needs any more now that every temporal unit either
 * carries an array, carries its own date window (`day`), or full-replaces
 * (`all-time`).
 */
export type StatsCacheRefreshRpcParams = {
  ringing_group_filter: number;
  group_by_time_period?: Exclude<StatsTemporalUnit, 'all-time'>;
  from_date?: string;
  to_date?: string;
  periods?: string[];
};


/**
 * `affectedDates` is event metadata, not an RPC filter — it lives top-level
 * on the event rather than inside `rpcParams`, and it stays a separate field
 * from `rpcParams.periods` because it answers a different question. It is only
 * ever set on the day-range event: that event's `from_date`/`to_date` span the
 * min/max of the affected dates, which can include gap days with no actual
 * activity (e.g. an import touching the 1st and the 28th of a month produces a
 * day-range event spanning the 1st–28th). A consumer refreshing by exact day
 * needs the precise set of changed days, which only this field supplies. The
 * coarser temporal units don't have that gap — month/year/month-squashed narrow
 * by their own `periods` array (every entry of which was genuinely touched),
 * and `all-time` full-replaces — so all four omit the field entirely rather
 * than carrying it unset.
 *
 * `affectedSpeciesIds` is also event metadata rather than an RPC filter, for
 * the same reason: no `stats_cache_*_metrics` RPC call ever gets narrower
 * because of it. Unlike `affectedDates`, it is carried by **every** event,
 * species-grouped: `lib/stats-cache-refresh.ts`'s species-grouped write
 * (`SimpleStatsCacheBySpecies`) can safely skip rewriting an untouched
 * species' cell for *any* temporal unit, including `all-time` — that skip is
 * orthogonal to how each temporal unit narrows by date. The
 * all-species-combined write (`SimpleStatsCache`) never reads this field: its
 * row aggregates across every species, so it must always be rewritten in full
 * whenever a period is in scope, regardless of which species changed.
 */
export type StatsCacheRefreshEvent = {
  importJobId: number;
  rpcParams: StatsCacheRefreshRpcParams;
  affectedDates?: string[];
  affectedSpeciesIds: number[];
};


/**
 * The species ids a refresh pass should narrow its species-grouped *write* to
 * — never its read: every metric RPC call is still made exactly as it is
 * without this field, over every species. When provided, only the
 * species-grouped write (`SimpleStatsCacheBySpecies`) skips rewriting a cell
 * whose `species_id` isn't in this list; the all-species-combined write
 * (`SimpleStatsCache`) ignores it entirely, since that row aggregates across
 * every species and must always
 * be rewritten in full whenever its period is in scope. `undefined` means "no
 * species narrowing" — every computed row is written, the pre-existing
 * behaviour. Orthogonal to `periods`/temporal-unit narrowing, and sound for
 * every temporal unit including `all-time`: an untouched species' cell for a
 * period in scope is unchanged by this import, so skipping its write
 * reproduces whatever is already cached for it.
 */
export type RefreshSpeciesNarrowing = {
  speciesIds?: number[];
};

export type RefreshSimpleStatsCacheParams = RefreshSpeciesNarrowing & {
  groupId: number;
  temporalUnit: StatsTemporalUnit;
  /**
   * The exact `time_period` values this refresh pass should write, in the
   * same string shape the metric RPCs return for that temporal unit.
   * Required (non-empty) for the narrowing temporal units — `day`, `month`,
   * `year` and, since #1178, `month-squashed` (whose periods are the
   * `2000-MM-01` sentinel-year cells its grouping emits). See
   * `buildSimpleMetricRpcParamsList`'s early-return for what happens if it's
   * empty for one of those. Ignored entirely for `all-time`, which always
   * full-replaces the whole group history regardless of what's passed.
   */
  periods?: string[];
  /**
   * The import job this refresh was dispatched for, carried only for
   * `runStatsCacheDbCall`'s failure-log context — not read by any refresh
   * logic itself. Optional since most callers (every test, the debug
   * script) have no import job at all.
   */
  importJobId?: number;
};

export type BasicSessionMetricsRow =
  Database['public']['CompositeTypes']['stats_cache_basic_session_metrics_result'];
export type BiometricsMetricsRow =
  Database['public']['CompositeTypes']['stats_cache_biometrics_metrics_result'];
export type BirdAgeMetricsRow =
  Database['public']['CompositeTypes']['stats_cache_bird_age_metrics_result'];
export type EncounterAgeMetricsRow =
  Database['public']['CompositeTypes']['stats_cache_encounter_age_metrics_result'];

/** The (species_id, time_period) key pair a merged refresh cell is matched across RPC results on — see this module's CLAUDE.md for the NULL/sentinel-date nuance. */
export type MergedCellKey = {
  species_id: number | null;
  time_period: string | null;
};

/** One merged `SimpleStatsCache` cell, pre-write — see this module's CLAUDE.md for the exact column provenance. */
export type SimpleMergedCell = Omit<
  Database['public']['Tables']['SimpleStatsCacheBySpecies']['Insert'],
  'id' | 'group_id' | 'temporal_unit' | keyof MergedCellKey
> &
  MergedCellKey;

/** The two `cache_table` values `FailedStatsCacheRefreshes`' CHECK constraint accepts (#1182). */
export type FailedRefreshCacheTable =
  | 'SimpleStatsCache'
  | 'SimpleStatsCacheBySpecies';

/** One dead-letter row for `FailedStatsCacheRefreshes` (#1167). */
export type FailedRefreshRow = Omit<
  Database['public']['Tables']['FailedStatsCacheRefreshes']['Insert'],
  'id' | 'created_at' | 'cache_table'
> & {
  cache_table: FailedRefreshCacheTable;
};

/** The filter shape every `stats_cache_*_metrics` RPC takes — see this module's CLAUDE.md. */
export type MetricRpcParams = {
  ringing_group_filter: number;
  group_by_species: boolean;
  group_by_time_period?: Exclude<StatsTemporalUnit, 'all-time'>;
  from_date?: string;
  to_date?: string;
  /** Exact calendar year, matched as `EXTRACT(YEAR FROM visit_date)`. */
  year_filter?: number;
  /** Exact calendar month, 1-12, matched as `EXTRACT(MONTH FROM visit_date)`. */
  month_filter?: number;
};
