import { fetchAllPaginatedRows } from '@/lib/supabase';
import type { CoreStatsResult } from '@/app/models/db';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cachedSupabaseFetch } from '../lib/cached-supabase-fetch';

export async function uncachedDailyCoreStats(
	supabase: SupabaseClient,
	viewedGroupId: number
) {
	return fetchAllPaginatedRows<CoreStatsResult>((fromRow, toRow) =>
		supabase
			.rpc('core_stats', {
				ringing_group_filter: viewedGroupId,
				group_by_species: true,
				group_by_time_period: 'year'
			})
			.order('time_period')
			.order('species_name')
			.range(fromRow, toRow)
	);
}

export async function fetchDailyStats(
	viewedGroupId: number
): Promise<CoreStatsResult[]> {
	return cachedSupabaseFetch(
		'daily-core-stats',
		viewedGroupId,
		uncachedDailyCoreStats
	);
}
