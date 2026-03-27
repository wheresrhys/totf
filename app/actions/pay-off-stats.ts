import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { AggregateStatsRow } from '@/app/models/db';

export type PayOffStatsData = {
	yearly: AggregateStatsRow[];
	monthly: AggregateStatsRow[];
};

export async function fetchPayOffStats(
	groupId: number
): Promise<PayOffStatsData | null> {
	const supabase = await getAuthenticatedSupabaseClient();
	const [yearly, monthly] = await Promise.all([
		supabase
			.rpc('aggregate_stats', {
				ringing_group_filter: groupId,
				group_by_species: false,
				group_by_time_period: 'year'
			})
			.then(catchSupabaseErrors) as Promise<AggregateStatsRow[] | null>,
		supabase
			.rpc('aggregate_stats', {
				ringing_group_filter: groupId,
				group_by_species: false,
				group_by_time_period: 'month'
			})
			.then(catchSupabaseErrors) as Promise<AggregateStatsRow[] | null>
	]);
	if (yearly == null || monthly == null) {
		return null;
	}
	return { yearly, monthly };
}
