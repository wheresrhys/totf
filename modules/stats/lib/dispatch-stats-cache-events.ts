import { processStatsCacheRefreshWindowJob } from '@/app/api/queues/stats-cache-refresh-window/route';
import { getEventDispatcher } from '@/app/lib/queue-dispatch';
import { buildStatsCacheRefreshEvents } from './stats-cache-events';
import type { StatsCacheRefreshEvent } from '../types';
const STATS_CACHE_REFRESH_WINDOW_TOPIC = 'stats-cache-refresh-window';
const STATS_CACHE_REFRESH_DISPATCH_MODE_ENV_VAR = 'STATS_CACHE_REFRESH_DISPATCH_MODE'

export const dispatchStatsCacheRefreshEvent = getEventDispatcher<StatsCacheRefreshEvent>(
	STATS_CACHE_REFRESH_WINDOW_TOPIC,
	STATS_CACHE_REFRESH_DISPATCH_MODE_ENV_VAR,
	processStatsCacheRefreshWindowJob
)


/**
 * Builds the set of stats-cache-refresh events a successful import's affected
 * dates imply (#1141, collapsed to one-event-per-temporal-unit by #1154).
 * **At most five events** — one per temporal unit the import actually touched
 * (`all-time`, `day`, `month`, `month-squashed`, `year`) — each carrying
 * everything a worker needs to refresh that whole temporal unit in a single
 * pass, rather than recomputing a group's whole history. Every event also
 * carries the distinct species the import touched (`affectedSpeciesIds`), so
 * the consumer's species-grouped write can skip rewriting an untouched
 * species' cell regardless of temporal unit — see `StatsCacheRefreshEvent`'s
 * own doc comment.
 *
 * One event per temporal unit rather than one per distinct period instance,
 * because `refreshSimpleStatsCache` (#1152) takes `{groupId, temporalUnit,
 * periods?}` and refreshes **one temporal unit per call**, over however many
 * periods are handed to it. Emitting an event per
 * month and per year touched (as this module originally did) would force the
 * consumer into a per-period loop, defeating the one-worker-invocation-per-
 * temporal-unit point of that design.
 *
 * One of the five events carries no period data at all: `all-time` spans
 * everything, so there is nothing to narrow by.
 *
 * The day event is the odd one out among the rest: it narrows via
 * `from_date`/`to_date` plus `affectedDates` rather than `periods`, for the
 * reason set out on `StatsCacheRefreshEvent` below.
 *
 * The consumer that acts on these events lives in
 * `app/api/queues/stats-cache-refresh-window/route.ts` (#1155) — it maps each
 * event back onto `{groupId, temporalUnit, periods?}` and records the outcome
 * on that temporal unit's `ImportJobs` column; this module only decides *what*
 * to dispatch.
 */





/**
 * Builds and dispatches every stats-cache-refresh event a successful import's
 * affected dates (and, for the species-grouped write, affected species) imply
 * (#1141), the one piece of orchestration both import entry points need once
 * `completeImportJob` has run. Since #1154 that is at most five events — one
 * per temporal unit touched — so the loop below is exactly one dispatch call
 * per temporal unit. Each writes its own
 * `logContext` (the CLI script's `csvFilePath`/`ringingGroupName`, the web
 * route's none) onto the shared `{importJobId, ringingGroupId}` base so a
 * dispatch-failure log line is still identifiable per caller.
 *
 * A dispatch failure is caught and logged rather than thrown: refresh is a
 * recoverable derived step (#957's precedent), so a successful import must
 * still report success even if dispatching its follow-up events fails. This
 * is a plain function rather than a method on `ImportJobTracker` — it doesn't
 * read or write the `ImportJobs` row at all, it only consumes the id the
 * tracker already minted.
 */
export async function dispatchStatsCacheRefreshEvents(
	importJobId: number,
	ringingGroupId: number,
	affectedDates: string[],
	affectedSpeciesIds: number[],
	logContext: Record<string, unknown> = {}
): Promise<void> {
	try {
		const statsCacheRefreshEvents = buildStatsCacheRefreshEvents(
			importJobId,
			ringingGroupId,
			affectedDates,
			affectedSpeciesIds
		);
		for (const event of statsCacheRefreshEvents) {
			await dispatchStatsCacheRefreshEvent(event);
		}
	} catch (dispatchError) {
		console.error(
			'Failed to dispatch stats-cache-refresh-window events',
			{ importJobId, ringingGroupId, ...logContext },
			dispatchError
		);
	}
}
