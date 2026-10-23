import { handleCallback } from '@vercel/queue';
// Relative, not `@/`-aliased, for every import below: `lib/queue-dispatch.ts`'s
// inline mode imports this module from `lib/`, so it is loaded by the CLI
// importer's `tsx` runner (`supabase/scripts/import-csv.ts`) as well as by
// Next.js. `app/lib/auth/group-auth.ts` reaches into `lib/` the same way and
// for the same reason — see `lib/queue-dispatch.ts`'s own import comment. The
// event type was the only import here while this consumer was a noop, and
// being type-only it was erased before resolution ever mattered.
import {
	ImportJobTracker,
	type StatsCacheRefreshOutcome
} from '../../../../lib/demon-import';
import {
	refreshComplexStatsCache,
	refreshSimpleStatsCache,
	type TemporalUnit
} from '../../../../lib/stats-cache-refresh';
import type { StatsCacheRefreshEvent } from '../../../../lib/stats-cache-refresh-events';
import { getAuthenticatedSupabaseClientForGroup } from '../../../lib/auth/group-auth';

/**
 * What one `StatsCacheRefreshEvent` means to the two refresh functions, which
 * take `{groupId, temporalUnit, periods?}` rather than the event's own
 * RPC-filter-shaped payload.
 */
type StatsCacheRefreshParams = {
	groupId: number;
	temporalUnit: TemporalUnit;
	periods?: string[];
};

/**
 * The temporal units whose touched periods ride on `rpcParams.periods` (#1154's
 * collapsed month/year events). `day` carries its exact days in the event's
 * top-level `affectedDates` instead, because its `from_date`/`to_date` window
 * can span gap days with no activity; `month-squashed`/`all-time` carry no
 * period data at all, since both refresh functions full-replace those temporal
 * units and ignore `periods` outright.
 */
const PERIODS_FROM_RPC_PARAMS_TEMPORAL_UNITS: readonly TemporalUnit[] = [
	'month',
	'year'
];

/**
 * Maps one dispatched event onto the arguments `refreshSimpleStatsCache`/
 * `refreshComplexStatsCache` take. Its own named function, not inlined in the
 * handler, because the period-sourcing rule differs per temporal unit and is
 * the most error-prone part of this consumer — see
 * `__tests__/route.test.ts`'s first describe block.
 */
export function deriveStatsCacheRefreshParams(
	event: StatsCacheRefreshEvent
): StatsCacheRefreshParams {
	const { ringing_group_filter: groupId, group_by_time_period } =
		event.rpcParams;

	// The all-time event omits the key entirely (#1154) rather than carrying a
	// literal `'all-time'`, matching `fetchSummaryStats`' own all-time
	// convention.
	const temporalUnit: TemporalUnit = group_by_time_period ?? 'all-time';

	if (temporalUnit === 'day') {
		return { groupId, temporalUnit, periods: event.affectedDates };
	}
	if (PERIODS_FROM_RPC_PARAMS_TEMPORAL_UNITS.includes(temporalUnit)) {
		return { groupId, temporalUnit, periods: event.rpcParams.periods };
	}
	return { groupId, temporalUnit, periods: undefined };
}

/**
 * Runs one of the two cache refreshes, catching and logging its failure rather
 * than letting it escape, and reporting back whether it landed. Its own helper
 * so each refresh gets its own `try`/`catch` — see
 * `processStatsCacheRefreshWindowJob`'s "no transaction spans the two
 * refreshes" note for why they must not share one.
 *
 * `cacheTable` is in the log context so a partial failure names *which* cache
 * went stale; without it the two are indistinguishable in the logs, which is
 * the only place a partial failure is visible at per-cache granularity (the
 * `ImportJobs` column records one outcome for the temporal unit as a whole).
 */
async function runCacheRefresh(
	cacheTable: 'SimpleStatsCache' | 'ComplexStatsCache',
	refreshCache: () => Promise<void>,
	logContext: {
		importJobId: number;
		groupId: number;
		temporalUnit: TemporalUnit;
	}
): Promise<boolean> {
	try {
		await refreshCache();
		return true;
	} catch (refreshError) {
		console.error(
			'Failed to refresh a stats cache for a stats-cache-refresh-window event',
			{ ...logContext, cacheTable },
			refreshError
		);
		return false;
	}
}

