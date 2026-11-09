'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import {
	findSimpleStatsCacheDiscrepancies,
	readStatsCacheRows
} from '@/modules/stats';
import type { StatsCacheDiscrepancy } from '@/modules/stats';
import type { StatsTemporalUnit } from '@/app/models/temporal-unit';
import { getGroupCookie } from './group-cookie';

export type FetchStatsCacheDiscrepanciesParams = {
	temporalUnit: StatsTemporalUnit;
	bySpecies: boolean;
	periods?: string[];
	speciesIds?: number[];
};

export type FetchStatsCacheDiscrepanciesResult =
	| { success: true; discrepancies: StatsCacheDiscrepancy[] }
	| { success: false; error: string };

/**
 * `findSimpleStatsCacheDiscrepancies` deliberately runs no RPC calls at all
 * for a narrowing temporal unit (`day`/`month`/`year`/`month-squashed`) given
 * an empty `periods` — see its own doc comment and `modules/stats/CLAUDE.md`'s
 * "Finding cache discrepancies". Omitting `periods` entirely therefore made
 * every narrowing scope's check a trivial, instant "no discrepancies found"
 * no-op rather than a real comparison. When the caller hasn't named an
 * explicit scope, default to every period this `(temporalUnit, bySpecies)`
 * combination already has a cached row for — the "read distinct cached
 * `time_period`s" approach that module's doc flags as the orchestrating
 * caller's job. `all-time` ignores `periods` entirely either way, so it's
 * left `undefined` rather than paying for a pointless cache read.
 */
async function resolveDefaultPeriods(
	supabase: SupabaseClient,
	groupId: number,
	temporalUnit: StatsTemporalUnit,
	bySpecies: boolean
): Promise<string[] | undefined> {
	if (temporalUnit === 'all-time') {
		return undefined;
	}
	const cachedRows = await readStatsCacheRows({
		client: supabase,
		viewedGroup: { id: groupId, slug: null },
		bySpecies,
		temporalUnit
	});
	return [...new Set(cachedRows.map((row) => row.time_period as string))];
}

/**
 * Lets the caller's own group compare its materialized stats cache against
 * what the live `stats_cache_*_metrics` RPCs compute right now, for one
 * scope — the read-only consumer half of #1389's
 * `findSimpleStatsCacheDiscrepancies` (#1387's stats-consistency discrepancy
 * report).
 *
 * A thin wrapper, same shape as `regenerateStatsCache`
 * (`app/actions/regenerate-stats-cache.ts`): it resolves the caller's own
 * group id from the session cookie — never an explicit `groupId` param, so a
 * group can only ever inspect its own data — and otherwise passes every
 * field straight through to `modules/stats`' comparison function. `speciesIds`
 * is forwarded exactly as given (including left out entirely when the
 * caller doesn't supply it); `periods` is too, *unless* the caller left it
 * out, in which case `resolveDefaultPeriods` fills in every period already
 * cached for this scope (see its own doc comment for why — leaving `periods`
 * empty makes the comparison a trivial no-op for every temporal unit but
 * `all-time`, not a "check everything" request).
 */
export async function fetchStatsCacheDiscrepancies(
	params: FetchStatsCacheDiscrepanciesParams
): Promise<FetchStatsCacheDiscrepanciesResult> {
	const groupId = await getGroupCookie();
	if (groupId === null) {
		return { success: false, error: 'No group selected' };
	}

	const supabase = await getAuthenticatedSupabaseClient();
	const periods =
		params.periods ??
		(await resolveDefaultPeriods(
			supabase,
			groupId,
			params.temporalUnit,
			params.bySpecies
		));
	const discrepancies = await findSimpleStatsCacheDiscrepancies(supabase, {
		groupId,
		temporalUnit: params.temporalUnit,
		groupBySpecies: params.bySpecies,
		periods,
		speciesIds: params.speciesIds
	});

	return { success: true, discrepancies };
}
