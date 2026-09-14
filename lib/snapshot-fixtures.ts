/**
 * Shared metadata and drift-comparison helpers for the snapshot fixtures in
 * `test-fixtures/snapshots/`.
 *
 * App tests consume those fixtures as mock return values via
 * `fixture as unknown as SomeType`, a double assertion that switches off
 * assignability checking — so nothing in the type system notices when an RPC's
 * return shape changes and leaves a fixture carrying columns the database no
 * longer returns (or missing ones it now does). The DB integration test
 * `supabase/__tests__/snapshot-fixture-freshness.test.ts` closes that gap by
 * regenerating the fixtures into a temp directory and diffing them against the
 * committed copies with the helpers below.
 *
 * The diff is **structural** — the set of key paths present, with array indices
 * collapsed so `[0].max_wing` and `[7].max_wing` are one path, `[].max_wing`.
 * It deliberately does not compare values: a fixture's row order and surrogate
 * ids come from whatever physical order and sequence state the local database
 * happens to be in, neither of which survives a `supabase db reset` + reseed,
 * so value equality would fail constantly for reasons that have nothing to do
 * with fixture staleness. Column-level drift is both the failure #890
 * investigated and the one that survives a reseed.
 *
 * Pure data/comparison logic only — no I/O, so it can be unit tested in the app
 * suite without a database.
 */

/**
 * The 25 fixtures `scripts/generate-snapshots.ts` produces, and therefore the
 * exact set the freshness check covers. Paths are relative to
 * `test-fixtures/snapshots/` and follow #882's source-directory layout (one
 * subdirectory per RPC, `tables/<TableName>/` for direct PostgREST reads).
 *
 * Kept here (rather than inferred from the generator) so the check can assert
 * the generator still produces precisely this set: a fixture silently dropping
 * out of the generator would otherwise stop being checked without anything
 * failing.
 */
export const GENERATED_SNAPSHOT_FIXTURES = [
	'biometrics_stats/alpha.by-species.json',
	'biometrics_stats/gamma.by-species.json',
	'biometrics_stats/robin-alpha.headline.json',
	'biometrics_stats/robin-alpha.monthly-history.json',
	'core_stats/alpha.by-species.json',
	'core_stats/alpha.yearly-and-monthly-totals.json',
	'core_stats/beta.by-species.json',
	'core_stats/beta.yearly-and-monthly-totals.json',
	'core_stats/gamma.by-species.json',
	'core_stats/robin-alpha.headline.json',
	'core_stats/robin-alpha.monthly-history.json',
	'demographics_stats/robin-alpha.monthly-history.json',
	'find_discrepencies/alpha.discrepancies.json',
	'find_discrepencies/beta.discrepancies.json',
	'notable_retraps/alpha.retraps.json',
	'notable_retraps/beta.retraps.json',
	'notable_retraps/robin-alpha.retraps.json',
	'tables/Birds/arretrap.bird-detail.json',
	'tables/Birds/robin-alpha.graphable-encounters.json',
	'tables/Birds/robin-alpha.page-of-birds.json',
	'tables/Sessions/alpha.all-sessions.json',
	'tables/Sessions/alpha.recent-sessions.json',
	'tables/Sessions/beta.all-sessions.json',
	'top_metrics_by_period/alpha.busiest-days.json',
	'top_metrics_by_period/robin-alpha.top-sessions.json'
] as const;

/**
 * The 8 committed fixtures no generator produces — they can only be edited by
 * hand, so the freshness check cannot cover them. #882 moved them into their
 * correct source directory but did not wire them up for generation. Bringing
 * them under the generator (or deleting the ones with no consumers) is tracked
 * by issue #894; until then this list keeps the gap explicit rather than
 * implied-fixed.
 */
export const UNGENERATED_SNAPSHOT_FIXTURES = [
	'core_stats/alpha.home-page-summary.json',
	'core_stats/alpha.summary-totals.json',
	'core_stats/zero.home-page-summary.json',
	'core_stats/zero.summary-totals.json',
	'ring_sequence_controls/alpha.controls.json',
	'tables/Encounters/alpha.pulli-encounters.json',
	'tables/Encounters/alpha.resightings.json',
	'tables/Species/alpha.top-species.json'
] as const;

export type SnapshotDriftKind =
	/** The fixture has a key path the freshly generated data doesn't. */
	| 'extra-in-fixture'
	/** The freshly generated data has a key path the fixture doesn't. */
	| 'missing-from-fixture';

export type SnapshotDrift = {
	/** Key path of the difference, with array indices collapsed: `[].max_wing`. */
	path: string;
	kind: SnapshotDriftKind;
	/** The first value found at that path, as an illustration. */
	sampleValue: unknown;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Collects every key path in a JSON value, mapped to the first value found at
 * it. Array indices collapse to `[]`, so all elements of an array contribute to
 * one shared shape (a nullable column absent from one row but present in
 * another still counts as present).
 */
export function collectShapePaths(value: unknown): Map<string, unknown> {
	const paths = new Map<string, unknown>();

	function walk(node: unknown, path: string): void {
		if (path && !paths.has(path)) paths.set(path, node);

		if (Array.isArray(node)) {
			for (const element of node) walk(element, `${path}[]`);
			return;
		}
		if (isPlainObject(node)) {
			for (const [key, child] of Object.entries(node)) {
				walk(child, path ? `${path}.${key}` : key);
			}
		}
	}

	walk(value, '');
	return paths;
}

/**
 * Compares a committed fixture's structure against freshly generated data and
 * returns every key path present in one but not the other.
 *
 * An empty array means the fixture's shape is in sync.
 */
export function findSnapshotDrift(
	fixtureValue: unknown,
	generatedValue: unknown
): SnapshotDrift[] {
	const fixturePaths = collectShapePaths(fixtureValue);
	const generatedPaths = collectShapePaths(generatedValue);
	const drifts: SnapshotDrift[] = [];

	for (const [path, sampleValue] of fixturePaths) {
		if (!generatedPaths.has(path)) {
			drifts.push({ path, kind: 'extra-in-fixture', sampleValue });
		}
	}
	for (const [path, sampleValue] of generatedPaths) {
		if (!fixturePaths.has(path)) {
			drifts.push({ path, kind: 'missing-from-fixture', sampleValue });
		}
	}

	return drifts.sort((a, b) => a.path.localeCompare(b.path));
}

function formatValue(value: unknown): string {
	const serialised = JSON.stringify(value) ?? String(value);
	return serialised.length > 60 ? `${serialised.slice(0, 57)}...` : serialised;
}

/** Renders one file's drift list as a human-readable failure message. */
export function formatSnapshotDrift(
	filename: string,
	drifts: SnapshotDrift[]
): string {
	const lines = drifts.map((drift) =>
		drift.kind === 'extra-in-fixture'
			? `  ${drift.path}: in the fixture (e.g. ${formatValue(drift.sampleValue)}) but not in freshly generated data — a removed column?`
			: `  ${drift.path}: in freshly generated data (e.g. ${formatValue(drift.sampleValue)}) but not in the fixture — a newly added column?`
	);

	return [
		`${filename} has drifted from the shape its source RPC/table currently returns:`,
		...lines,
		`Regenerate with: npm run db:generate-snapshots (needs a DB seeded by npm run db:seed:e2e), then commit the result.`
	].join('\n');
}
