import { processStatsCacheRefreshWindowJob } from '@/app/api/queues/stats-cache-refresh-window/route';
import { getEventDispatcher } from '@/app/lib/queue-dispatch';
import { buildStatsCacheRefreshEvents } from './stats-cache-events';
import type {
	ManualStatsCacheRegenerateParams,
	StatsCacheRefreshEvent
} from '../types';
const STATS_CACHE_REFRESH_WINDOW_TOPIC = 'stats-cache-refresh-window';
const STATS_CACHE_REFRESH_DISPATCH_MODE_ENV_VAR = 'STATS_CACHE_REFRESH_DISPATCH_MODE'

/**
 * The one dispatcher both producers below publish through — same topic, same
 * dispatch-mode env var, same inline consumer — so an import-driven event and a
 * manual regenerate event can never diverge onto different queue plumbing.
 */
function getStatsCacheRefreshEventDispatcher() {
	return getEventDispatcher<StatsCacheRefreshEvent>(
		STATS_CACHE_REFRESH_WINDOW_TOPIC,
		STATS_CACHE_REFRESH_DISPATCH_MODE_ENV_VAR,
		processStatsCacheRefreshWindowJob
	);
}


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
		const dispatch = getStatsCacheRefreshEventDispatcher();
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

/**
 * Dispatches **one** stats-cache-refresh event for a scope a caller names
 * directly — one temporal unit, optionally narrowed to specific periods and/or
 * species — with no import behind it (#1379). The manual counterpart to
 * `dispatchStatsCacheRefreshEvents` above: a human- or UI-triggered regenerate
 * (e.g. #1374's consistency checker) that wants to rebuild a particular corner
 * of the cache, not everything an import happened to touch.
 *
 * Deliberately does **not** go through `buildStatsCacheRefreshEvents`, which
 * derives its scope from an import's affected dates and always emits up to five
 * events, one per temporal unit. Here the caller has already decided the exact
 * scope, so the event is built directly — but through the same topic and
 * dispatcher the import path uses, so there is exactly one queue and one
 * consumer.
 *
 * `params.periods` is stamped onto **both** `rpcParams.periods` and the
 * top-level `affectedDates`, because `deriveStatsCacheRefreshParams` reads the
 * former for `month`/`year`/`month-squashed` and the latter for `day`. Stamping
 * both means that function's existing per-temporal-unit branching needs no
 * manual-event special case: whichever field it reaches for, it finds the same
 * list. `all-time` omits `group_by_time_period` entirely, matching the
 * "omit the key for all-time" convention `buildStatsCacheRefreshEvents` and
 * `fetchSummaryStats` both follow.
 *
 * A dispatch failure is caught and logged rather than thrown, matching
 * `dispatchStatsCacheRefreshEvents`' own precedent above — a regenerate is a
 * recoverable derived step, and the next one supersedes a lost one.
 */
export async function dispatchManualStatsCacheRegenerateEvent(
	{ groupId, temporalUnit, periods, speciesIds }: ManualStatsCacheRegenerateParams,
	logContext: Record<string, unknown> = {}
): Promise<void> {
	try {
		const event: StatsCacheRefreshEvent = {
			rpcParams: {
				ringing_group_filter: groupId,
				...(temporalUnit === 'all-time'
					? {}
					: { group_by_time_period: temporalUnit }),
				...(periods ? { periods } : {})
			},
			...(periods ? { affectedDates: periods } : {}),
			...(speciesIds ? { affectedSpeciesIds: speciesIds } : {})
		};
		await getStatsCacheRefreshEventDispatcher()(event);
	} catch (dispatchError) {
		console.error(
			'Failed to dispatch a manual stats-cache-regenerate event',
			{ groupId, temporalUnit, ...logContext },
			dispatchError
		);
	}
}
