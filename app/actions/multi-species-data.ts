import { supabase, catchSupabaseErrors } from '@/lib/supabase';
import type { SpeciesStatsRow } from '@/app/models/db';

export async function fetchSpeciesData(
	fromDate?: string,
	toDate?: string
): Promise<SpeciesStatsRow[]> {
	return supabase
		.rpc('species_stats', {
			from_date: fromDate,
			to_date: toDate
		})
		.then(catchSupabaseErrors) as Promise<SpeciesStatsRow[]>;
}
