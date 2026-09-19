import type { TableQueryDefinition } from '../types';

/**
 * A single bird's own Encounters, keyed by `bird_id` — the second of the two
 * queries `fetchBirdPageContent` (`app/(routes)/bird/[ring]/page.tsx`) merges
 * onto the `birdDetailQuery` row (`queries/Birds/bird-detail.ts`) to build a
 * `StandaloneBird`. Filed under `Encounters/` (its own source table) even
 * though it's keyed off the Birds row fetched by that other query. Split by
 * #901 out of the original compound `tables/Birds/arretrap.bird-detail.json`
 * fixture into this query's own `tables/Encounters/arretrap.encounters.json`.
 * Deliberately narrower than the real page's own Encounters `.select()`,
 * which additionally carries `breeding_condition`, `moult_code` and
 * `sexing_method` (rendered by `SingleBirdTable`) — see `bird-detail.ts`'s own
 * comment for why that means the two aren't actually the same query.
 */
export const arretrapEncountersQuery: TableQueryDefinition = {
	table: 'Encounters',
	name: 'encounters',
	select: `bird_id,
				id,
				age_code,
				is_juv,
				capture_time,
				max_hatch_year,
				min_hatch_year,
				record_type,
				sex,
				ringing_group_id,
				weight,
				wing_length,
				session:Sessions (
					visit_date
				)
			`,
	fixturePaths: ['tables/Encounters/arretrap.encounters.json']
};
