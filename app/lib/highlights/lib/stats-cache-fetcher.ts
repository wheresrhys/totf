'use client';
import {
	readStatsCacheRows,
	type StatsCacheReadParams
} from '@/app/actions/stats-cache';

type SerializableStatsCacheParams = Omit<StatsCacheReadParams, 'client'>;

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
}: SerializableStatsCacheParams): string {
	return `group(${viewedGroup.id})-${temporalUnit}${bySpecies ? '-by-species' : ''}`;
}

const requestCache: Map<
	string,
	ReturnType<typeof readStatsCacheRows>
> = new Map();

export function pooledRequestForStats(
	params: SerializableStatsCacheParams
): ReturnType<typeof readStatsCacheRows> {
	const cacheKey = getCacheKey(params);
	if (requestCache.has(cacheKey)) {
		console.log('hit', cacheKey);
		return requestCache.get(cacheKey) as ReturnType<typeof readStatsCacheRows>;
	} else {
		console.log('miss', cacheKey);
		const request = readStatsCacheRows(params);
		requestCache.set(cacheKey, request);
		return request;
	}
}
