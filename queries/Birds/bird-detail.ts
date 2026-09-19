import type { TableQueryDefinition } from '../types';

/**
 * A single Bird's headline fields plus its species name — powers
 * `fetchBirdPageContent` (`app/(routes)/bird/[ring]/page.tsx`). That page also
 * fetches the bird's own Encounters as a second query merged into the same
 * object — originally a single compound `tables/Birds/arretrap.bird-detail.json`
 * fixture, #901 split it into this query's own `tables/Birds/arretrap.bird.json`
 * plus the Encounters portion's `tables/Encounters/arretrap.encounters.json`
 * (`arretrapEncountersQuery`, `queries/Encounters/arretrap-encounters.ts`). The
 * Encounters portion is a separate query definition rather than the same one
 * this Birds-row query reuses: the real page's Encounters `.select()` carries
 * three columns (`breeding_condition`, `moult_code`, `sexing_method`, rendered
 * by `SingleBirdTable`) that `scripts/generate-snapshots.ts`'s narrower
 * fixture query deliberately omits, so the two aren't actually the same query.
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
