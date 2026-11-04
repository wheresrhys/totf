/**
 * The Robin/Alpha species-page inputs, assembled from raw snapshot fixtures.
 *
 * The species page's headline row comes from `getSpeciesStats`
 * (app/(routes)/species/[speciesName]/page.tsx), which — for the all-time
 * period — reads Robin's own `SimpleStatsCacheBySpecies` row directly
 * (#1222, `fetchSpeciesStatsCacheRows` in `app/actions/sp-data.ts`). That
 * table already carries the 8 wing/weight columns on every row, so unlike
 * the pre-#1222 `core_stats` + `biometrics_stats` RPC pair this is no longer
 * a two-source join — `ROBIN_ALPHA_HEADLINE`
 * (`app/__tests__/helpers/core-stats-fixtures.ts`) is already the complete
 * `CoreStatsWithBiometrics` row.
 */

import { vi } from 'vitest';
import { ROBIN_ALPHA_HEADLINE } from '@/app/__tests__/helpers/core-stats-fixtures';

export const robinSpeciesStats = ROBIN_ALPHA_HEADLINE;

/**
 * Robin's `Species.id` in the e2e seed data. Not an RPC result, so it has no
 * fixture of its own — the species pages take it as a route-resolved prop.
 */
export const ROBIN_SPECIES_ID = 1;

/**
 * The mock Supabase client all three species-page test files (the base page
 * and its `[year]`/`[year]/[month]` siblings) build to back
 * `getAuthenticatedSupabaseClient()`: `.from(...)` resolves the species-id
 * lookup — the only Supabase call `fetchSpeciesPageContentForPeriod` makes
 * directly, since the aggregate stats read goes through the separately
 * action-mocked `fetchSpeciesStatsCacheRows` (never a raw `.rpc()` call; a
 * dead `.rpc()` mock used to live here too, predating #1222's move onto a
 * direct table read). Unlike `vi.mock(...)`, a plain `vi.fn()`-based factory
 * like this has no hoisting constraint, so it can be shared as an ordinary
 * function.
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
	return {
		from: vi.fn().mockReturnValue(fromChain)
	};
}
