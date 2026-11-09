'use server';

import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { findSimpleStatsCacheDiscrepancies } from '@/modules/stats';
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
 * field straight through to `modules/stats`' comparison function with no
 * narrowing logic of its own. In particular, `periods`/`speciesIds` are
 * forwarded exactly as given (including left out entirely when the caller
 * doesn't supply them) rather than defaulted to some computed scope here;
 * deciding what periods a given scope check should run over is the caller's
 * job (the stats-consistency page's eager data fetcher for the
 * `all-time`/`year`/`month-squashed` scopes, or the report UI's "Run check"
 * trigger for the `month`/`day` scopes).
 */
export async function fetchStatsCacheDiscrepancies(
	params: FetchStatsCacheDiscrepanciesParams
): Promise<FetchStatsCacheDiscrepanciesResult> {
	const groupId = await getGroupCookie();
	if (groupId === null) {
		return { success: false, error: 'No group selected' };
	}

	const supabase = await getAuthenticatedSupabaseClient();
	const discrepancies = await findSimpleStatsCacheDiscrepancies(supabase, {
		groupId,
		temporalUnit: params.temporalUnit,
		groupBySpecies: params.bySpecies,
		periods: params.periods,
		speciesIds: params.speciesIds
	});

	return { success: true, discrepancies };
}
