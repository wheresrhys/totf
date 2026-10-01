import type { TableQueryDefinition } from '../types';

/**
 * Sessions with their encounter count — powers `fetchRecentSessions`
 * (`app/(routes)/page.tsx`), which fetches the most recent 30 rows and then
 * narrows client-side to the 3 most recent distinct visit dates. Alpha only.
 * No longer selects location — the home page stopped displaying/querying
 * per-session location ahead of #1024 dropping `Sessions.location_id`.
 */
export const recentSessionsQuery: TableQueryDefinition = {
	table: 'Sessions',
	name: 'recent-sessions',
	select: 'id, visit_date, ringing_group_id, encounters:Encounters(count)',
	fixturePaths: ['tables/Sessions/alpha.recent-sessions.json']
};
