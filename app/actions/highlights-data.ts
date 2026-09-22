'use server';
import { fetchAllPaginatedRows } from '@/lib/supabase';
import type { CoreStatsResult } from '@/app/models/db';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cachedSupabaseFetch } from '../lib/cached-supabase-fetch';
import type { TemporalUnit } from '@/app/components/shared/StatOutput';

export type StatsRepository<T> = {
	overall: T[];
	withSpecies: T[];
	bySpecies: Record<string, T[]>;
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

function groupByColumn<T>(column: keyof T, rows: T[]): Record<string, T[]> {
	const aggregator: Record<string, T[]> = {};
	rows.forEach((row: T) => {
		const groupKey = row[column] as string;
		if (!(groupKey in aggregator)) {
			aggregator[groupKey] = [];
		}
		aggregator[groupKey].push(row);
	});
	return aggregator;
}

export async function getStatsByTemporalUnit(
	temporalUnit: TemporalUnit,
	viewedGroupId: number,
	supabaseClientOverride?: SupabaseClient
): Promise<StatsRepository<CoreStatsResult>> {
	const [overall, withSpecies] = await Promise.all([
		cachedSupabaseFetch(
			`${temporalUnit}-core-stats`,
			viewedGroupId,
			getStatsRPCFetcher('core_stats', temporalUnit),
			supabaseClientOverride
		),
		cachedSupabaseFetch(
			`${temporalUnit}-species-core-stats`,
			viewedGroupId,
			getStatsRPCFetcher('core_stats', temporalUnit, true),
			supabaseClientOverride
		)
	]);

	return {
		overall,
		withSpecies,
		bySpecies: groupByColumn('species_name', withSpecies)
	};
}
