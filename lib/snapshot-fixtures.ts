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
 * Two kinds of difference are reported, and the vocabulary is deliberate
 * throughout this module, its tests and its failure messages: a **column** is
 * one leaf of a result row, addressed by a *column path* with array indices
 * collapsed so `[0].max_wing` and `[7].max_wing` are one path, `[].max_wing`;
 * a **row** is one element of a result array.
 *
 * 1. **Column drift** — a column path present on one side and not the other.
 * 2. **Row-count drift** — both sides carry the same columns, but a different
 *    number of rows (a fixture committed at 3 rows against a database that now
 *    returns 5 is just as stale, and is invisible to a column-only diff).
 *
 * Neither compares *values*: a fixture's row order and surrogate ids come from
 * whatever physical order and sequence state the local database happens to be
 * in, neither of which survives a `supabase db reset` + reseed, so value
 * equality would fail constantly for reasons that have nothing to do with
 * fixture staleness. Columns and row counts are both properties of the query,
 * not of the physical storage, so both survive a reseed of the same seed data.
 * (Row counts are the more sensitive of the two: a concurrently-running write
 * test that has inserted rows into a seed group and not yet torn them down can
 * move a count. Re-run against a settled database before believing a
 * row-count-only failure.)
 *
 * Pure data/comparison logic only — no I/O, so it can be unit tested in the app
 * suite without a database.
 */

/**
 * The 27 fixtures `scripts/generate-snapshots.ts` produces, and therefore the
 * exact set the freshness check covers. Paths are relative to
 * `test-fixtures/snapshots/` and follow #882's source-directory layout (one
 * subdirectory per RPC, `tables/<TableName>/` for direct PostgREST reads).
 *
 * Kept here (rather than inferred from the generator) so the check can assert
 * the generator still produces precisely this set: a fixture silently dropping
 * out of the generator would otherwise stop being checked without anything
 * failing.
 *
 * #894 wired the previously hand-maintained `core_stats/alpha.home-page-summary.json`
 * / `alpha.summary-totals.json` / `ring_sequence_controls/alpha.controls.json` /
 * `tables/Encounters/alpha.{pulli-encounters,resightings}.json` /
 * `tables/Species/alpha.top-species.json` fixtures into this list, and deleted
 * four generated-but-unconsumed fixtures that had no test reading them
 * (`core_stats/robin-alpha.monthly-history.json`,
 * `biometrics_stats/robin-alpha.monthly-history.json`,
 * `tables/Birds/robin-alpha.graphable-encounters.json`,
 * `find_discrepencies`/`notable_retraps` `beta.*` counterparts to the alpha-only
 * fixtures below) — see `scripts/generate-snapshots.ts`'s per-block comments for
 * why each one is safe to skip.
 *
 * #901 split the last two compound fixtures (each merging two RPC/table results
 * into one file) into their raw sources: `core_stats/{alpha,beta}.yearly-and-monthly-totals.json`
 * became `{alpha,beta}.monthly-totals.json` / `{alpha,beta}.yearly-totals.json`, and
 * `tables/Birds/arretrap.bird-detail.json` became `tables/Birds/arretrap.bird.json` /
 * `tables/Encounters/arretrap.encounters.json` — see CLAUDE.md's "App tests" section
 * for why every fixture is now a verbatim single-source response.
 */
export const GENERATED_SNAPSHOT_FIXTURES = [
	'biometrics_stats/alpha.by-species.json',
	'biometrics_stats/gamma.by-species.json',
	'biometrics_stats/robin-alpha.headline.json',
	'core_stats/alpha.by-species.json',
	'core_stats/alpha.home-page-summary.json',
	'core_stats/alpha.monthly-totals.json',
	'core_stats/alpha.summary-totals.json',
	'core_stats/alpha.yearly-totals.json',
	'core_stats/beta.by-species.json',
	'core_stats/beta.monthly-totals.json',
	'core_stats/beta.yearly-totals.json',
	'core_stats/gamma.by-species.json',
	'core_stats/robin-alpha.headline.json',
	'demographics_stats/robin-alpha.monthly-history.json',
	'find_discrepencies/alpha.discrepancies.json',
	'notable_retraps/alpha.retraps.json',
	'notable_retraps/robin-alpha.retraps.json',
	'ring_sequence_controls/alpha.controls.json',
	'tables/Birds/arretrap.bird.json',
	'tables/Birds/robin-alpha.page-of-birds.json',
	'tables/Encounters/alpha.pulli-encounters.json',
	'tables/Encounters/alpha.resightings.json',
	'tables/Encounters/arretrap.encounters.json',
	'tables/Sessions/alpha.all-sessions.json',
	'tables/Sessions/alpha.recent-sessions.json',
	'tables/Sessions/beta.all-sessions.json',
	'tables/Species/alpha.top-species.json'
] as const;

