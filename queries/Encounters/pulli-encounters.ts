import type { TableQueryDefinition } from '../types';

/**
 * Encounters from PULLI (nestling-ringing) sessions, with their bird/species
 * and session/location — powers `fetchPulliPageContent`
 * (`app/(routes)/pulli/page.tsx`). Alpha only.
 */
export const pulliEncountersQuery: TableQueryDefinition = {
	table: 'Encounters',
	name: 'pulli-encounters',
	select: `
				id,
				extra_text,
				bird:Birds (
					ring_no,
					species:Species (
						species_name
					)
				),
				session:Sessions!inner (
					visit_date,
					session_type,
					location:Locations (
						location_name
					)
				)
			`,
	fixturePaths: ['tables/Encounters/alpha.pulli-encounters.json']
};
