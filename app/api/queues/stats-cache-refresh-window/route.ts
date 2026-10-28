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
} from '@/lib/demon-import';
import {
	refreshSimpleStatsCache,
	type TemporalUnit
} from '@/modules/stats/stats-cache-refresh';
import type { StatsCacheRefreshEvent } from '@/modules/stats/stats-cache-refresh-events';
import { getAuthenticatedSupabaseClientForGroup } from '@/app/lib/auth/group-auth';

/**
 * What one `StatsCacheRefreshEvent` means to `refreshSimpleStatsCache`, which
 * takes `{groupId, temporalUnit, periods?, speciesIds?}` rather than the
 * event's own RPC-filter-shaped payload.
 */
type StatsCacheRefreshParams = {
	groupId: number;
	temporalUnit: TemporalUnit;
	periods?: string[];
	speciesIds: number[];
};

/**
 * The temporal units whose touched periods ride on `rpcParams.periods` (#1154's
 * collapsed month/year events, joined by `month-squashed` in #1178 once
 * `refreshSimpleStatsCache` could narrow it). `day` carries its exact days in
 * the event's top-level `affectedDates` instead, because its
 * `from_date`/`to_date` window can span gap days with no activity; `all-time`
 * carries no period data at all, since `refreshSimpleStatsCache` full-replaces
 * that temporal unit and ignores `periods` outright.
 *
 * `month-squashed` has to be listed here for its narrowing to work at all:
 * `refreshSimpleStatsCache` now treats it as a narrowing unit, and a narrowing
 * unit handed no periods refreshes *nothing* (see
 * `buildSimpleMetricRpcParamsList`'s early return).
 */
const PERIODS_FROM_RPC_PARAMS_TEMPORAL_UNITS: readonly TemporalUnit[] = [
	'month',
	'year',
	'month-squashed'
];

/**
 * Maps one dispatched event onto the arguments `refreshSimpleStatsCache`
 * takes. Its own named function, not inlined in the handler, because the
 * period-sourcing rule differs per temporal unit and is the most error-prone
 * part of this consumer — see `__tests__/route.test.ts`'s first describe
 * block. `speciesIds` has no such per-unit rule: every branch carries
 * `event.affectedSpeciesIds` straight through, since narrowing the
 * species-grouped write is sound for every temporal unit — see
 * `RefreshSpeciesNarrowing`'s own doc comment in `lib/stats-cache-refresh.ts`.
 */
export function deriveStatsCacheRefreshParams(
	event: StatsCacheRefreshEvent
): StatsCacheRefreshParams {
	const { ringing_group_filter: groupId, group_by_time_period } =
		event.rpcParams;
	const { affectedSpeciesIds: speciesIds } = event;

	// The all-time event omits the key entirely (#1154) rather than carrying a
	// literal `'all-time'`, matching `fetchSummaryStats`' own all-time
	// convention.
	const temporalUnit: TemporalUnit = group_by_time_period ?? 'all-time';

	if (temporalUnit === 'day') {
		return {
			groupId,
			temporalUnit,
			periods: event.affectedDates,
			speciesIds
		};
	}
	if (PERIODS_FROM_RPC_PARAMS_TEMPORAL_UNITS.includes(temporalUnit)) {
		return {
			groupId,
			temporalUnit,
			periods: event.rpcParams.periods,
			speciesIds
		};
	}
	return { groupId, temporalUnit, periods: undefined, speciesIds };
}

/**
 * Consumer for the `stats-cache-refresh-window` topic (#1141, made real by
 * #1155): refreshes `SimpleStatsCache` for the one temporal unit this event
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
 * There used to be a second refresh here, `refreshComplexStatsCache` against
 * a sibling `ComplexStatsCache`, run independently with its own `try`/`catch`
 * so one cache's failure never stranded the other — see PR #1174's review for
 * why no transaction could span the two. That cache was removed entirely once
 * its write path had been dead for a while; this consumer is back to a single
 * refresh and a single outcome.
 */
export async function processStatsCacheRefreshWindowJob(
	event: StatsCacheRefreshEvent
): Promise<void> {
	const { importJobId } = event;
	const { groupId, temporalUnit, periods, speciesIds } =
		deriveStatsCacheRefreshParams(event);

	const supabaseClient = await getAuthenticatedSupabaseClientForGroup(groupId);
	const importJobTracker = new ImportJobTracker(supabaseClient);

	const refreshParams = {
		groupId,
		temporalUnit,
		periods,
		speciesIds,
		importJobId
	};
	const logContext = { importJobId, groupId, temporalUnit };

	let refreshOutcome: StatsCacheRefreshOutcome = 'succeeded';
	try {
		await refreshSimpleStatsCache(supabaseClient, refreshParams);
	} catch {
		// Already logged with full refresh context — including which DB call
		// failed and which pass — inside refreshSimpleStatsCache itself.
		refreshOutcome = 'failed';
	}

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
