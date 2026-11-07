'use server';

import { requestManualStatsCacheRegenerate } from '@/modules/stats';
import type {
	ManualStatsCacheRegenerateRequest,
	ManualStatsCacheRegenerateRequestResult
} from '@/modules/stats';
import { getGroupCookie } from './group-cookie';

export type RegenerateStatsCacheParams = ManualStatsCacheRegenerateRequest;

export type RegenerateStatsCacheResult =
	ManualStatsCacheRegenerateRequestResult;

/**
 * Lets the caller's own group trigger a manual, arbitrarily-scoped
 * stats-cache regenerate (#1374's consistency checker) — one temporal unit,
 * optionally narrowed to specific periods and/or species. A thin wrapper
 * that resolves the caller's own group id from the session cookie and
 * delegates every bit of validation/dispatch logic to `modules/stats`'
 * `requestManualStatsCacheRegenerate` (#1384's PR review — this function used
 * to do that validation itself; it moved so the logic lives alongside
 * `dispatchManualStatsCacheRegenerateEvent`, is reusable by any other
 * caller, and is testable without mocking a Next.js action).
 *
 * Never takes an explicit `groupId` param — it always reads the caller's own
 * group id from the session cookie, the same `updatePublicSummaryEnabled`
 * convention (`app/actions/settings.ts`) follows, so a group can only ever
 * regenerate its own data.
 */
export async function regenerateStatsCache(
	params: RegenerateStatsCacheParams
): Promise<RegenerateStatsCacheResult> {
	const groupId = await getGroupCookie();
	if (groupId === null) {
		return { success: false, error: 'No group selected' };
	}

	return requestManualStatsCacheRegenerate(groupId, params);
}
