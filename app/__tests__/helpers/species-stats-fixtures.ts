/**
 * Merged species-stats views of the raw snapshot fixtures.
 *
 * Every file in `test-fixtures/snapshots/` is the verbatim return of exactly one
 * RPC call or table query — a fixture that bakes in a merge stops describing any
 * source the freshness check (`supabase/__tests__/snapshot-fixture-freshness.test.ts`)
 * can verify it against. But #821/#823 split the 8 wing/weight columns out of
 * `core_stats` into `biometrics_stats`, so the shape the species pages actually
 * render is the join of two fixtures, not either one alone.
 *
 * This module performs that join with the same helpers the production actions
 * use — `mergeSpeciesBiometrics` for the by-species list read path
 * (`fetchSpeciesData`, app/actions/spp-data.ts) and `mergeBiometricsFields` for
 * the species detail row (app/(routes)/species/[speciesName]/page.tsx) — so the
 * merge lives in one place instead of being re-hand-rolled in every consuming
 * test, and a change to either action's join surfaces here rather than silently
 * diverging from it.
 */

import { mergeSpeciesBiometrics } from '@/app/lib/species-stats';
import {
	mergeBiometricsFields,
	type BiometricsStatsResult,
	type CoreStatsResult
} from '@/app/models/db';
import alphaCoreStats from '@/test-fixtures/snapshots/core_stats/alpha.by-species.json';
import alphaBiometricsStats from '@/test-fixtures/snapshots/biometrics_stats/alpha.by-species.json';
import betaCoreStats from '@/test-fixtures/snapshots/core_stats/beta.by-species.json';
import betaBiometricsStats from '@/test-fixtures/snapshots/biometrics_stats/beta.by-species.json';
import gammaCoreStats from '@/test-fixtures/snapshots/core_stats/gamma.by-species.json';
import gammaBiometricsStats from '@/test-fixtures/snapshots/biometrics_stats/gamma.by-species.json';
import robinCoreStats from '@/test-fixtures/snapshots/core_stats/robin-alpha.species-stats.json';
import robinBiometricsStats from '@/test-fixtures/snapshots/biometrics_stats/robin-alpha.species-stats.json';

function mergeByGroup(
	coreStats: unknown,
	biometricsStats: unknown
): ReturnType<typeof mergeSpeciesBiometrics> {
	return mergeSpeciesBiometrics(
		coreStats as unknown as CoreStatsResult[],
		biometricsStats as unknown as BiometricsStatsResult[]
	);
}

/** What `fetchSpeciesData` returns for each group — one row per species. */
export const alphaSpeciesStats = mergeByGroup(
	alphaCoreStats,
	alphaBiometricsStats
);
export const betaSpeciesStats = mergeByGroup(
	betaCoreStats,
	betaBiometricsStats
);
export const gammaSpeciesStats = mergeByGroup(
	gammaCoreStats,
	gammaBiometricsStats
);

/**
 * The species detail page's headline `speciesStats` row for Alpha's Robin —
 * `core_stats` filtered to one species, with the biometrics row merged on.
 */
export const robinSpeciesStats = mergeBiometricsFields(
	(robinCoreStats as unknown as CoreStatsResult[])[0],
	(robinBiometricsStats as unknown as BiometricsStatsResult[])[0]
);

/**
 * Robin's `Species.id` in the e2e seed data. Not an RPC result, so it has no
 * fixture of its own — the species pages take it as a route-resolved prop.
 */
export const ROBIN_SPECIES_ID = 1;
