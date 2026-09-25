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

import { vi } from 'vitest';
import {
	mergeBiometricsFields,
	type BiometricsStatsResult,
	type CoreStatsResult
} from '@/app/models/db';
import robinCoreStatsHeadline from '@/test-fixtures/snapshots/core_stats/robin-alpha.headline.json';
import robinBiometricsHeadline from '@/test-fixtures/snapshots/biometrics_stats/robin-alpha.headline.json';

/**
 * The species page's headline `speciesStats` row, merged as the page merges it.
 *
 * Both fixtures are ungrouped headline rows, so species_name/time_period are
 * genuinely null — CoreStatsResult/BiometricsStatsResult's NonNullable mapped
 * types (app/models/db.ts) assume every column is always present, so a direct
 * assertion doesn't compile (#895).
 */
export const robinSpeciesStats = mergeBiometricsFields(
	// eslint-disable-next-line no-restricted-syntax -- see comment above
	(robinCoreStatsHeadline as unknown as CoreStatsResult[])[0],
	// eslint-disable-next-line no-restricted-syntax -- see comment above
	(robinBiometricsHeadline as unknown as BiometricsStatsResult[])[0]
);

/**
 * Robin's `Species.id` in the e2e seed data. Not an RPC result, so it has no
 * fixture of its own — the species pages take it as a route-resolved prop.
 */
export const ROBIN_SPECIES_ID = 1;

/**
 * The mock Supabase client all three species-page test files (the base page
 * and its `[year]`/`[year]/[month]` siblings) build to back
 * `getAuthenticatedSupabaseClient()`: `.from(...)` resolves the species-id
 * lookup, and `.rpc(...)` resolves the `speciesStats` aggregate row. Unlike
 * `vi.mock(...)`, a plain `vi.fn()`-based factory like this has no hoisting
 * constraint, so it can be shared as an ordinary function.
 *
 * `speciesId` defaults to Robin's id; pass `null` to exercise the "species
 * lookup finds no row" edge case the `[year]`/`[year]/[month]` tests cover.
 */
export function makeSpeciesClient(speciesId: number | null = ROBIN_SPECIES_ID) {
	const fromChain = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		single: vi.fn().mockReturnThis(),
		then: (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
			Promise.resolve(
				speciesId === null
					? { data: null, error: { message: 'no rows' } }
					: { data: { id: speciesId }, error: null }
			).then(resolve)
	};
	const rpcThenable = {
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data: [robinSpeciesStats], error: null }).then(resolve)
	};
	return {
		from: vi.fn().mockReturnValue(fromChain),
		rpc: vi.fn().mockReturnValue(rpcThenable)
	};
}
