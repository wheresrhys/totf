// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { execa } from 'execa';
import {
	ensureLocalMigrationsApplied,
	type MigrationUpRunner,
} from '../ensure-local-migrations-applied';
import { readMigrationMarker, withMigrationMarkerLock } from '../../lib/migration-marker';

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

/** A spyable runner that reports success; assert invocation count via `runner.mock.calls.length`. */
function successRunner() {
	return vi.fn<MigrationUpRunner>(async () => ({ exitCode: 0, stdout: 'Applied migration', stderr: '' }));
}

describe('ensure_local_migrations_applied', () => {
	// The worktree (holds supabase/migrations/) and the main checkout (holds the .claude/ marker) are
	// distinct in production; the marker resolves via git-common-dir, so `cwd` must be a git repo.
	let worktreeDir: string;

	beforeEach(async () => {
		worktreeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ensure-migrations-'));
		await execa('git', ['init', '--quiet'], { cwd: worktreeDir, env: gitEnv(), extendEnv: false });
	});

	afterEach(async () => {
		await fs.rm(worktreeDir, { recursive: true, force: true });
	});

	// Usual
	it('returns the fast-path result when the persisted marker equals the highest on-disk migration version, without invoking the Supabase CLI', async () => {
		await writeMigrationFiles(worktreeDir, ['20260626120903_a.sql', '20260912162658_b.sql']);
		await withMigrationMarkerLock(
			() => ({ marker: { lastAppliedMigrationVersion: '20260912162658' }, result: undefined }),
			worktreeDir
		);
		const runner = successRunner();

		const result = await ensureLocalMigrationsApplied(worktreeDir, { cwd: worktreeDir, runMigrationUp: runner });

		expect(result.status).toBe('already-applied');
		expect(result.highestOnDisk).toBe('20260912162658');
		expect(runner.mock.calls.length).toBe(0);
	});

	it('applies the missing migration and updates the marker when the persisted marker is behind the highest on-disk version', async () => {
		await writeMigrationFiles(worktreeDir, ['20260626120903_a.sql', '20260912162658_b.sql']);
		await withMigrationMarkerLock(
			() => ({ marker: { lastAppliedMigrationVersion: '20260626120903' }, result: undefined }),
			worktreeDir
		);
		const runner = successRunner();

		const result = await ensureLocalMigrationsApplied(worktreeDir, { cwd: worktreeDir, runMigrationUp: runner });

		expect(result.status).toBe('applied');
		expect(result.previousMarker).toBe('20260626120903');
		expect(result.marker).toBe('20260912162658');
		expect(runner.mock.calls.length).toBe(1);
		expect(await readMigrationMarker(worktreeDir)).toEqual({ lastAppliedMigrationVersion: '20260912162658' });
	});

	// Structure
	it('treats a missing/unset marker as behind (applies + persists) rather than erroring', async () => {
		await writeMigrationFiles(worktreeDir, ['20260912162658_b.sql']);
		const runner = successRunner();

		const result = await ensureLocalMigrationsApplied(worktreeDir, { cwd: worktreeDir, runMigrationUp: runner });

		expect(result.status).toBe('applied');
		expect(result.previousMarker).toBeNull();
		expect(result.marker).toBe('20260912162658');
		expect(runner.mock.calls.length).toBe(1);
		expect(await readMigrationMarker(worktreeDir)).toEqual({ lastAppliedMigrationVersion: '20260912162658' });
	});

	it('extracts the highest version correctly from a directory with multiple migration filenames, independent of file mtime/listing order', async () => {
		// Highest-timestamp file written first so a naive "last listed wins" would pick the wrong one.
		await writeMigrationFiles(worktreeDir, [
			'20260912162658_latest.sql',
			'20260626120903_first.sql',
			'20260626125119_middle.sql',
		]);
		const runner = successRunner();

		const result = await ensureLocalMigrationsApplied(worktreeDir, { cwd: worktreeDir, runMigrationUp: runner });

		expect(result.highestOnDisk).toBe('20260912162658');
		expect(result.status).toBe('applied');
		expect(result.marker).toBe('20260912162658');
	});

	// Edge
	it('no-ops safely when supabase/migrations/ is empty', async () => {
		await fs.mkdir(path.join(worktreeDir, 'supabase', 'migrations'), { recursive: true });
		const runner = successRunner();

		const result = await ensureLocalMigrationsApplied(worktreeDir, { cwd: worktreeDir, runMigrationUp: runner });

		expect(result.status).toBe('no-migrations');
		expect(result.highestOnDisk).toBeNull();
		expect(runner.mock.calls.length).toBe(0);
		expect(await readMigrationMarker(worktreeDir)).toEqual({ lastAppliedMigrationVersion: null });
	});

	it('surfaces a Supabase CLI failure during the apply path as an error result rather than silently leaving the marker stale', async () => {
		await writeMigrationFiles(worktreeDir, ['20260912162658_b.sql']);
		const failingRunner: MigrationUpRunner = async () => ({
			exitCode: 1,
			stdout: '',
			stderr: 'supabase: connection refused',
		});

		const result = await ensureLocalMigrationsApplied(worktreeDir, { cwd: worktreeDir, runMigrationUp: failingRunner });

		expect(result.status).toBe('error');
		expect(result.stderr).toContain('connection refused');
		// The marker is left unadvanced so the next caller retries — not silently bumped past the gap.
		expect(result.marker).toBeNull();
		expect(await readMigrationMarker(worktreeDir)).toEqual({ lastAppliedMigrationVersion: null });
	});

	it("two concurrent callers racing a write don't lose an update to the persisted marker (locked read-modify-write, mirroring the concurrency assertions swarm-state.ts's own tests make for the worker-array file)", async () => {
		await writeMigrationFiles(worktreeDir, ['20260912162658_b.sql']);
		const runner = successRunner();

		const [a, b] = await Promise.all([
			ensureLocalMigrationsApplied(worktreeDir, { cwd: worktreeDir, runMigrationUp: runner }),
			ensureLocalMigrationsApplied(worktreeDir, { cwd: worktreeDir, runMigrationUp: runner }),
		]);

		// Exactly one racer runs the CLI; the other, re-checking under the lock, sees it already caught
		// up and short-circuits — so the apply is never done twice and the marker isn't clobbered.
		expect(runner.mock.calls.length).toBe(1);
		const statuses = [a.status, b.status].sort();
		expect(statuses).toEqual(['already-applied', 'applied']);
		expect(await readMigrationMarker(worktreeDir)).toEqual({ lastAppliedMigrationVersion: '20260912162658' });
	});
});
