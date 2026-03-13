'use server';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { AggregateStatsRow } from '@/app/models/db';

export async function fetchSpeciesData(
	groupId: number,
	fromDate?: string,
	toDate?: string
): Promise<AggregateStatsRow[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('aggregate_stats', {
			from_date: fromDate,
			to_date: toDate,
			ringing_group_filter: groupId,
			group_by_species: true
		})
		.then(catchSupabaseErrors) as Promise<AggregateStatsRow[]>;
}
