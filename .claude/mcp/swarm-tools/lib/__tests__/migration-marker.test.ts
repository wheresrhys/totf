// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { execa } from 'execa';
import {
	readMigrationMarker,
	withMigrationMarkerLock,
	readHighestOnDiskMigrationVersion,
	markerIsCaughtUp,
	MigrationMarkerSchemaError,
} from '../migration-marker';

// git honours an inherited GIT_DIR over cwd (git sets it when invoking hooks), so strip the
// discovery overrides for the temp-repo init — otherwise a suite run from the pre-push hook would
// re-target the real repo instead of the isolated temp repo the marker resolves against.
function gitEnv(): NodeJS.ProcessEnv {
	const env = { ...process.env };
	delete env.GIT_DIR;
	delete env.GIT_WORK_TREE;
	delete env.GIT_INDEX_FILE;
	return env;
}

async function writeMigrationFiles(worktreePath: string, filenames: string[]): Promise<void> {
	const dir = path.join(worktreePath, 'supabase', 'migrations');
	await fs.mkdir(dir, { recursive: true });
	for (const name of filenames) {
		await fs.writeFile(path.join(dir, name), '-- migration\n', 'utf8');
	}
}

describe('migration-marker', () => {
	let repoDir: string;

	beforeEach(async () => {
		repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'swarm-migration-marker-'));
		await execa('git', ['init', '--quiet'], { cwd: repoDir, env: gitEnv(), extendEnv: false });
	});

	afterEach(async () => {
		await fs.rm(repoDir, { recursive: true, force: true });
	});

	describe('readHighestOnDiskMigrationVersion', () => {
		it('returns null when the migrations directory does not exist', async () => {
			expect(await readHighestOnDiskMigrationVersion(repoDir)).toBeNull();
		});

		it('returns null when the migrations directory holds no timestamp-prefixed .sql files', async () => {
			await writeMigrationFiles(repoDir, ['README.md', 'notes.txt']);
			expect(await readHighestOnDiskMigrationVersion(repoDir)).toBeNull();
		});

		it('returns the highest 14-digit version regardless of creation/listing order', async () => {
			// Write the highest-timestamp file first so a naive "last seen" would pick the wrong one.
			await writeMigrationFiles(repoDir, [
				'20260912162658_main.sql',
				'20260626120903_declarative_sync.sql',
				'20260626125119_update.sql',
			]);
			expect(await readHighestOnDiskMigrationVersion(repoDir)).toBe('20260912162658');
		});

		it('ignores non-.sql files even if they carry a 14-digit prefix', async () => {
			await writeMigrationFiles(repoDir, ['20260626120903_a.sql', '20261231235959_ignored.txt']);
			expect(await readHighestOnDiskMigrationVersion(repoDir)).toBe('20260626120903');
		});
	});

	describe('markerIsCaughtUp', () => {
		const highest = '20260912162658';

		it('is false when the marker has never been set', () => {
			expect(markerIsCaughtUp({ lastAppliedMigrationVersion: null }, highest)).toBe(false);
		});

		it('is false when the marker is behind the highest on-disk version', () => {
			expect(markerIsCaughtUp({ lastAppliedMigrationVersion: '20260626120903' }, highest)).toBe(false);
		});

		it('is true when the marker equals the highest on-disk version', () => {
			expect(markerIsCaughtUp({ lastAppliedMigrationVersion: highest }, highest)).toBe(true);
		});

		it('is true when the marker is beyond the highest on-disk version', () => {
			expect(markerIsCaughtUp({ lastAppliedMigrationVersion: '20271231235959' }, highest)).toBe(true);
		});
	});

	describe('marker file read/write', () => {
		it('reads a null marker when the file does not exist yet', async () => {
			expect(await readMigrationMarker(repoDir)).toEqual({ lastAppliedMigrationVersion: null });
		});

		it('persists and reads back an advanced marker under .claude/', async () => {
			await withMigrationMarkerLock(
				() => ({ marker: { lastAppliedMigrationVersion: '20260912162658' }, result: undefined }),
				repoDir
			);
			expect(await readMigrationMarker(repoDir)).toEqual({ lastAppliedMigrationVersion: '20260912162658' });
			const raw = await fs.readFile(path.join(repoDir, '.claude', 'swarm-migration-state.json'), 'utf8');
			expect(JSON.parse(raw)).toEqual({ lastAppliedMigrationVersion: '20260912162658' });
		});

		it('throws MigrationMarkerSchemaError when the file holds the wrong shape', async () => {
			const dir = path.join(repoDir, '.claude');
			await fs.mkdir(dir, { recursive: true });
			await fs.writeFile(path.join(dir, 'swarm-migration-state.json'), JSON.stringify({ foo: 'bar' }), 'utf8');
			await expect(readMigrationMarker(repoDir)).rejects.toThrow(MigrationMarkerSchemaError);
		});

		it('serializes concurrent marker advances without losing an update (locked read-modify-write)', async () => {
			// Eight racers each max-merge their own version into the marker. Serialized under the lock,
			// the final marker must be the maximum of all of them; a lost update (two racers reading
			// the same stale value and clobbering each other) would leave it below the maximum.
			const versions = Array.from({ length: 8 }, (_, i) => `2026090100000${i}`);
			const max = versions[versions.length - 1];
			await Promise.all(
				versions.map((version) =>
					withMigrationMarkerLock((marker) => {
						const current = marker.lastAppliedMigrationVersion;
						const next = current !== null && current > version ? current : version;
						return { marker: { lastAppliedMigrationVersion: next }, result: undefined };
					}, repoDir)
				)
			);
			expect(await readMigrationMarker(repoDir)).toEqual({ lastAppliedMigrationVersion: max });
		});
	});
});
