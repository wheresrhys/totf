import type { TableQueryDefinition } from '../types';

/**
 * A single Bird's headline fields plus its species name — powers
 * `fetchBirdPageContent` (`app/(routes)/bird/[ring]/page.tsx`). That page
 * also fetches the bird's own Encounters as a second query merged into the
 * same object; `tables/Birds/arretrap.bird.json` was the Birds half of a
 * compound `arretrap.bird-detail.json` fixture until #901 split it out into
 * its own raw source, alongside `tables/Encounters/arretrap.encounters.json`
 * for the Encounters half (`../Encounters/bird-detail-encounters.ts` — see
 * that query file's comment for why it's deliberately narrower than the real
 * page's own Encounters select, unlike this Birds-row portion, which is
 * identical between the two call sites).
 */
export const birdDetailQuery: TableQueryDefinition = {
	table: 'Birds',
	name: 'bird',
	select: `id,
				ring_no,
				proven_age,
				species:Species (
					species_name
				)
			`,
	fixturePaths: ['tables/Birds/arretrap.bird.json']
};
