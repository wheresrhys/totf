import type { TableQueryDefinition } from '../types';

/**
 * The all-time, all-species-combined cell — powers `fetchSummaryStats`
 * (`app/actions/summary-stats.ts`) called with no date window, i.e. the base
 * `/summary` route's all-time totals (#1244 — this used to come from a live
 * `core_stats` RPC call). `SimpleStatsCache` carries no species relationship
 * at all, so the select is a bare `*`.
 */
export const simpleStatsCacheSummaryTotalsQuery: TableQueryDefinition = {
	table: 'SimpleStatsCache',
	name: 'summary-totals',
	select: '*',
	fixturePaths: ['tables/SimpleStatsCache/alpha.summary-totals.json']
};
