import type { BiometricsStatsResult } from '@/app/models/db';

/**
 * `BiometricsStatsResult` row fixtures — the 8 wing/weight summary statistics
 * plus `species_name`/`time_period`/`encounter_count`.
 *
 * These used to be a generated snapshot family,
 * `test-fixtures/snapshots/biometrics_stats/{alpha,gamma}.by-species.json` and
 * `robin-alpha.headline.json`, captured from the `biometrics_stats` RPC. #1246
 * deleted that RPC, so the captures had no source left to be regenerated from
 * or checked against; the values below are those last captures, moved here
 * verbatim so every assertion built on them still holds.
 *
 * Keeping them as a *generated* fixture under a different source was considered
 * and rejected: `BiometricsStatsResult` stopped being a view over a Postgres
 * composite at #1245 and is now an app-owned TypeScript type, so there is no
 * longer a database shape for a fixture of these columns to drift from. The
 * drift guard that remains is the type itself — hence the plain
 * `as BiometricsStatsResult` coercions here (never `as unknown as`, see
 * `app/CLAUDE.md`'s "App tests"), which still fail on a newly added required
 * column. Where these columns need checking against the database, that is
 * `stats_cache_biometrics_metrics`' own DB integration test
 * (`supabase/__tests__/rpc-functions/stats-cache-biometrics-metrics.test.ts`),
 * which owns them on the data-layer side now.
 */

/**
 * One `BiometricsStatsResult` row: flat overrides merged over the Blue
 * Tit/Alpha defaults, per this repo's fixture-builder convention. Blue Tit is
 * the default because it is the species `buildCoreStatsRow`'s callers pair
 * these rows with most often when exercising `mergeSpeciesBiometrics`.
 */
export function buildBiometricsStatsRow(
	// `species_name` is widened to allow an explicit `null`, which
	// `Partial<BiometricsStatsResult>` would reject: the type declares it
	// non-null because every producer left in app code groups by species, and
	// the one shape that doesn't is `ROBIN_ALPHA_BIOMETRICS_HEADLINE` below.
	// Widening it here keeps that one row from needing a `as unknown as` escape
	// hatch at the call site (see `app/CLAUDE.md`'s "App tests").
	overrides: Partial<Omit<BiometricsStatsResult, 'species_name'>> & {
		species_name?: string | null;
	} = {}
): BiometricsStatsResult {
	return {
		species_name: 'Blue Tit',
		time_period: null,
		max_weight: 13.1,
		avg_weight: 11.2,
		min_weight: 9.8,
		median_weight: 10.8,
		max_wing: 68,
		avg_wing: 66.6,
		min_wing: 65,
		median_wing: 67,
		encounter_count: 7,
		...overrides
	} as BiometricsStatsResult;
}

/**
 * Alpha's whole by-species biometrics result — one row per species, in the
 * same species order as `core_stats/alpha.by-species.json`, so the two line up
 * under `mergeSpeciesBiometrics`/`fetchSpeciesData`. Several tests assert on
 * specific cells of specific species here, so the per-species values matter
 * and are not interchangeable with the builder's defaults.
 */
export const ALPHA_BIOMETRICS_BY_SPECIES: BiometricsStatsResult[] = [
	buildBiometricsStatsRow({ species_name: 'Blue Tit' }),
	buildBiometricsStatsRow({
		species_name: 'Fieldfare',
		max_weight: 95,
		avg_weight: 95,
		min_weight: 95,
		median_weight: 95,
		max_wing: 145,
		avg_wing: 145,
		min_wing: 145,
		median_wing: 145,
		encounter_count: 1
	}),
	buildBiometricsStatsRow({
		species_name: 'Kingfisher',
		max_weight: 34,
		avg_weight: 33.8,
		min_weight: 33.5,
		median_weight: 33.8,
		max_wing: 77,
		avg_wing: 76.5,
		min_wing: 76,
		median_wing: 77,
		encounter_count: 2
	}),
	buildBiometricsStatsRow({
		species_name: 'Redwing',
		max_weight: 65,
		avg_weight: 65,
		min_weight: 65,
		median_weight: 65,
		max_wing: 118,
		avg_wing: 118,
		min_wing: 118,
		median_wing: 118,
		encounter_count: 1
	}),
	buildBiometricsStatsRow({
		species_name: 'Reed Warbler',
		max_weight: 12.2,
		avg_weight: 11.5,
		min_weight: 11,
		median_weight: 11.5,
		max_wing: 64,
		avg_wing: 62.9,
		min_wing: 62,
		median_wing: 63,
		encounter_count: 15
	}),
	buildBiometricsStatsRow({
		species_name: 'Robin',
		max_weight: 21,
		avg_weight: 18.3,
		min_weight: 16.5,
		median_weight: 18,
		max_wing: 80,
		avg_wing: 74.2,
		min_wing: 72,
		median_wing: 74,
		encounter_count: 31
	}),
	buildBiometricsStatsRow({
		species_name: 'Wren',
		max_weight: 9.2,
		avg_weight: 9.1,
		min_weight: 9,
		median_weight: 9.1,
		max_wing: 49,
		avg_wing: 48.5,
		min_wing: 48,
		median_wing: 49,
		encounter_count: 2
	})
];

/**
 * Gamma's by-species biometrics result: genuinely empty, because Gamma's seed
 * data has no biometric-eligible encounters at all. The no-rows edge case for
 * the biometrics half of a `/species` read.
 */
export const GAMMA_BIOMETRICS_BY_SPECIES: BiometricsStatsResult[] = [];

/**
 * The Robin/Alpha *headline* row — a single aggregate over every Robin
 * encounter, so `species_name` is genuinely null: it was captured from an
 * ungrouped, species-filtered call, which set no grouping column.
 * `BiometricsStatsResult` declares `species_name` non-null (every producer left
 * in app code groups by species), which is why the builder widens that one
 * override to accept `null` and coerces on the way out.
 */
export const ROBIN_ALPHA_BIOMETRICS_HEADLINE: BiometricsStatsResult =
	buildBiometricsStatsRow({
		species_name: null,
		max_weight: 21,
		avg_weight: 18.3,
		min_weight: 16.5,
		median_weight: 18,
		max_wing: 80,
		avg_wing: 74.2,
		min_wing: 72,
		median_wing: 74,
		encounter_count: 31
	});
