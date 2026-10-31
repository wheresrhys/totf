import type {
  SimpleStatsCacheBySpeciesRow,
  SimpleStatsCacheRow
} from '@/app/models/db';
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
  group_by_time_period?: 'day' | 'month' | 'month-squashed' | 'year';
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
