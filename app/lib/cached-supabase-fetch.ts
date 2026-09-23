import { getAuthenticatedSupabaseClient } from './auth/group-auth';
import type { SupabaseClient } from '@supabase/supabase-js';
// This library is only used for fetching large matrices of stats, which
// only change when new data is imported. Each cache entry
// carries a version token (max Encounters.id for the group) so that a new
// import invalidates the cache immediately, even across lambda instances.
// The 60-min TTL is retained as a backstop for rare in-place re-imports
// that edit existing encounters without adding rows.
export const CACHE_TTL_MS = 60 * 60 * 1000;

type CacheEntryForGroup<T> = { version: number; expiresAt: number; data: T };

type CacheByGroup<T> = Map<number, CacheEntryForGroup<T>>;

const caches: Map<string, CacheByGroup<unknown>> = new Map();

function getCache<T>(namespace: string): CacheByGroup<T> {
	if (caches.has(namespace)) {
		return caches.get(namespace) as CacheByGroup<T>;
	}
	const cache: CacheByGroup<T> = new Map();
	caches.set(namespace, cache);
	return cache;
}

export async function fetchVersion(
	supabase: SupabaseClient,
	viewedGroupId: number
): Promise<number> {
	const { data } = await supabase
		.from('Encounters')
		.select('id')
		.eq('ringing_group_id', viewedGroupId)
		.order('id', { ascending: false })
		.limit(1);
	return data?.[0]?.id ?? 0;
}

export async function cachedSupabaseFetch<T>(
	namespace: string,
	viewedGroupId: number,
	dataFetcher: (
		supabase: Awaited<ReturnType<typeof getAuthenticatedSupabaseClient>>,
		viewedGroupId: number
	) => Promise<T>
): Promise<T> {
	const cache = getCache<T>(namespace);
	const supabase = await getAuthenticatedSupabaseClient();
	const currentVersion = await fetchVersion(supabase, viewedGroupId);
	const cachedResult = cache.get(viewedGroupId);
	if (
		cachedResult &&
		cachedResult.version === currentVersion &&
		cachedResult.expiresAt > Date.now()
	) {
		return cachedResult.data;
	}
	const data = await dataFetcher(supabase, viewedGroupId);
	cache.set(viewedGroupId, {
		version: currentVersion,
		expiresAt: Date.now() + CACHE_TTL_MS,
		data
	});
	return data;
}
