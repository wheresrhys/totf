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

// Group-wide, ungrouped-by-species monthly core_stats — shares its cache
// namespace ('month-core-stats') with getStatsByTemporalUnit('month', ...)'s
// coreStats field, so a call to either is a cache hit for the other within
// the version/TTL window. Kept as its own function (rather than callers
// using getStatsByTemporalUnit directly) so a caller that only needs the
// ungrouped totals doesn't also trigger the species-grouped and biometrics
// RPC calls getStatsByTemporalUnit bundles alongside it.
export async function fetchGroupEffortHistory(
	viewedGroupId: number
): Promise<CoreStatsResult[]> {
	return cachedSupabaseFetch(
		'month-core-stats',
		viewedGroupId,
		getStatsRPCFetcher<CoreStatsResult>('core_stats', 'month')
	);
}
