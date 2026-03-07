'use server';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { SpeciesStatsRow } from '@/app/models/db';

export async function fetchSpeciesData(
	fromDate?: string,
	toDate?: string
): Promise<SpeciesStatsRow[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('species_stats', {
			from_date: fromDate,
			to_date: toDate
		})
		.then(catchSupabaseErrors) as Promise<SpeciesStatsRow[]>;
}
