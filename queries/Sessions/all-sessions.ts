import type { TableQueryDefinition } from '../types';

/**
 * Sessions with their location and encounter count, most recent first —
 * powers `fetchSessionsPageContent` (`app/(routes)/sessions/page.tsx`).
 * Captured for both Alpha and Beta by `scripts/generate-snapshots.ts`.
 */
export const allSessionsQuery: TableQueryDefinition = {
	table: 'Sessions',
	name: 'all-sessions',
	select:
		'id, visit_date, location: Locations(id, location_name), encounters:Encounters(count)',
	fixturePaths: [
		'tables/Sessions/alpha.all-sessions.json',
		'tables/Sessions/beta.all-sessions.json'
	]
};
