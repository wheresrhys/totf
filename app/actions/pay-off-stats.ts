import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { AggregateStatsResult } from '@/app/models/db';

export type PayOffStatsData = {
	yearly: AggregateStatsResult[];
	monthly: AggregateStatsResult[];
};

export async function fetchPayOffStats(
	viewedGroupId: number
): Promise<PayOffStatsData | null> {
	const supabase = await getAuthenticatedSupabaseClient();
	const [yearly, monthly] = await Promise.all([
		supabase
			.rpc('aggregate_stats', {
				ringing_group_filter: viewedGroupId,
				group_by_species: false,
				group_by_time_period: 'year'
			})
			.then(catchSupabaseErrors) as Promise<AggregateStatsResult[] | null>,
		supabase
			.rpc('aggregate_stats', {
				ringing_group_filter: viewedGroupId,
				group_by_species: false,
				group_by_time_period: 'month'
			})
			.then(catchSupabaseErrors) as Promise<AggregateStatsResult[] | null>
	]);
	if (yearly == null || monthly == null) {
		return null;
	}
	return { yearly, monthly };
}
