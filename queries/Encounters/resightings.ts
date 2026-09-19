import type { TableQueryDefinition } from '../types';

/**
 * Encounters whose record type is a resighting/recovery/finding
 * (`RESIGHTING_RECORD_TYPES`, `lib/demon-import.ts`), with their bird/species
 * and session/location — powers `fetchResightingsPageContent`
 * (`app/(routes)/resightings/page.tsx`). Alpha only.
 */
export const resightingsQuery: TableQueryDefinition = {
	table: 'Encounters',
	name: 'resightings',
	select: `
				id,
				record_type,
				extra_text,
				finding_condition,
				finding_circumstances,
				bird:Birds (
					ring_no,
					species:Species (
						species_name
					)
				),
				session:Sessions (
					visit_date,
					location:Locations (
						location_name
					)
				)
			`,
	fixturePaths: ['tables/Encounters/alpha.resightings.json']
};
