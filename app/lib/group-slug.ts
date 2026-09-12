import { cache } from 'react';
import { supabase, catchSupabaseErrors } from '../../lib/supabase';

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

// These resolvers deliberately use the plain, unauthenticated `supabase`
// client (anon role) rather than `getAuthenticatedSupabaseClient()` — the
// `RingingGroups` row is publicly SELECT-able (`ringing_groups_access`
// policy, `USING (TRUE)`) regardless of caller role, and resolution must
// succeed for an anonymous (no-cookie) visitor too. Previously, going via
// `getAuthenticatedSupabaseClient()` threw `'No group selected'` for any
// no-cookie caller — a latent 500 that was unreachable before #770 (the
// group layout redirected every no-cookie request before any page/fetcher
// ran), but became reachable once a public group's summary subtree started
// letting no-cookie requests through.
export async function resolveGroupIdBySlug(
	slug: string
): Promise<number | null> {
	const cached = groupIdBySlug.get(slug);
	if (cached !== undefined) {
		return cached;
	}

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

// Unlike id/slug (immutable once a group exists, hence cached above),
// `public_areas` is a mutable setting a group can toggle at any time (the
// public-summary toggle, #769) — so this is deliberately never cached, and
// always reads the live value.
export async function resolveGroupPublicAreas(id: number): Promise<string[]> {
	const group = await supabase
		.from('RingingGroups')
		.select('public_areas')
		.eq('id', id)
		.maybeSingle()
		.then(catchSupabaseErrors);

	return group?.public_areas ?? [];
}

// A group's public_areas gets resolved from more than one place in the same
// request when an anonymous visitor is being served a public summary — the
// root layout's public-page access gate (lib/public-group-access.ts)
// and, for a request that gate lets through, the summary read-path's own
// public fallback (lib/group-summary-access.ts). Both route through this
// React `cache()`-memoised wrapper instead of calling resolveGroupPublicAreas
// directly, so the same group's public_areas isn't queried twice in one
// request. `cache()`'s memoisation is scoped to a single request/render pass
// (Next.js App Router semantics) — unlike the permanent, cross-request id/slug
// Maps above, a group toggling its public-summary setting still takes effect
// on its very next request, so resolveGroupPublicAreas's own "always live"
// guarantee (see above, and its dedicated test) is unaffected.
export const resolveGroupPublicAreasForRequest = cache(resolveGroupPublicAreas);
