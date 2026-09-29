'use server';
import { fetchAllPaginatedRows } from '@/lib/supabase';
import type { BiometricsStatsResult, CoreStatsResult } from '@/app/models/db';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cachedSupabaseFetch } from '../lib/cached-supabase-fetch';
import type { TemporalUnit } from '@/app/components/shared/StatOutput';
export type StatsRepository = {
	coreStats: CoreStatsResult[];
	coreStatsWithSpecies: CoreStatsResult[];
	biometricsStatsWithSpecies: BiometricsStatsResult[];
};

function getStatsRPCFetcher<ResultType>(
	rpcName: string,
	temporalUnit: TemporalUnit,
	groupBySpecies: boolean = false
) {
	return async (supabase: SupabaseClient, viewedGroupId: number) =>
		fetchAllPaginatedRows<ResultType>((fromRow, toRow) => {
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
): Promise<StatsRepository> {
	const [coreStats, coreStatsWithSpecies, biometricsStatsWithSpecies] =
		await Promise.all([
			cachedSupabaseFetch(
				`${temporalUnit}-core-stats`,
				viewedGroupId,
				getStatsRPCFetcher<CoreStatsResult>('core_stats', temporalUnit)
			),
			cachedSupabaseFetch(
				`${temporalUnit}-species-core-stats`,
				viewedGroupId,
				getStatsRPCFetcher<CoreStatsResult>('core_stats', temporalUnit, true)
			),
			cachedSupabaseFetch(
				`${temporalUnit}-species-biometrics-stats`,
				viewedGroupId,
				getStatsRPCFetcher<BiometricsStatsResult>(
					'biometrics_stats',
					temporalUnit,
					true
				)
			)
		]);

	return {
		coreStats,
		coreStatsWithSpecies,
		biometricsStatsWithSpecies
	};
}
