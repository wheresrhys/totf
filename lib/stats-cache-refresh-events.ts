/**
 * Builds the set of stats-cache-refresh events a successful import's affected
 * dates imply (#1141, collapsed to one-event-per-temporal-unit by #1154).
 * **At most five events** — one per temporal unit the import actually touched
 * (`all-time`, `day`, `month`, `month-squashed`, `year`) — each carrying
 * everything a worker needs to refresh that whole temporal unit in a single
 * pass, rather than recomputing a group's whole history.
 *
 * One event per temporal unit rather than one per distinct period instance,
 * because `refreshSimpleStatsCache`/`refreshComplexStatsCache` (#1152/#1153)
 * take `{groupId, temporalUnit, periods?}` and refresh **one temporal unit per
 * call**, over however many periods are handed to them. Emitting an event per
 * month and per year touched (as this module originally did) would force the
 * consumer into a per-period loop, defeating the one-worker-invocation-per-
 * temporal-unit point of that design.
 *
 * Two of the five events carry no period data at all:
 * - `all-time` spans everything, so there is nothing to narrow by.
 * - `month-squashed` cells span every year's copy of a month, so both refresh
 *   functions always full-replace that temporal unit and ignore `periods`
 *   entirely — the event carries only the temporal-unit marker.
 *
 * The day event is the odd one out: it narrows via `from_date`/`to_date` plus
 * `affectedDates` rather than `periods`, for the reason set out on
 * `StatsCacheRefreshEvent` below.
 *
 * The consumer that acts on these events lives in
 * `app/api/queues/stats-cache-refresh-window/route.ts` (#1155) — it maps each
 * event back onto `{groupId, temporalUnit, periods?}` and records the outcome
 * on that temporal unit's `ImportJobs` column; this module only decides *what*
 * to dispatch.
 */

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
 * the exact set of `time_period` values the month/year event's temporal unit
 * should write, in the literal string shape the metric RPCs return it in — a
 * first-of-month (`YYYY-MM-01`) or first-of-year (`YYYY-01-01`) ISO date, since
 * `stats_spine.sql`'s period_spine CTE computes those cells as
 * `date_trunc('month'|'year', d)::date`. `refreshSimpleStatsCache` splits
 * `periods` back into one exact-match `year_filter`/`month_filter` metric-RPC
 * call per distinct period (#1176 — a period string parses straight into those
 * two numbers, so the call selects precisely that month/year with no date
 * window involved at all; see `buildSimpleMetricRpcParamsList` in
 * `lib/stats-cache-refresh.ts`), and `day` — the one unit that narrows by a
 * `from_date`/`to_date` window instead — filters its merged rows back down to
 * `periods` by literal string membership against `time_period`. Either way the
 * strings have to match that shape exactly.
 *
 * It replaced a per-event, single-value `year_filter`/`month_filter` pair on
 * this type, which no event needs any more now that every temporal unit either
 * carries an array, carries its own date window (`day`), or full-replaces
 * (`month-squashed`/`all-time`).
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
 * coarser temporal units don't have that gap — month/year narrow by their own
 * `periods` array (every entry of which was genuinely touched), and
 * `month-squashed`/`all-time` full-replace — so all four omit the field
 * entirely rather than carrying it unset.
 */
export type StatsCacheRefreshEvent = {
	importJobId: number;
	rpcParams: StatsCacheRefreshRpcParams;
	affectedDates?: string[];
};

/**
 * Builds one `StatsCacheRefreshEvent` per temporal unit `affectedDates`
 * touches — five of them whenever there is anything at all to refresh, and
 * `[]` for an empty input, since then there is nothing. Every emitted event is
 * stamped with `importJobId` and `ringing_group_filter`. Dedup/order follows
 * `ImportJobTracker.recordAffectedDates`'s `[...new Set(...)].sort()`
 * convention throughout, so output is deterministic regardless of input
 * order.
 */
export function buildStatsCacheRefreshEvents(
	importJobId: number,
	ringingGroupId: number,
	affectedDates: string[]
): StatsCacheRefreshEvent[] {
	if (affectedDates.length === 0) {
		return [];
	}

	const sortedDates = [...new Set(affectedDates)].sort();

	function stamp(
		rpcParams: Omit<StatsCacheRefreshRpcParams, 'ringing_group_filter'>
	): StatsCacheRefreshEvent {
		return {
			importJobId,
			rpcParams: { ringing_group_filter: ringingGroupId, ...rpcParams }
		};
	}

	/**
	 * `yyyy-MM-dd` strings sort lexicographically in date order, so truncating
	 * each date to its period's first day and deduping leaves the list sorted
	 * chronologically without a date-aware comparator.
	 */
	function periodsTouched(
		firstDayOfPeriod: (date: string) => string
	): string[] {
		return [...new Set(sortedDates.map(firstDayOfPeriod))].sort();
	}

	return [
		// All-time: no group_by_time_period key at all, and no periods — this
		// temporal unit always full-replaces the group's whole history.
		stamp({}),

		// Day-range: spans the min/max of the affected dates. This range can
		// contain gap days with no actual activity (e.g. dates on the 1st and
		// the 28th produce a range spanning the whole month), so this is the
		// only event stamped with `affectedDates` — the exact deduped/sorted
		// list of days a day-temporal-unit consumer actually needs to refresh.
		{
			...stamp({
				group_by_time_period: 'day',
				from_date: sortedDates[0],
				to_date: sortedDates[sortedDates.length - 1]
			}),
			affectedDates: sortedDates
		},

		// Month: every distinct month touched, as first-of-month ISO dates.
		stamp({
			group_by_time_period: 'month',
			periods: periodsTouched((date) => `${date.slice(0, 7)}-01`)
		}),

		// Month-squashed: the temporal-unit marker alone. A squashed-month cell
		// spans every year's copy of its month, so both refresh functions
		// full-replace this temporal unit and ignore `periods`.
		//
		// Note this is a *mechanical* blocker, not a conceptual one (reviewed on
		// PR #1177). `month_filter` alone, with `year_filter` left NULL, is
		// exactly the squashed-month grouping and was verified to compute the
		// bucket correctly across every year — so narrowing by touched calendar
		// month is sound in principle. What stops it is `stats_spine`'s
		// month-squashed branch: an unconditional `generate_series(1, 12)` that
		// ignores `month_filter`, so a narrowed call still returns all 12
		// calendar cells, 11 of them spurious zeroes. Those collide across
		// `refreshSimpleStatsCache`'s per-period fan-out (every call emits the
		// same 12 cell keys), and `indexByCell`'s last-write-wins would let one
		// month's zero overwrite another's real value. Narrowing here therefore
		// needs a `stats_spine` change first — see that function's SQL.
		stamp({ group_by_time_period: 'month-squashed' }),

		// Year: every distinct year touched, as first-of-year ISO dates.
		stamp({
			group_by_time_period: 'year',
			periods: periodsTouched((date) => `${date.slice(0, 4)}-01-01`)
		})
	];
}
