import { supabase, catchSupabaseErrors } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RingingGroupRow } from '@/app/models/db';
import type { ViewedGroup } from '@/app/lib/group-slug';

export type SimpleSpeciesRow = {
	id: number;
	species_name: string;
};

export async function fetchRingingGroups(): Promise<RingingGroupRow[]> {
	return supabase
		.from('RingingGroups')
		.select('id, group_name')
		.order('group_name')
		.then(catchSupabaseErrors) as Promise<RingingGroupRow[]>;
}

// Every species the viewed group has at least one bird recorded for, for
// GlobalNav's species-by-letter nav — unauthenticated/public views pass the
// plain `supabase` client, logged-in views an authenticated one.
export async function fetchSpeciesNames(
	viewedGroup: ViewedGroup,
	supabaseClient: SupabaseClient
): Promise<SimpleSpeciesRow[]> {
	return supabaseClient
		.from('Species')
		.select('id, species_name, Birds!inner(species_id,ringing_group_ids)')
		.contains('Birds.ringing_group_ids', [viewedGroup.id])
		.then(catchSupabaseErrors) as Promise<SimpleSpeciesRow[]>;
}
