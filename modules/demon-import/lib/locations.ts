import type { SupabaseClient } from '@supabase/supabase-js';
import type { DemonRow } from '../types';
import { transformEmptyStringsToNull } from './row-validation';

// The distinct, non-empty `loc_id` values across a parsed CSV, normalised the
// same way `EncounterRowBatchWriter` normalises the row it upserts a Location from
// (`transformEmptyStringsToNull` — trimmed, with '' becoming null), so a name
// checked here is byte-identical to the name that would be written.
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

// Which of `distinctLocationNames` the group has no `Locations` row for.
//
// An import's `loc_id` column is the group's own DemOn site code, and the
// Locations upsert in `EncounterRowBatchWriter` keys Locations on
// `(location_name, ringing_group_id)` — so a group re-coding an existing site
// (#1048: `972` → `CES972`) silently forks a second Locations row and
// re-imports every encounter under it. Both import entry points therefore run
// this over a whole CSV *before* writing anything, and abort if it returns
// anything: an unrecognised name is far more often a rename than a genuine new
// site, and the caller can't tell which.
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
