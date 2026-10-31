import { processStatsCacheRefreshWindowJob } from '@/app/api/queues/stats-cache-refresh-window/route';
import { getEventDispatcher } from '@/app/lib/queue-dispatch';
import { buildStatsCacheRefreshEvents } from './stats-cache-events';
import type { StatsCacheRefreshEvent } from '../types';
const STATS_CACHE_REFRESH_WINDOW_TOPIC = 'stats-cache-refresh-window';
const STATS_CACHE_REFRESH_DISPATCH_MODE_ENV_VAR = 'STATS_CACHE_REFRESH_DISPATCH_MODE'


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
		const dispatch = getEventDispatcher<StatsCacheRefreshEvent>(
			STATS_CACHE_REFRESH_WINDOW_TOPIC,
			STATS_CACHE_REFRESH_DISPATCH_MODE_ENV_VAR,
			processStatsCacheRefreshWindowJob
		);
		for (const event of statsCacheRefreshEvents) {
			await dispatch(event);
		}
	} catch (dispatchError) {
		console.error(
			'Failed to dispatch stats-cache-refresh-window events',
			{ importJobId, ringingGroupId, ...logContext },
			dispatchError
		);
	}
}
