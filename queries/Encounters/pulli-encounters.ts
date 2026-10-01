import type { TableQueryDefinition } from '../types';

/**
 * Encounters matching the PULLI (nestling-ringing) definition, with their
 * bird/species and visit date/location — powers `fetchPulliPageContent`
 * (`app/(routes)/pulli/page.tsx`). Reads `visit_date`/`location_id` directly
 * off `Encounters` (#1015) rather than through the `Sessions` embed — same
 * pattern `queries/Encounters/resightings.ts` established (#1017) — and the
 * caller reproduces `session_type = 'PULLI'` as a predicate over
 * `record_type`/`age_code`/`is_juv` instead of joining to
 * `Sessions.session_type` (see
 * https://github.com/wheresrhys/totf/issues/1024#issuecomment-5930001521).
 * Alpha only.
 */
export const pulliEncountersQuery: TableQueryDefinition = {
	table: 'Encounters',
	name: 'pulli-encounters',
	select: `
				id,
				extra_text,
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
	fixturePaths: ['tables/Encounters/alpha.pulli-encounters.json']
};
