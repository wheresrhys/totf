import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { CoreStatsResult } from '@/app/models/db';
import type { ViewedGroup } from '@/app/lib/group-slug';

export type PayOffStatsData = {
	yearly: CoreStatsResult[];
	monthly: CoreStatsResult[];
};

export async function fetchPayOffStats(
	viewedGroup: ViewedGroup
): Promise<PayOffStatsData | null> {
	const supabase = await getAuthenticatedSupabaseClient();
	const [yearly, monthly] = await Promise.all([
		supabase
			.rpc('core_stats', {
				ringing_group_filter: viewedGroup.id,
				group_by_species: false,
				group_by_time_period: 'year'
			})
			.then(catchSupabaseErrors) as Promise<CoreStatsResult[] | null>,
		supabase
			.rpc('core_stats', {
				ringing_group_filter: viewedGroup.id,
				group_by_species: false,
				group_by_time_period: 'month'
			})
			.then(catchSupabaseErrors) as Promise<CoreStatsResult[] | null>
	]);
	if (yearly == null || monthly == null) {
		return null;
	}
	return { yearly, monthly };
}
