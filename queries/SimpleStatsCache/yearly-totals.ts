import type { TableQueryDefinition } from '../types';

/**
 * Every year-grain cell, all-species-combined — powers `fetchPayOffStats`'s
 * (`app/actions/pay-off-stats.ts`) yearly table/chart (#1244 — this used to
 * come from a live `core_stats` RPC call).
 */
export const simpleStatsCacheYearlyTotalsQuery: TableQueryDefinition = {
	table: 'SimpleStatsCache',
	name: 'yearly-totals',
	select: '*',
	fixturePaths: ['tables/SimpleStatsCache/alpha.yearly-totals.json']
};
