import type {
	BiometricStatName,
	BiometricsMetricsRow,
	StatsCacheBySpeciesResult
} from '@/modules/stats/browser';
import { buildBySpeciesStatsRow } from './core-stats-fixtures';
import alphaBiometricsSnapshot from '@/test-fixtures/snapshots/stats_cache_biometrics_metrics/alpha.by-species.json';
import alphaSpeciesSnapshot from '@/test-fixtures/snapshots/tables/Species/alpha.top-species.json';

/**
 * Wing/weight fixtures sourced from the live `stats_cache_biometrics_metrics`
 * RPC's generated snapshots (#1272) — the verbatim return of that RPC, which
 * keys on `species_id` rather than the display-oriented `species_name` a cache
 * row carries. Resolving the one against the other is the same join
 * `app/actions/spp-data.ts`'s arbitrary-window fallback performs in production,
 * done statically here against the already-committed
 * `tables/Species/alpha.top-species.json` fixture instead of issuing a live
 * `Species` read, per `supabase/CLAUDE.md`'s "No compound fixtures" rule.
 *
 * These are deliberately *not* whole-cache-row fixtures — that is
 * `core-stats-fixtures.ts`' job, and a cache row carries its own wing/weight
 * columns (#1222). This file exists for the one path that still reads the 8
 * metrics from the live RPC rather than off a cache row.
 *
 * The drift guard is twofold: the snapshots themselves are checked against the
 * database by `supabase/__tests__/snapshot-fixture-freshness.test.ts`, and the
 * `BiometricsMetricsRow` annotation below is the generated composite type for
 * the RPC's own result, so a column added to or removed from it fails here.
 */

/**
 * The 8 wing/weight columns of one stats cell plus the `species_name` they were
 * resolved against — all any consumer of this file reads. Spelled as a `Pick` of
 * the canonical cache-row result type so the column names and value types can't
 * drift from the rows production code actually merges these into.
 */
export type BiometricsFixtureRow = Pick<
	StatsCacheBySpeciesResult,
	'species_name' | BiometricStatName
>;

const SPECIES_NAMES_BY_ID = new Map(
	alphaSpeciesSnapshot.map(({ id, species_name }): [number, string] => [
		id,
		species_name
	])
);

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
 * Resolves one raw by-species snapshot row into a `BiometricsFixtureRow`. Only
 * the by-species snapshots are read here, so `species_id` is always a real id —
 * the ungrouped headline call's `null` shape has had no consumer since #1415.
 */
function resolveBiometricsMetricsRow({
	species_id: speciesId,
	max_weight,
	avg_weight,
	min_weight,
	median_weight,
	max_wing,
	avg_wing,
	min_wing,
	median_wing
}: BiometricsMetricsRow): BiometricsFixtureRow {
	if (speciesId === null) {
		throw new Error(
			'stats_cache_biometrics_metrics/alpha.by-species.json carries a null species_id — it is no longer a by-species snapshot'
		);
	}
	return {
		species_name: resolveSpeciesName(speciesId),
		max_weight,
		avg_weight,
		min_weight,
		median_weight,
		max_wing,
		avg_wing,
		min_wing,
		median_wing
	};
}

/**
 * Alpha's whole by-species biometrics result — one row per species, in the
 * same species order as the `SimpleStatsCacheBySpecies` snapshots, so the two
 * line up under a merge. Several tests assert on specific cells of specific
 * species here, so the per-species values matter and are not interchangeable
 * with the builder's defaults.
 */
export const ALPHA_BIOMETRICS_BY_SPECIES: BiometricsFixtureRow[] =
	alphaBiometricsSnapshot.map(resolveBiometricsMetricsRow);

// Alpha's Blue Tit row backs `buildBiometricsStatsRow`'s defaults: it is the
// species `buildBySpeciesStatsRow`'s callers pair these rows with most often.
const BLUE_TIT_BIOMETRICS = ALPHA_BIOMETRICS_BY_SPECIES.find(
	({ species_name }) => species_name === 'Blue Tit'
);
if (!BLUE_TIT_BIOMETRICS) {
	throw new Error(
		"Alpha's stats_cache_biometrics_metrics snapshot no longer carries a Blue Tit row — buildBiometricsStatsRow's defaults need a new species"
	);
}

/**
 * A whole stats-cell row whose 8 wing/weight columns come from the real
 * biometrics snapshot above, over `buildBySpeciesStatsRow`'s own defaults for every
 * other column — the shape a cache row genuinely has since #1222, rather than a
 * biometrics-only partial. Flat overrides merged on top, per this repo's
 * fixture-builder convention.
 */
export function buildBiometricsStatsRow(
	overrides: Partial<StatsCacheBySpeciesResult> = {}
): StatsCacheBySpeciesResult {
	return buildBySpeciesStatsRow({ ...BLUE_TIT_BIOMETRICS, ...overrides });
}
