/**
 * Builds the set of stats-cache-refresh events a successful import's affected
 * dates imply (#1141). One event per distinct time window the import actually
 * touched — an all-time event, a day-range, and one event per parent month,
 * squashed-month, and year — each carrying the RPC params a future worker
 * needs to refresh the stats cache at exactly that granularity, rather than
 * recomputing a group's whole history. The day-range event additionally
 * carries `affectedDates` — the exact dates that changed, since its own
 * from/to range can span gap days with no activity (see
 * `StatsCacheRefreshEvent`'s doc comment); no other event needs or carries
 * this field. The consumer that acts on these events is deliberately a noop
 * for now (`app/api/queues/stats-cache-refresh-window/`); this module only
 * decides *what* to dispatch.
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
 */
export type StatsCacheRefreshRpcParams = {
	ringing_group_filter: number;
	group_by_time_period?: 'day' | 'month' | 'month-squashed' | 'year';
	from_date?: string;
	to_date?: string;
	year_filter?: number;
	month_filter?: number;
};

/**
 * `affectedDates` is event metadata, not an RPC filter — it lives top-level
 * on the event rather than inside `rpcParams`. It is only ever set on the
 * day-range event (see `buildStatsCacheRefreshEvents`'s day-range comment
 * for why): that event's `from_date`/`to_date` span the min/max of the
 * affected dates, which can include gap days with no actual activity (e.g.
 * an import touching the 1st and the 28th of a month produces a day-range
 * event spanning the 1st–28th). A future consumer refreshing by exact day
 * needs the precise set of changed days, which only this field supplies —
 * the broader-granularity events (month/month-squashed/year/all-time)
 * don't have this gap, since their own from/to or filter already covers
 * their whole bucket, so they omit the field entirely rather than carrying
 * it unset.
 */
export type StatsCacheRefreshEvent = {
	importJobId: number;
	rpcParams: StatsCacheRefreshRpcParams;
	affectedDates?: string[];
};

/**
 * Minimal duplicate of `app/lib/highlights/lib/highlight-utils.ts`'s
 * `dateToYearMonth` — deliberately not imported, since `lib/` is cross-zone
 * shared code and `app/lib/` is app-only (root `CLAUDE.md`'s "Project
 * structure").
 */
function toYearMonth(date: string): { year: number; month: number } {
	const [year, month] = date.split('-');
	return { year: Number(year), month: Number(month) };
}

/**
 * Builds one `StatsCacheRefreshEvent` per distinct time window
 * `affectedDates` touches. Returns `[]` for an empty input — there is nothing
 * to refresh. Every emitted event is stamped with `importJobId` and
 * `ringing_group_filter`. Dedup/order follows
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

	const events: StatsCacheRefreshEvent[] = [];

	// All-time: no group_by_time_period key at all, no date/year/month filters.
	events.push(stamp({}));

	// Day-range: spans the min/max of the affected dates. This range can
	// contain gap days with no actual activity (e.g. dates on the 1st and
	// the 28th produce a range spanning the whole month), so this is the
	// only event stamped with `affectedDates` — the exact deduped/sorted
	// list of days a day-granularity consumer actually needs to refresh.
	events.push({
		...stamp({
			group_by_time_period: 'day',
			from_date: sortedDates[0],
			to_date: sortedDates[sortedDates.length - 1]
		}),
		affectedDates: sortedDates
	});

	const yearMonths = sortedDates.map(toYearMonth);

	// One 'month' event per distinct (year, month) pair, zero-padded so string
	// sort stays chronological.
	const monthKeys = [
		...new Set(
			yearMonths.map(
				({ year, month }) => `${year}-${String(month).padStart(2, '0')}`
			)
		)
	].sort();
	for (const key of monthKeys) {
		const [yearPart, monthPart] = key.split('-');
		events.push(
			stamp({
				group_by_time_period: 'month',
				year_filter: Number(yearPart),
				month_filter: Number(monthPart)
			})
		);
	}

	// One 'month-squashed' event per distinct month number (no year_filter).
	const squashedMonths = [
		...new Set(yearMonths.map(({ month }) => month))
	].sort((a, b) => a - b);
	for (const month of squashedMonths) {
		events.push(
			stamp({ group_by_time_period: 'month-squashed', month_filter: month })
		);
	}

	// One 'year' event per distinct year (no month_filter).
	const years = [...new Set(yearMonths.map(({ year }) => year))].sort(
		(a, b) => a - b
	);
	for (const year of years) {
		events.push(stamp({ group_by_time_period: 'year', year_filter: year }));
	}

	return events;
}