/**
 * Consumer for the `stats-cache.refresh-window` topic (#1141, made real by
 * #1155): refreshes both stats caches for the one temporal unit this event
 * covers, then records the outcome on that temporal unit's own
 * `ImportJobs.*_stats_refresh_status` column (#1154).
 *
 * Deliberately a plain exported async function rather than inline logic in
 * `POST` below, per ADR 0001's Question 1: `lib/queue-dispatch.ts`'s inline
 * dispatch mode calls it directly, in-process, with no HTTP round trip and no
 * CloudEvent envelope to construct.
 *
 * **One `authenticated` client for every write**, minted from the payload's
 * group id via `getAuthenticatedSupabaseClientForGroup` — a queue consumer has
 * no cookie to read a session off and no service-role key (ADR 0001, "The
 * consequence that matters most for this codebase: there is no cookie"), and
 * the topic is air-gapped so only this deployment's own producer can publish
 * to it. Matches #1152/#1153's own `authenticated`-scoped write model.
 *
 * **A failure is terminal here, not retried.** `handleCallback` below is
 * registered with no `retry` callback (the ADR's DLQ-substitute `retry`
 * callback is deferred future work), so this handler catches a refresh failure
 * itself, logs it, writes `'failed'` to the temporal unit's column and resolves
 * normally — simpler and sufficient for a job that is not chunked or resumable.
 * Same "a derived/recoverable step's failure is caught and logged, not thrown"
 * precedent `dispatchStatsCacheRefreshEvents` (`lib/demon-import.ts`) already
 * set one level up at the dispatch call site, applied one level deeper.
 *
 * **No transaction spans the two refreshes, and none can from here** (asked on
 * PR #1174's review). Every write either refresh makes goes out over PostgREST
 * as its own HTTP request, each of which Postgres runs in its own implicit
 * transaction; `supabase-js` exposes no `BEGIN`/`COMMIT` and no way to pin a
 * sequence of requests to one connection, so there is no client-side
 * transaction to open. Nor is one refresh internally atomic — each makes
 * several round trips of its own (its metric RPCs, its `.upsert()`, its
 * dead-letter insert; see `lib/stats-cache-refresh.ts`), so "wrap the two in a
 * transaction" would mean pushing the whole merge-and-write pipeline down into
 * SQL. #1169 deliberately moved the *opposite* way — it deleted the
 * `upsert_*_stats_cache_rows` RPCs in favour of native `.upsert()` — so that is
 * a design reversal, not a tweak.
 *
 * **Partial application is safe, which is why that's acceptable.** Both caches
 * are derived data, rebuildable from `Encounters` at any time; both writes are
 * idempotent upserts keyed on `(group_id, temporal_unit, time_period,
 * species_id)`; neither ever deletes a row. So a half-applied pass leaves one
 * cache fresh and the other stale — never a torn or invented value — and
 * re-running the same event converges. The staleness is recorded rather than
 * silent: either refresh failing writes `'failed'` to the temporal unit's
 * column below, so the unit is flagged as not-fresh for a re-refresh, and each
 * failure is logged with the `cacheTable` that went stale.
 *
 * The two therefore run **independently, each with its own `try`/`catch`**
 * (`runCacheRefresh` above) rather than sharing one: since there's no atomicity
 * to preserve, letting a `SimpleStatsCache` failure skip the
 * `ComplexStatsCache` refresh too would strand two stale caches where one would
 * do. Sequentially rather than via `Promise.all`, to keep one group's refresh
 * from opening both caches' metric RPCs at once.
 */
export async function processStatsCacheRefreshWindowJob(
	event: StatsCacheRefreshEvent
): Promise<void> {
	const { importJobId } = event;
	const { groupId, temporalUnit, periods } =
		deriveStatsCacheRefreshParams(event);

	const supabaseClient = await getAuthenticatedSupabaseClientForGroup(groupId);
	const importJobTracker = new ImportJobTracker(supabaseClient);

	const refreshParams = { groupId, temporalUnit, periods };
	const logContext = { importJobId, groupId, temporalUnit };

	const simpleRefreshSucceeded = await runCacheRefresh(
		'SimpleStatsCache',
		() => refreshSimpleStatsCache(supabaseClient, refreshParams),
		logContext
	);
	const complexRefreshSucceeded = await runCacheRefresh(
		'ComplexStatsCache',
		() => refreshComplexStatsCache(supabaseClient, refreshParams),
		logContext
	);
	const refreshOutcome: StatsCacheRefreshOutcome =
		simpleRefreshSucceeded && complexRefreshSucceeded ? 'succeeded' : 'failed';

	try {
		await importJobTracker.markStatsCacheRefreshed(
			importJobId,
			temporalUnit,
			refreshOutcome
		);
	} catch (trackerError) {
		// Failing to *record* the outcome must not throw past the handler either —
		// there is nothing further this consumer could do about it.
		console.error(
			'Failed to record a stats-cache refresh outcome on ImportJobs',
			{ ...logContext, refreshOutcome },
			trackerError
		);
	}
}

export const POST = handleCallback(processStatsCacheRefreshWindowJob);
