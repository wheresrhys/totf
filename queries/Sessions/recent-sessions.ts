import type { TableQueryDefinition } from '../types';

/**
 * Sessions with their location id/name and encounter count — powers
 * `fetchRecentSessions` (`app/(routes)/page.tsx`), which fetches the most
 * recent 30 rows and then narrows client-side to the 3 most recent distinct
 * visit dates. Alpha only.
 */
export const recentSessionsQuery: TableQueryDefinition = {
	table: 'Sessions',
	name: 'recent-sessions',
	select:
		'id, visit_date, location_id, ringing_group_id, location:Locations(location_name), encounters:Encounters(count)',
	fixturePaths: ['tables/Sessions/alpha.recent-sessions.json']
};
