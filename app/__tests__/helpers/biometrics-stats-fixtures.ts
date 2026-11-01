import type { BiometricsStatsResult } from '@/app/models/db';
import alphaBiometricsSnapshot from '@/test-fixtures/snapshots/stats_cache_biometrics_metrics/alpha.by-species.json';
import gammaBiometricsSnapshot from '@/test-fixtures/snapshots/stats_cache_biometrics_metrics/gamma.by-species.json';
import robinAlphaBiometricsHeadlineSnapshot from '@/test-fixtures/snapshots/stats_cache_biometrics_metrics/robin-alpha.headline.json';
import alphaSpeciesSnapshot from '@/test-fixtures/snapshots/tables/Species/alpha.top-species.json';

/**
 * `BiometricsStatsResult` row fixtures — the 8 wing/weight summary statistics
 * plus `species_name`/`time_period`/`encounter_count`.
 *
 * Built from the generated `stats_cache_biometrics_metrics` snapshots (#1272),
 * which are the verbatim return of that RPC and so key on `species_id` rather
 * than the display-oriented `species_name` `BiometricsStatsResult` carries.
 * Resolving the one against the other is the same join
 * `app/actions/spp-data.ts`'s `readBiometricsFromMetricsRpc` /
 * `readSpeciesNamesById` perform in production — done statically here against
 * the already-committed `tables/Species/alpha.top-species.json` fixture
 * instead of issuing a live `Species` read, per `supabase/CLAUDE.md`'s "No
 * compound fixtures" rule ("let the consuming test do the same join the action
 * does").
 *
 * `encounter_count` comes out `null` on every row for the same reason it does
 * in production: the RPC's result type has no such column, and nothing
 * downstream reads it (`mergeSpeciesBiometrics`/`mergeBiometricsFields` copy
 * only the 8 metrics across).
 *
 * The drift guard is twofold: the snapshots themselves are checked against the
 * database by `supabase/__tests__/snapshot-fixture-freshness.test.ts`, and the
 * `as BiometricsStatsResult` coercion below (never `as unknown as`, see
 * `app/CLAUDE.md`'s "App tests") still fails on a newly added required column.
 */

/**
 * A `stats_cache_biometrics_metrics_result` row as the snapshots carry it: the
 * 8 metric columns plus `time_period`, keyed on `species_id` and with no
 * `encounter_count`.
 */
type BiometricsMetricsFixtureRow = Omit<
	BiometricsStatsResult,
	'species_name' | 'encounter_count'
> & { species_id: number | null };

const SPECIES_NAMES_BY_ID = new Map(
	alphaSpeciesSnapshot.map(({ id, species_name }): [number, string] => [
		id,
		species_name
	])
);

/**
 * Resolves one raw snapshot row into a `BiometricsStatsResult`. A `null`
 * `species_id` (the ungrouped headline call, which groups by nothing and so
 * sets no grouping column) passes straight through as a `null` species_name —
 * `BiometricsStatsResult`'s one documented nullable-`species_name` case —
 * rather than attempting a lookup.
 */
function resolveBiometricsMetricsRow({
	species_id,
	...metrics
}: BiometricsMetricsFixtureRow): BiometricsStatsResult {
	return {
		...metrics,
		species_name: species_id === null ? null : resolveSpeciesName(species_id),
		encounter_count: null
	} as BiometricsStatsResult;
}

function resolveSpeciesName(speciesId: number): string {
	const speciesName = SPECIES_NAMES_BY_ID.get(speciesId);
	if (speciesName === undefined) {
		throw new Error(
			`No species_name in tables/Species/alpha.top-species.json for species_id ${speciesId} — the two snapshot families have drifted apart`
		);
	}
	return speciesName;
}

/**
 * Alpha's whole by-species biometrics result — one row per species, in the
 * same species order as `core_stats/alpha.by-species.json`, so the two line up
 * under `mergeSpeciesBiometrics`/`fetchSpeciesData`. Several tests assert on
 * specific cells of specific species here, so the per-species values matter
 * and are not interchangeable with the builder's defaults.
 */
export const ALPHA_BIOMETRICS_BY_SPECIES: BiometricsStatsResult[] =
	alphaBiometricsSnapshot.map(resolveBiometricsMetricsRow);

/**
 * Gamma's by-species biometrics result: genuinely empty, because Gamma's seed
 * data has no biometric-eligible encounters at all. The no-rows edge case for
 * the biometrics half of a `/species` read.
 */
export const GAMMA_BIOMETRICS_BY_SPECIES: BiometricsStatsResult[] =
	gammaBiometricsSnapshot.map(resolveBiometricsMetricsRow);

/**
 * The Robin/Alpha *headline* row — a single aggregate over every Robin
 * encounter, captured from an ungrouped, species-filtered call, so its
 * `species_id` is `null` in the raw snapshot and `species_name` resolves to
 * `null` here. `BiometricsStatsResult` declares `species_name` non-null (every
 * producer left in app code groups by species), which is why the row is
 * coerced on the way out.
 */
export const ROBIN_ALPHA_BIOMETRICS_HEADLINE: BiometricsStatsResult =
	resolveBiometricsMetricsRow(robinAlphaBiometricsHeadlineSnapshot[0]);

// Alpha's Blue Tit row backs `buildBiometricsStatsRow`'s defaults: it is the
// species `buildCoreStatsRow`'s callers pair these rows with most often when
// exercising `mergeSpeciesBiometrics`.
const BLUE_TIT_BIOMETRICS = ALPHA_BIOMETRICS_BY_SPECIES.find(
	({ species_name }) => species_name === 'Blue Tit'
);
if (!BLUE_TIT_BIOMETRICS) {
	throw new Error(
		"Alpha's stats_cache_biometrics_metrics snapshot no longer carries a Blue Tit row — buildBiometricsStatsRow's defaults need a new species"
	);
}

/**
 * One `BiometricsStatsResult` row: flat overrides merged over the Blue
 * Tit/Alpha defaults above, per this repo's fixture-builder convention.
 */
export function buildBiometricsStatsRow(
	// `species_name` is widened to allow an explicit `null`, which
	// `Partial<BiometricsStatsResult>` would reject: the type declares it
	// non-null because every producer left in app code groups by species, and
	// the one shape that doesn't is `ROBIN_ALPHA_BIOMETRICS_HEADLINE` above.
	// Widening it here keeps a caller wanting that shape from needing a
	// `as unknown as` escape hatch at the call site (see `app/CLAUDE.md`'s
	// "App tests").
	overrides: Partial<Omit<BiometricsStatsResult, 'species_name'>> & {
		species_name?: string | null;
	} = {}
): BiometricsStatsResult {
	return {
		...BLUE_TIT_BIOMETRICS,
		...overrides
	} as BiometricsStatsResult;
}
