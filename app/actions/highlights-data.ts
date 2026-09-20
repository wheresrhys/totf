'use server';
import { fetchAllPaginatedRows } from '@/lib/supabase';
import type { CoreStatsResult } from '@/app/models/db';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cachedSupabaseFetch } from '../lib/cached-supabase-fetch';

export type RawStats = {
	bySpecies: CoreStatsResult[];
	overall: CoreStatsResult[];
};

export async function uncachedDailyCoreStats(
	supabase: SupabaseClient,
	viewedGroupId: number
) {
	return fetchAllPaginatedRows<CoreStatsResult>((fromRow, toRow) =>
		supabase
			.rpc('core_stats', {
				ringing_group_filter: viewedGroupId,
				group_by_time_period: 'day'
			})
			.order('time_period')
			.order('species_name')
			.range(fromRow, toRow)
	);
}

export async function uncachedDailySpeciesCoreStats(
	supabase: SupabaseClient,
	viewedGroupId: number
) {
	return fetchAllPaginatedRows<CoreStatsResult>((fromRow, toRow) =>
		supabase
			.rpc('core_stats', {
				ringing_group_filter: viewedGroupId,
				group_by_species: true,
				group_by_time_period: 'day'
			})
			.order('time_period')
			.order('species_name')
			.range(fromRow, toRow)
	);
}

export async function fetchDailyStats(
	viewedGroupId: number
): Promise<{ bySpecies: CoreStatsResult[]; overall: CoreStatsResult[] }> {
	const [daily, dailySpecies] = await Promise.all([
		cachedSupabaseFetch(
			'daily-core-stats',
			viewedGroupId,
			uncachedDailyCoreStats
		),
		cachedSupabaseFetch(
			'daily-species-core-stats',
			viewedGroupId,
			uncachedDailySpeciesCoreStats
		)
	]);

	return { bySpecies: dailySpecies, overall: daily };
}
