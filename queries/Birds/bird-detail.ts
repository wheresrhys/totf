import type { TableQueryDefinition } from '../types';

/**
 * A single Bird's headline fields plus its species name — powers
 * `fetchBirdPageContent` (`app/(routes)/bird/[ring]/page.tsx`). That page
 * also fetches the bird's own Encounters as a second query merged into the
 * same object (`tables/Birds/arretrap.bird-detail.json` is the resulting
 * compound fixture — one of the two grandfathered exceptions to the "one
 * fixture, one source" rule tracked by #901). That second query isn't
 * extracted here: the real page's Encounters `.select()` carries three
 * columns (`breeding_condition`, `moult_code`, `sexing_method`, rendered by
 * `SingleBirdTable`) that `scripts/generate-snapshots.ts`'s narrower fixture
 * query deliberately omits, so the two aren't actually the same query — only
 * this Birds-row portion is identical between the two call sites.
 */
export const birdDetailQuery: TableQueryDefinition = {
	table: 'Birds',
	name: 'bird-detail',
	select: `id,
				ring_no,
				proven_age,
				species:Species (
					species_name
				)
			`,
	fixturePaths: ['tables/Birds/arretrap.bird-detail.json']
};
