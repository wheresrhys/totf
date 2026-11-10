import type { StatsTemporalUnit } from '@/app/models/temporal-unit';
import type { Database } from '@/types/supabase.types';

/**
 * The columns a cache row carries that are bookkeeping rather than results
 * (#1372) — a result type has no use for them, and the non-cache stats paths
 * (live-metrics fallbacks, zero-fills) have no honest value to put in them.
 *
 * Deliberately **not** unified with `lib/refresh/find-cache-discrepancies.ts`'
 * `CACHE_ROW_BOOKKEEPING_FIELD_NAMES`, which is a near-identical but
 * genuinely different set: that one also excludes `species_name` (its
 * every-field-falsy check runs over a *raw cached row*, where a non-null
 * `species_name` string would trip the check), whereas `species_name` is the
 * one column the result types below deliberately keep — it is what
 * discriminates the union. Being a runtime `Set<string>` rather than a column
 * union of a generated `Row` also makes it the wrong shape to derive from.
 */
export type BookkeepingColumn =
	| 'id'
	| 'group_id'
	| 'created_at'
	| 'updated_at'
	| 'temporal_unit';

/**
 * One all-species-combined stats cell as a consumer sees it: the generated
 * `SimpleStatsCache` row minus bookkeeping, plus the `species_name: null`
 * `lib/stats-cache.ts`'s `readStatsCacheRows` flattens onto every row of an
 * all-species read. Neither cache table has a `species_name` column of its
 * own, so the name is intersected on rather than read off the table.
 */
export type StatsCacheResult = Omit<
	Database['public']['Tables']['SimpleStatsCache']['Row'],
	BookkeepingColumn
> & { species_name: null };

/**
 * One per-species stats cell as a consumer sees it. `species_id` is omitted
 * alongside the bookkeeping columns: it is the pre-resolution form of
 * `species_name` — which `readStatsCacheRows` resolves through a
 * `Species(species_name)` embed — and no consumer reads both, so keeping it
 * would make the type carry two spellings of the same thing.
 */
export type StatsCacheBySpeciesResult = Omit<
	Database['public']['Tables']['SimpleStatsCacheBySpecies']['Row'],
	BookkeepingColumn | 'species_id'
> & { species_name: string };

/**
 * Any stats cell, from either cache table. Discriminated on `species_name`
 * (`null` vs `string`), so a consumer can narrow to the by-species member
 * without a cast.
 */
export type StatsResult = StatsCacheResult | StatsCacheBySpeciesResult;

/**
 * The exact `StatsResult` member a statically-known `bySpecies`/
 * `group_by_species` argument implies, so a call site that knows which it
 * asked for gets the precise member with no narrowing — for the generic
 * fetchers #1372 puts on top of the union.
 */
