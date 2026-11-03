import type { SupabaseClient } from '@supabase/supabase-js';
import type { DemonRow } from '../types';
import { transformEmptyStringsToNull } from './row-validation';

/** The distinct, non-empty `loc_id` values across a parsed CSV. */
export function getDistinctLocationNames(rows: DemonRow[]): string[] {
	const locationNames = new Set<string>();
	for (const rawRow of rows) {
		const { loc_id: locationName } = transformEmptyStringsToNull(
			rawRow
		) as DemonRow;
		if (locationName) locationNames.add(locationName);
	}
	return [...locationNames];
}

/** Which of `distinctLocationNames` the group has no `Locations` row for (see #1048). */
export async function findUnrecognisedLocationNames(
	supabaseClient: SupabaseClient,
	distinctLocationNames: string[],
	ringingGroupId: number
): Promise<string[]> {
	if (distinctLocationNames.length === 0) return [];

	const { data, error } = await supabaseClient
		.from('Locations')
		.select('location_name')
		.eq('ringing_group_id', ringingGroupId)
		.in('location_name', distinctLocationNames);
	if (error) throw error;

	const knownLocationNames = new Set(
		(data ?? []).map(({ location_name }) => location_name as string)
	);
	return distinctLocationNames.filter(
		(locationName) => !knownLocationNames.has(locationName)
	);
}
