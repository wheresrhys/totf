import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../../../lib/supabase';

export async function getGroupIdByName(name: string): Promise<number> {
	const { data, error } = await supabase
		.from('RingingGroups')
		.select('id')
		.eq('group_name', name)
		.single();
	if (error || !data)
		throw new Error(
			`Group "${name}" not found — run npm run db:seed:e2e first`
		);
	return data.id;
}

// Locations are RLS-scoped to their owning group, so this must be queried with a
// group-authenticated client rather than the anon `supabase` client used above.
export async function getLocationIdByName(
	client: SupabaseClient,
	name: string,
	ringingGroupId: number
): Promise<number> {
	const { data, error } = await client
		.from('Locations')
		.select('id')
		.eq('location_name', name)
		.eq('ringing_group_id', ringingGroupId)
		.single();
	if (error || !data)
		throw new Error(
			`Location "${name}" not found — run npm run db:seed:e2e first`
		);
	return data.id;
}
