import { getAuthenticatedSupabaseClient } from './group-auth';
import { catchSupabaseErrors } from './supabase';

// A resolved { id, slug } pair for the group whose data is currently being
// viewed. Carried alongside the existing numeric viewedGroupId through the
// /group/[groupId]/** wrapper layer and the route pages it calls.
export type ViewedGroup = { id: number; slug: string | null };

// Module-scope caches, one per resolution direction. Only successful
// (non-null) resolutions are cached — there's no eviction/TTL here (unlike
// the JWT client cache), so caching a miss would permanently 404 a group
// created or backfilled later in the same server process lifetime.
const groupIdBySlug = new Map<string, number>();
const groupSlugById = new Map<number, string>();

export async function resolveGroupIdBySlug(
	slug: string
): Promise<number | null> {
	const cached = groupIdBySlug.get(slug);
	if (cached !== undefined) {
		return cached;
	}

	const supabase = await getAuthenticatedSupabaseClient();
	const group = await supabase
		.from('RingingGroups')
		.select('id')
		.eq('slug', slug)
		.maybeSingle()
		.then(catchSupabaseErrors);

	if (!group) {
		return null;
	}

	groupIdBySlug.set(slug, group.id);
	return group.id;
}

export async function resolveGroupSlugById(id: number): Promise<string | null> {
	const cached = groupSlugById.get(id);
	if (cached !== undefined) {
		return cached;
	}

	const supabase = await getAuthenticatedSupabaseClient();
	const group = await supabase
		.from('RingingGroups')
		.select('slug')
		.eq('id', id)
		.maybeSingle()
		.then(catchSupabaseErrors);

	if (!group?.slug) {
		return null;
	}

	groupSlugById.set(id, group.slug);
	return group.slug;
}
