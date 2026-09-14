/**
 * The Robin/Alpha species-page inputs, assembled from raw snapshot fixtures.
 *
 * Every file in `test-fixtures/snapshots/` is the verbatim return of exactly one
 * RPC call or one table query (see CLAUDE.md's "No compound fixtures"), so the
 * species page's headline row — which `getSpeciesStats`
 * (app/(routes)/species/[speciesName]/page.tsx) builds by joining a `core_stats`
 * row with its `biometrics_stats` sibling — has no fixture of its own. The four
 * test files that render this page all need that same merged row, so the join
 * lives here once, done with `mergeBiometricsFields`, the same helper the page
 * itself uses. `core_stats` stopped carrying its own wing/weight columns at
 * #827, so reading them off the `core_stats` fixture would be wrong (#883).
 */

import {
	mergeBiometricsFields,
	type BiometricsStatsResult,
	type CoreStatsResult
} from '@/app/models/db';
import robinCoreStatsHeadline from '@/test-fixtures/snapshots/core_stats/robin-alpha.headline.json';
import robinBiometricsHeadline from '@/test-fixtures/snapshots/biometrics_stats/robin-alpha.headline.json';

/** The species page's headline `speciesStats` row, merged as the page merges it. */
export const robinSpeciesStats = mergeBiometricsFields(
	(robinCoreStatsHeadline as unknown as CoreStatsResult[])[0],
	(robinBiometricsHeadline as unknown as BiometricsStatsResult[])[0]
);

/**
 * Robin's `Species.id` in the e2e seed data. Not an RPC result, so it has no
 * fixture of its own — the species pages take it as a route-resolved prop.
 */
export const ROBIN_SPECIES_ID = 1;
