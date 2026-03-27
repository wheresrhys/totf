'use server';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { NotableRetrapsResult } from '@/app/models/db';

export async function fetchNotableRetraps(
	speciesName: string,
	groupId: number
): Promise<NotableRetrapsResult[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('notable_retraps', {
			ringing_group_filter: groupId,
			species_filter: speciesName,
			result_limit: 10,
			min_proven_age: 3,
			min_encounter_count: 6
		})
		.then(catchSupabaseErrors) as Promise<NotableRetrapsResult[]>;
}