export type StatsResultFor<BySpecies extends boolean> = BySpecies extends true
	? StatsCacheBySpeciesResult
	: StatsCacheResult;

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
 *
 * Both `importJobId` and `affectedSpeciesIds` are optional because an event
 * need not come from an import at all (#1379). A manual, arbitrarily-scoped
 * regenerate — built by `dispatchManualStatsCacheRegenerateEvent` from
 * `ManualStatsCacheRegenerateParams` rather than derived from an import's
 * affected dates — has no `ImportJobs` row to record its outcome on, so it
 * omits `importJobId` and the consumer skips tracking entirely; and it may
 * want every species rather than a touched subset, so it omits
 * `affectedSpeciesIds`. Omitted means exactly what it means on
 * `RefreshSpeciesNarrowing.speciesIds`, which this field feeds straight
 * through to: "no species narrowing — write every computed row". Every
 * import-derived event still carries both.
 */
export type StatsCacheRefreshEvent = {
	importJobId?: number;
	rpcParams: StatsCacheRefreshRpcParams;
	affectedDates?: string[];
	affectedSpeciesIds?: number[];
};

/**
 * The scope a manual, import-less stats-cache regenerate is requested with
 * (#1379) — one temporal unit, optionally narrowed to specific periods and/or
 * species. Deliberately *not* the `StatsCacheRefreshEvent` shape: a caller
 * asking for a regenerate has no `rpcParams` to build, no import's
 * `affectedDates` to derive anything from, and no `importJobId`, so it supplies
 * the scope directly and `dispatchManualStatsCacheRegenerateEvent` does the
 * one-event translation.
 *
 * `periods` are the same exact `time_period` strings
 * `StatsCacheRefreshRpcParams.periods` documents (first-of-month, first-of-year,
 * `2000-MM-01` squashed-month, or a literal day), and `undefined` means
 * "the whole temporal unit". `speciesIds` follows
 * `RefreshSpeciesNarrowing`'s convention — `undefined` is no species
 * narrowing.
 */
export type ManualStatsCacheRegenerateParams = {
	groupId: number;
	temporalUnit: StatsTemporalUnit;
	periods?: string[];
	speciesIds?: number[];
};

/**
 * The same scope `ManualStatsCacheRegenerateParams` names, minus `groupId`
 * (#1384) — the shape a group-facing caller supplies to
 * `requestManualStatsCacheRegenerate`. `groupId` is deliberately not a field
 * here: the caller (e.g. `app/actions/regenerate-stats-cache.ts`) resolves
 * its own group id separately (from the session cookie, never from request
 * input) and passes it as that function's own argument, so this type can
 * never be used to name another group's id.
 */
export type ManualStatsCacheRegenerateRequest = {
	temporalUnit: StatsTemporalUnit;
	/** Omit for every period of `temporalUnit` — see #1379's "omitted means all" convention. */
	periods?: string[];
	/** Omit for every species. */
	speciesIds?: number[];
};

/**
 * The outcome of a validated `requestManualStatsCacheRegenerate` call — a
 * rejected/malformed request and a request accepted onto the refresh queue
 * are both `success: false`/`true` respectively, with no distinction between
 * "validation failed" and "dispatch threw", matching the action-result
 * convention the rest of `app/actions/` already follows (e.g.
 * `UpdatePublicSummaryEnabledResult`). `success: true` here means "the
 * request was accepted and queued", not "the regenerate finished" — dispatch
 * is fire-and-forget (see `dispatchManualStatsCacheRegenerateEvent`'s own
 * doc comment).
 */
export type ManualStatsCacheRegenerateRequestResult =
	| { success: true }
	| { success: false; error: string };

import type { ImportJobStatus } from '@/app/models/db';
/** The outcome a stats-cache refresh can actually be recorded as. */
export type StatsCacheRefreshOutcome = Extract<
	ImportJobStatus,
	'succeeded' | 'failed'
>;

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

/**
 * The scope one `findSimpleStatsCacheDiscrepancies` comparison covers (#1389)
 * — deliberately the same `periods`/`speciesIds` contract
 * `RefreshSimpleStatsCacheParams` above already defines for the write path
 * (required and non-empty for every narrowing temporal unit —
 * `day`/`month`/`year`/`month-squashed` — ignored entirely for `all-time`),
 * plus the explicit `groupBySpecies` flag `runSimpleStatsCacheRefreshPass`
 * takes as a separate argument: one discrepancy check always targets exactly
 * one of `SimpleStatsCache`/`SimpleStatsCacheBySpecies`.
 *
 * There is deliberately no "every period that exists" mode. Working out the
 * full set of periods a whole-history report should check is the orchestrating
 * caller's concern; this function only ever compares the exact scope it is
 * given, exactly as the write path does.
 */
export type FindStatsCacheDiscrepanciesParams = RefreshSpeciesNarrowing & {
	groupId: number;
	temporalUnit: StatsTemporalUnit;
	groupBySpecies: boolean;
	periods?: string[];
};

/**
 * One cell whose materialized cache row disagrees with what the live
 * `stats_cache_*_metrics` RPCs compute for it (#1389). A cell present and
 * identical on both sides is never reported — this type only ever describes a
 * genuine discrepancy.
 *
 * Exactly one of `cachedRow`/`liveRow` is `null` for a presence mismatch (a
 * cell one side has and the other doesn't), in which case
 * `mismatchedFields` is empty — there is nothing to field-diff against, but
 * the presence mismatch is itself the discrepancy. When both sides are
 * present, `mismatchedFields` names every differing metric column, derived
 * from the live row's own keys (minus the two `MergedCellKey` columns) rather
 * than a hand-maintained list, so it can't drift from
 * `mergeSimpleMetricRows`' column set.
 */
export type StatsCacheDiscrepancy = MergedCellKey & {
	cachedRow: Record<string, unknown> | null;
	liveRow: SimpleMergedCell | null;
	mismatchedFields: string[];
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
