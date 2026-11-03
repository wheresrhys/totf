import type { TableQueryDefinition } from '../types';

/**
 * The all-time cell plus the year grain (from which `fetchHomePageSummaryStats`
 * picks the current/previous calendar year's own cells) — powers the home
 * page's summary stats table (`app/(routes)/page.tsx`, #1221/#1244). Same
 * bare `*` select as every other `SimpleStatsCache` read; named separately
 * here because the generator composes it from two temporal units into one
 * `{allTime, thisYear, lastYear}` fixture, not because the select differs.
 */
export const simpleStatsCacheHomePageSummaryQuery: TableQueryDefinition = {
	table: 'SimpleStatsCache',
	name: 'home-page-summary',
	select: '*',
	fixturePaths: ['tables/SimpleStatsCache/alpha.home-page-summary.json']
};
