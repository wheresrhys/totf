import type { TableQueryDefinition } from '../types';

/**
 * Encounters whose record type is a resighting/recovery/finding
 * (`RESIGHTING_RECORD_TYPES`, `lib/demon-import.ts`), with their bird/species
 * and visit date/location — powers `fetchResightingsPageContent`
 * (`app/(routes)/resightings/page.tsx`). Reads `visit_date`/`location_id`
 * directly off `Encounters` (#1015) rather than through the `Sessions` embed,
 * so the page stays correct once resighting encounters stop linking to a
 * `Session` row at all (#1024). Alpha only.
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
				visit_date,
				bird:Birds (
					ring_no,
					species:Species (
						species_name
					)
				),
				location:Locations (
					location_name
				)
			`,
	fixturePaths: ['tables/Encounters/alpha.resightings.json']
};
