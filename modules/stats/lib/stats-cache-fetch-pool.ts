// while this doesn't use any client side react features, it is meant to be used client side
// importing on the server side will result is cache dilution
'use client';
import {
  readStatsCacheRows,
  type StatsCacheReadParams
} from './stats-cache';

type SerializableStatsCacheParams = Omit<StatsCacheReadParams, 'client'>;

function getCacheKey({
  bySpecies,
  temporalUnit,
  viewedGroup
}: SerializableStatsCacheParams): string {
  return `group(${viewedGroup.id})-${temporalUnit}${bySpecies ? '-by-species' : ''}`;
}

export class StatsCacheFetchPool {
  requestCache: Map<
    string,
    ReturnType<typeof readStatsCacheRows>
  > = new Map();

  fetch(
    params: SerializableStatsCacheParams
  ): ReturnType<typeof readStatsCacheRows> {
    const cacheKey = getCacheKey(params);
    if (this.requestCache.has(cacheKey)) {
      return this.requestCache.get(cacheKey) as ReturnType<typeof readStatsCacheRows>;
    } else {
      const request = readStatsCacheRows(params);
      this.requestCache.set(cacheKey, request);
      return request;
    }
  }
}

export const globalStatsCacheFetchPool = new StatsCacheFetchPool();
