/**
 * Fixture-freshness check (issue #893).
 *
 * App tests mock their data with the JSON fixtures in `test-fixtures/snapshots/`,
 * consumed through `fixture as unknown as SomeType` — a double assertion that turns
 * assignability checking off entirely. So when an RPC's return shape changes, a stale
 * fixture keeps every app test green and `tsc` silent (this is exactly how #870's
 * column removal slipped through; see #890).
 *
 * This test regenerates the generator-produced fixtures into a temp directory from the
 * current database and diffs them against the committed copies, failing with the
 * specific per-file differences when they've drifted.
 *
 * The diff is structural — which columns exist, and how many rows each array holds —
 * never value-by-value. See `lib/snapshot-fixtures.ts` for why: fixture row order and
 * surrogate ids reflect the local database's physical row order and sequence state, so
 * comparing values would fail on every reseed for reasons unrelated to staleness, while
 * a column set and a row count are properties of the query and survive a reseed.
 *
 * Preconditions: local Supabase running and seeded exactly as `npm run db:seed:e2e`
 * leaves it — the same precondition as the rest of this suite.
 *
 * Concurrency: read-only. It writes solely to a per-run `fs.mkdtemp` directory under
 * the OS temp dir and never touches `test-fixtures/snapshots/` or any database row, so
 * it stays safe to run alongside sibling swarm worktrees (see CLAUDE.md's "DB
 * integration tests").
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { supabase } from '../../lib/supabase';
import {
	generateSnapshots,
	SNAPSHOTS_DIR
} from '../../scripts/generate-snapshots';
import {
	GENERATED_SNAPSHOT_FIXTURES,
	UNGENERATED_SNAPSHOT_FIXTURES,
	findSnapshotDrift,
	formatSnapshotDrift
} from '../../lib/snapshot-fixtures';

async function getGroupId(groupName: string): Promise<number> {
	const { data, error } = await supabase
		.from('RingingGroups')
		.select('id')
		.eq('group_name', groupName)
		.single();
	if (error || !data) {
		throw new Error(
			`Group "${groupName}" not found — run npm run db:seed:e2e first: ${error?.message}`
		);
	}
	return data.id;
}

async function readJson(filePath: string): Promise<unknown> {
	return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

/**
 * Lists every `.json` file under `directory` as a sorted set of
 * forward-slash-separated paths relative to it — the same spelling
 * `GENERATED_SNAPSHOT_FIXTURES` uses. Fixtures live one or two directories deep
 * since #882 (`core_stats/alpha.by-species.json`,
 * `tables/Birds/arretrap.bird-detail.json`), so a flat readdir won't do.
 */
async function listFixturePaths(directory: string): Promise<string[]> {
	const entries = await fs.readdir(directory, {
		recursive: true,
		withFileTypes: true
	});
	return entries
		.filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
		.map((entry) =>
			path
				.relative(directory, path.join(entry.parentPath, entry.name))
				.split(path.sep)
				.join('/')
		)
		.sort();
}

describe('snapshot fixture freshness', () => {
	let temporaryOutputDir: string;

	beforeAll(async () => {
		temporaryOutputDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'totf-snapshot-freshness-')
		);
		const [alphaId, betaId, gammaId] = await Promise.all([
			getGroupId('Alpha'),
			getGroupId('Beta'),
			getGroupId('Gamma')
		]);
		await generateSnapshots(alphaId, betaId, gammaId, temporaryOutputDir);
	}, 120_000);

	afterAll(async () => {
		if (temporaryOutputDir) {
			await fs.rm(temporaryOutputDir, { recursive: true, force: true });
		}
	});

	describe('coverage', () => {
		it('generates exactly the fixture set this check claims to cover', async () => {
			const generated = await listFixturePaths(temporaryOutputDir);
			expect(generated).toEqual([...GENERATED_SNAPSHOT_FIXTURES].sort());
		});

		it('leaves the ungenerated fixtures visibly uncovered (issue #894)', async () => {
			const committed = await listFixturePaths(SNAPSHOTS_DIR);
			expect(committed).toEqual(
				[
					...GENERATED_SNAPSHOT_FIXTURES,
					...UNGENERATED_SNAPSHOT_FIXTURES
				].sort()
			);
		});
	});

	describe('committed fixtures match freshly generated data', () => {
		it.each(GENERATED_SNAPSHOT_FIXTURES)('%s', async (filename) => {
			const [committed, generated] = await Promise.all([
				readJson(path.join(SNAPSHOTS_DIR, filename)),
				readJson(path.join(temporaryOutputDir, filename))
			]);
			const drifts = findSnapshotDrift(committed, generated);
			if (drifts.length > 0) {
				throw new Error(formatSnapshotDrift(filename, drifts));
			}
		});
	});
});
