'use server';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { AggregateStatsResult } from '@/app/models/db';

export async function fetchSpeciesData(
	viewedGroupId: number,
	fromDate?: string,
	toDate?: string
): Promise<AggregateStatsResult[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('aggregate_stats', {
			from_date: fromDate,
			to_date: toDate,
			ringing_group_filter: viewedGroupId,
			group_by_species: true
		})
		.then(catchSupabaseErrors) as Promise<AggregateStatsResult[]>;
}
