import { processStatsCacheRefreshWindowJob } from '@/app/api/queues/stats-cache-refresh-window/route';
import { getEventDispatcher } from '@/app/lib/queue-dispatch';
import { buildStatsCacheRefreshEvents } from './stats-cache-events';
import { temporalUnitNameMapping, type StatsTemporalUnit } from '@/app/models/temporal-unit';
import type {
	ManualStatsCacheRegenerateParams,
	ManualStatsCacheRegenerateRequest,
	ManualStatsCacheRegenerateRequestResult,
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

const VALID_TEMPORAL_UNITS: readonly string[] = Object.keys(
	temporalUnitNameMapping
);

function isValidTemporalUnit(value: unknown): value is StatsTemporalUnit {
	return typeof value === 'string' && VALID_TEMPORAL_UNITS.includes(value);
}

/** `undefined` passes (it means "no narrowing") — only a given-but-malformed value is rejected. */
function isUndefinedOrNonEmptyArrayOf(
	value: unknown,
	itemIsValid: (item: unknown) => boolean
): boolean {
	return (
		value === undefined ||
		(Array.isArray(value) && value.length > 0 && value.every(itemIsValid))
	);
}

/**
 * Validates a group-facing, arbitrarily-scoped manual stats-cache regenerate
 * request (#1374's consistency checker) and, once valid, dispatches it via
 * `dispatchManualStatsCacheRegenerateEvent` above (#1384's PR review: this
 * logic started out living directly in `app/actions/regenerate-stats-cache.ts`,
 * which should stay a thin wrapper — resolving the caller's own `groupId`
 * off the session cookie and delegating everything else here).
 *
 * Takes `groupId` as an explicit, separate argument rather than a field of
 * `request` — the caller resolves it itself (e.g. from the session cookie,
 * the same `updatePublicSummaryEnabled` convention follows) and this
 * function has no way to regenerate a group's cache on another group's
 * behalf.
 *
 * `request`'s fields are typed as `ManualStatsCacheRegenerateRequest`
 * declares them, but this function re-validates them at runtime regardless
 * — it sits behind a Next.js Server Action, a wire boundary TypeScript's
 * compile-time types don't police, so a malformed call (or a future
 * non-TS caller) is still caught here rather than crashing deeper in the
 * dispatch pipeline.
 *
 * A dispatch failure is caught and logged, not thrown — see
 * `dispatchManualStatsCacheRegenerateEvent`'s own doc comment — so a
 * `success: true` result here means "the request was accepted and queued",
 * not "the regenerate finished".
 */
export async function requestManualStatsCacheRegenerate(
	groupId: number,
	{ temporalUnit, periods, speciesIds }: ManualStatsCacheRegenerateRequest
): Promise<ManualStatsCacheRegenerateRequestResult> {
	try {
		if (!isValidTemporalUnit(temporalUnit)) {
			return { success: false, error: 'Invalid temporal unit' };
		}
		if (
			!isUndefinedOrNonEmptyArrayOf(
				periods,
				(period) => typeof period === 'string'
			)
		) {
			return {
				success: false,
				error: 'periods must be a non-empty array of strings when given'
			};
		}
		if (
			!isUndefinedOrNonEmptyArrayOf(
				speciesIds,
				(speciesId) => typeof speciesId === 'number'
			)
		) {
			return {
				success: false,
				error: 'speciesIds must be a non-empty array of numbers when given'
			};
		}

		await dispatchManualStatsCacheRegenerateEvent({
			groupId,
			temporalUnit,
			...(periods ? { periods } : {}),
			...(speciesIds ? { speciesIds } : {})
		});

		return { success: true };
	} catch (error) {
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: 'Failed to regenerate stats cache'
		};
	}
}