/**
 * The 2 committed fixtures no generator produces or ever will —
 * `synthetic/zero.home-page-summary.json` and `synthetic/zero.summary-totals.json`
 * are hand-authored all-zero/null edge cases that no real query against seed
 * data can produce (see `test-fixtures/snapshots/synthetic/README.md`). Every
 * other previously-hand-maintained fixture was brought under the generator by
 * #894, closing that gap; this pair is a deliberate, permanent exception rather
 * than a remaining gap, so the freshness check's coverage test can still assert
 * the on-disk fixture set is exactly `GENERATED_SNAPSHOT_FIXTURES` plus these.
 */
export const UNGENERATED_SNAPSHOT_FIXTURES = [
	'synthetic/zero.home-page-summary.json',
	'synthetic/zero.summary-totals.json'
] as const;

export type SnapshotDriftKind =
	/** The fixture has a column the freshly generated data doesn't. */
	| 'extra-in-fixture'
	/** The freshly generated data has a column the fixture doesn't. */
	| 'missing-from-fixture'
	/** Both carry the same columns, but a different number of rows. */
	| 'row-count-mismatch';

/** A column present on one side of the comparison and not the other. */
export type SnapshotColumnDrift = {
	/** Column path, with array indices collapsed: `[].max_wing`. */
	path: string;
	kind: 'extra-in-fixture' | 'missing-from-fixture';
	/** The first value found at that column path, as an illustration. */
	sampleValue: unknown;
};

/** An array whose row count differs between the fixture and fresh data. */
export type SnapshotRowCountDrift = {
	/** Path of the array itself, with indices collapsed: `[]`, `yearly[]`. */
	path: string;
	kind: 'row-count-mismatch';
	fixtureRowCount: number;
	generatedRowCount: number;
};

export type SnapshotDrift = SnapshotColumnDrift | SnapshotRowCountDrift;

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Collects every column path in a JSON value, mapped to the first value found
 * at it. Array indices collapse to `[]`, so all rows of an array contribute to
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
 * Counts the rows of every array in a JSON value, keyed by the array's path
 * with indices collapsed the same way `collectShapePaths` collapses them.
 *
 * Because the path collapses indices, an array nested inside another array
 * (`[].encounters[]`) is one key covering many physical arrays, so its count is
 * the total number of rows across all of them — the only count that path can
 * meaningfully name.
 */
function collectRowCounts(value: unknown): Map<string, number> {
	const counts = new Map<string, number>();

	function walk(node: unknown, path: string): void {
		if (Array.isArray(node)) {
			const arrayPath = `${path}[]`;
			counts.set(arrayPath, (counts.get(arrayPath) ?? 0) + node.length);
			for (const element of node) walk(element, arrayPath);
			return;
		}
		if (isPlainObject(node)) {
			for (const [key, child] of Object.entries(node)) {
				walk(child, path ? `${path}.${key}` : key);
			}
		}
	}

	walk(value, '');
	return counts;
}

function isDescendantPath(path: string, ancestorPath: string): boolean {
	return (
		path.startsWith(`${ancestorPath}.`) || path.startsWith(`${ancestorPath}[`)
	);
}

/**
 * Compares a committed fixture against freshly generated data and returns every
 * column present in one but not the other, plus every array whose row count
 * differs.
 *
 * A nested array is only reported when no array above it already drifted —
 * a row added to the top-level array necessarily changes the total row count of
 * every array nested inside it, and repeating that as its own finding would
 * bury the one difference that actually matters.
 *
 * An empty array means the fixture is in sync.
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

	const fixtureRowCounts = collectRowCounts(fixtureValue);
	const generatedRowCounts = collectRowCounts(generatedValue);
	const driftedArrayPaths: string[] = [];
	// Insertion order is the walk's pre-order, so an array is always seen
	// before anything nested inside it.
	for (const [path, fixtureRowCount] of fixtureRowCounts) {
		const generatedRowCount = generatedRowCounts.get(path);
		if (
			generatedRowCount === undefined ||
			generatedRowCount === fixtureRowCount
		)
			continue;
		if (
			driftedArrayPaths.some((ancestorPath) =>
				isDescendantPath(path, ancestorPath)
			)
		)
			continue;
		driftedArrayPaths.push(path);
		drifts.push({
			path,
			kind: 'row-count-mismatch',
			fixtureRowCount,
			generatedRowCount
		});
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
	const lines = drifts.map((drift) => {
		if (drift.kind === 'row-count-mismatch') {
			return `  ${drift.path}: ${drift.fixtureRowCount} rows in the fixture, ${drift.generatedRowCount} in freshly generated data — a stale row set?`;
		}
		return drift.kind === 'extra-in-fixture'
			? `  ${drift.path}: in the fixture (e.g. ${formatValue(drift.sampleValue)}) but not in freshly generated data — a removed column?`
			: `  ${drift.path}: in freshly generated data (e.g. ${formatValue(drift.sampleValue)}) but not in the fixture — a newly added column?`;
	});

	return [
		`${filename} has drifted from what its source RPC/table currently returns:`,
		...lines,
		`Regenerate with: npm run db:generate-snapshots (needs a DB seeded by npm run db:seed:e2e), then commit the result.`
	].join('\n');
}
