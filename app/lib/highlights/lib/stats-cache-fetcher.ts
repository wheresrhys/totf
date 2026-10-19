'use client';
import {
	getServerCachedStats,
	ServerCachedStatsParams
} from '@/app/actions/stats-cache';

function getCacheKey({
	rpcName,
	fetchDataBySpecies,
	temporalUnit,
	viewedGroup
}: ServerCachedStatsParams): string {
	return `group(${viewedGroup.id})-${temporalUnit}-${rpcName}${fetchDataBySpecies ? '-by-species' : ''}`;
}

const requestCache: Map<
	string,
	ReturnType<typeof getServerCachedStats>
> = new Map();

export function pooledRequestForStats(
	params: ServerCachedStatsParams
): ReturnType<typeof getServerCachedStats> {
	const cacheKey = getCacheKey(params);
	if (requestCache.has(cacheKey)) {
		console.log('hit', cacheKey);
		return requestCache.get(cacheKey) as ReturnType<
			typeof getServerCachedStats
		>;
	} else {
		console.log('miss', cacheKey);
		const request = getServerCachedStats(params);
		requestCache.set(cacheKey, request);
		return request;
	}
}
