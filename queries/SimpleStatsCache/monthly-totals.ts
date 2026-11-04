import type { TableQueryDefinition } from '../types';

/**
 * Every month-grain cell, all-species-combined — powers `fetchPayOffStats`'s
 * (`app/actions/pay-off-stats.ts`) monthly table/chart (#1244 — this used to
 * come from a live `core_stats` RPC call).
 */
export const simpleStatsCacheMonthlyTotalsQuery: TableQueryDefinition = {
	table: 'SimpleStatsCache',
	name: 'monthly-totals',
	select: '*',
	fixturePaths: ['tables/SimpleStatsCache/alpha.monthly-totals.json']
};
