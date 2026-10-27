'use client';
import {
	readStatsCacheRowsForViewedGroup,
	type ReadStatsCacheRowsForViewedGroupParams
} from '@/app/actions/stats-cache';

// `rpcName` used to be part of this key (and this file's params type) purely
// to keep a core_stats-shaped read and a biometrics_stats-shaped read from
// colliding — now that every read goes through `readStatsCacheRows`'s generic
// `select('*')` (#1236), two rule types that used to read different column
// subsets for the same (group, bySpecies, temporalUnit) now read identical
// full rows, so dropping `rpcName` from the key lets them share one pooled
// request instead of issuing two.
function getCacheKey({
	bySpecies,
	temporalUnit,
	viewedGroup
}: ReadStatsCacheRowsForViewedGroupParams): string {
	return `group(${viewedGroup.id})-${temporalUnit}${bySpecies ? '-by-species' : ''}`;
}

const requestCache: Map<
	string,
	ReturnType<typeof readStatsCacheRowsForViewedGroup>
> = new Map();

export function pooledRequestForStats(
	params: ReadStatsCacheRowsForViewedGroupParams
): ReturnType<typeof readStatsCacheRowsForViewedGroup> {
	const cacheKey = getCacheKey(params);
	if (requestCache.has(cacheKey)) {
		console.log('hit', cacheKey);
		return requestCache.get(cacheKey) as ReturnType<
			typeof readStatsCacheRowsForViewedGroup
		>;
	} else {
		console.log('miss', cacheKey);
		const request = readStatsCacheRowsForViewedGroup(params);
		requestCache.set(cacheKey, request);
		return request;
	}
}
