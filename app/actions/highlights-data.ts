'use server';
import { fetchAllPaginatedRows } from '@/lib/supabase';
import type { CoreStatsResult } from '@/app/models/db';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cachedSupabaseFetch } from '../lib/cached-supabase-fetch';

type TemporalUnit = 'day' | 'month' | 'year';

export type RawStats = {
	bySpecies: CoreStatsResult[];
	overall: CoreStatsResult[];
};

function getStatsRPCFetcher(
	rpcName: string,
	temporalUnit: TemporalUnit,
	groupBySpecies: boolean = false
) {
	return async (supabase: SupabaseClient, viewedGroupId: number) =>
		fetchAllPaginatedRows<CoreStatsResult>((fromRow, toRow) => {
			const request = supabase
				.rpc(rpcName, {
					ringing_group_filter: viewedGroupId,
					group_by_species: groupBySpecies,
					group_by_time_period: temporalUnit
				})
				.order('time_period');

			return groupBySpecies
				? request.order('species_name').range(fromRow, toRow)
				: request.range(fromRow, toRow);
		});
}

export async function getStatsByTemporalUnit(
	temporalUnit: TemporalUnit,
	viewedGroupId: number
): Promise<{ bySpecies: CoreStatsResult[]; overall: CoreStatsResult[] }> {
	const [overall, bySpecies] = await Promise.all([
		cachedSupabaseFetch(
			`${temporalUnit}-core-stats`,
			viewedGroupId,
			getStatsRPCFetcher('core_stats', temporalUnit)
		),
		cachedSupabaseFetch(
			`${temporalUnit}-species-core-stats`,
			viewedGroupId,
			getStatsRPCFetcher('core_stats', temporalUnit, true)
		)
	]);

	return { bySpecies, overall };
}
