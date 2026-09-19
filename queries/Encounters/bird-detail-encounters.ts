import type { TableQueryDefinition } from '../types';

/**
 * The Encounters-of-one-bird half of the `fetchBirdPageContent`
 * (`app/(routes)/bird/[ring]/page.tsx`) bird-detail read, merged by that page
 * onto the Birds row `birdDetailQuery` (`../Birds/bird-detail.ts`) covers.
 * `tables/Encounters/arretrap.encounters.json` was the Encounters half of a
 * compound `arretrap.bird-detail.json` fixture until #901 split it out into
 * its own raw source.
 *
 * Deliberately narrower than the real page's own Encounters `.select()`,
 * which carries three extra columns (`breeding_condition`, `moult_code`,
 * `sexing_method`, rendered by `SingleBirdTable`) this fixture query omits —
 * so this definition exists only to give `scripts/generate-snapshots.ts` a
 * canonical, non-duplicated source for the fixture, and isn't imported by
 * the real page itself.
 */
export const birdDetailEncountersQuery: TableQueryDefinition = {
	table: 'Encounters',
	name: 'encounters',
	select: `bird_id, id, age_code, is_juv, capture_time, max_hatch_year, min_hatch_year, record_type, sex, ringing_group_id, weight, wing_length, session:Sessions(visit_date)`,
	fixturePaths: ['tables/Encounters/arretrap.encounters.json']
};
