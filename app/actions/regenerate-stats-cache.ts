'use server';

import { dispatchManualStatsCacheRegenerateEvent } from '@/modules/stats';
import {
	temporalUnitNameMapping,
	type StatsTemporalUnit
} from '@/app/models/temporal-unit';
import { getGroupCookie } from './group-cookie';

const VALID_TEMPORAL_UNITS: readonly string[] = Object.keys(
	temporalUnitNameMapping
);

export type RegenerateStatsCacheParams = {
	temporalUnit: StatsTemporalUnit;
	/** Omit for every period of `temporalUnit` — see #1379's "omitted means all" convention. */
	periods?: string[];
	/** Omit for every species. */
	speciesIds?: number[];
};

export type RegenerateStatsCacheResult =
	| { success: true }
	| { success: false; error: string };

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
 * Lets the caller's own group trigger a manual, arbitrarily-scoped
 * stats-cache regenerate (#1374's consistency checker) — one temporal unit,
 * optionally narrowed to specific periods and/or species. A thin validating
 * wrapper around #1379's `dispatchManualStatsCacheRegenerateEvent`: this
 * function does no event-building of its own.
 *
 * Never takes an explicit `groupId` param — it always reads the caller's own
 * group id from the session cookie, the same `updatePublicSummaryEnabled`
 * convention (`app/actions/settings.ts`) follows, so a group can only ever
 * regenerate its own data.
 *
 * Dispatch is fire-and-forget onto the queue (the dispatcher itself catches
 * and logs rather than throwing — see `modules/stats/CLAUDE.md`'s "Manual
 * regenerate events"), so a `success: true` here means "the request was
 * accepted and queued", not "the regenerate finished".
 */
export async function regenerateStatsCache({
	temporalUnit,
	periods,
	speciesIds
}: RegenerateStatsCacheParams): Promise<RegenerateStatsCacheResult> {
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

		const groupId = await getGroupCookie();
		if (groupId === null) {
			return { success: false, error: 'No group selected' };
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
