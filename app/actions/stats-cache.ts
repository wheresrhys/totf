'use server';
import { fetchAllPaginatedRows } from '@/lib/supabase';
import type {
	BiometricsStatsResult,
	CoreStatsResult,
	StatsSpineResult
} from '@/app/models/db';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cachedSupabaseFetch } from '../lib/cached-supabase-fetch';
import type { TemporalUnit } from '@/app/components/shared/StatOutput';
import type { ViewedGroup } from '@/app/lib/group-slug';
export type StatsRepository = {
	coreStats: CoreStatsResult[];
	coreStatsWithSpecies: CoreStatsResult[];
	biometricsStatsWithSpecies: BiometricsStatsResult[];
};
import { groupByColumn } from '@/app/lib/generic-utils';

function getStatsRPCFetcher<ResultType>(
	rpcName: string,
	temporalUnit: TemporalUnit,
	groupBySpecies: boolean = false
) {
	return async (supabase: SupabaseClient, groupId: number) =>
		fetchAllPaginatedRows<ResultType>((fromRow, toRow) => {
			const request = supabase
				.rpc(rpcName, {
					ringing_group_filter: groupId,
					group_by_species: groupBySpecies,
					group_by_time_period: temporalUnit
				})
				.order('time_period');

			return groupBySpecies
				? request.order('species_name').range(fromRow, toRow)
				: request.range(fromRow, toRow);
		});
}

export async function getCachedStats<RowType>({
	rpcName,
	fetchDataBySpecies,
	temporalUnit,
	viewedGroup
}: {
	rpcName: string;
	fetchDataBySpecies: boolean;
	temporalUnit: TemporalUnit;
	viewedGroup: ViewedGroup;
}): Promise<RowType[]> {
	return cachedSupabaseFetch(
		`${temporalUnit}-${rpcName}${fetchDataBySpecies ? '-by-species' : ''}`,
		viewedGroup,
		getStatsRPCFetcher<RowType>(rpcName, temporalUnit)
	);
}

export async function getStatsByTemporalUnit(
	temporalUnit: TemporalUnit,
	viewedGroup: ViewedGroup
): Promise<StatsRepository> {
	const [coreStats, coreStatsWithSpecies, biometricsStatsWithSpecies] =
		await Promise.all([
			cachedSupabaseFetch(
				`${temporalUnit}-core-stats`,
				viewedGroup,
				getStatsRPCFetcher<CoreStatsResult>('core_stats', temporalUnit)
			),
			cachedSupabaseFetch(
				`${temporalUnit}-species-core-stats`,
				viewedGroup,
				getStatsRPCFetcher<CoreStatsResult>('core_stats', temporalUnit, true)
			),
			cachedSupabaseFetch(
				`${temporalUnit}-species-biometrics-stats`,
				viewedGroup,
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
export async function fetchCoreStatsByMonth(
	viewedGroup: ViewedGroup
): Promise<CoreStatsResult[]> {
	return cachedSupabaseFetch(
		'month-core-stats',
		viewedGroup,
		getStatsRPCFetcher<CoreStatsResult>('core_stats', 'month')
	);
}

export async function fetchStatsSpines(viewedGroup: ViewedGroup): Promise<{
	years: string[];
	months: string[];
	days: string[];
}> {
	const [years, months, days] = await Promise.all(
		['year', 'month', 'day'].map((temporalUnit) =>
			cachedSupabaseFetch(
				`${temporalUnit}-stats-spine`,
				viewedGroup,
				async (supabase: SupabaseClient, groupId: number) => {
					const rows = await fetchAllPaginatedRows<StatsSpineResult>(
						(fromRow, toRow) =>
							supabase
								.rpc('stats_spine', {
									ringing_group_filter: groupId,
									group_by_time_period: temporalUnit
								})
								.order('time_period')
								.range(fromRow, toRow)
					);
					return rows.map((row) => row.time_period);
				}
			)
		)
	);
	return { years, months, days };
}
