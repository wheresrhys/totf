export type { TableQueryDefinition } from './types';

export { allSessionsQuery } from './Sessions/all-sessions';
export { recentSessionsQuery } from './Sessions/recent-sessions';
export { pulliEncountersQuery } from './Encounters/pulli-encounters';
export { resightingsQuery } from './Encounters/resightings';
export { arretrapEncountersQuery } from './Encounters/arretrap-encounters';
export { topSpeciesQuery } from './Species/top-species';
export { pageOfBirdsQuery, buildPageOfBirdsSelect } from './Birds/page-of-birds';
export { birdDetailQuery } from './Birds/bird-detail';

import { allSessionsQuery } from './Sessions/all-sessions';
import { recentSessionsQuery } from './Sessions/recent-sessions';
import { pulliEncountersQuery } from './Encounters/pulli-encounters';
import { resightingsQuery } from './Encounters/resightings';
import { arretrapEncountersQuery } from './Encounters/arretrap-encounters';
import { topSpeciesQuery } from './Species/top-species';
import { pageOfBirdsQuery } from './Birds/page-of-birds';
import { birdDetailQuery } from './Birds/bird-detail';
import type { TableQueryDefinition } from './types';

/**
 * Every query definition in this directory, in no particular order — the
 * single source `scripts/generate-snapshots.ts`'s consistency test
 * (`queries/__tests__/consistency.test.ts`) iterates to check against
 * `GENERATED_SNAPSHOT_FIXTURES`.
 */
export const TABLE_QUERIES: readonly TableQueryDefinition[] = [
	allSessionsQuery,
	recentSessionsQuery,
	pulliEncountersQuery,
	resightingsQuery,
	arretrapEncountersQuery,
	topSpeciesQuery,
	pageOfBirdsQuery,
	birdDetailQuery
];
