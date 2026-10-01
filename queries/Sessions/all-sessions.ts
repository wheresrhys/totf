import type { TableQueryDefinition } from '../types';

/**
 * Sessions with their encounter count, most recent first — powers
 * `fetchSessionsPageContent` (`app/(routes)/sessions/page.tsx`). No longer
 * selects location — the `/sessions` page stopped displaying/querying
 * per-session location, and #1024 then dropped `Sessions.location_id` outright.
 * Captured for both Alpha and Beta by `supabase/scripts/generate-snapshots.ts`.
 */
export const allSessionsQuery: TableQueryDefinition = {
	table: 'Sessions',
	name: 'all-sessions',
	select: 'id, visit_date, encounters:Encounters(count)',
	fixturePaths: [
		'tables/Sessions/alpha.all-sessions.json',
		'tables/Sessions/beta.all-sessions.json'
	]
};
