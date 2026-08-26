// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { promises as fs, mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { execa } from 'execa';
import {
	withStateLock,
	listState,
	listStateWithPruneReport,
	STALE_INACTIVITY_THRESHOLD_MS,
	SwarmStateSchemaError,
	type SwarmWorkerEntry,
} from '../state-file';

// listState() prunes entries by two independent signals: a missing worktreePath, and a worktree
// that exists but has gone quiet past STALE_INACTIVITY_THRESHOLD_MS. Default entries to a real,
// non-git temp directory: it exists (survives the missing check) and, being neither a git repo nor
// containing files, resolves its activity to its own directory mtime (just created → recent), so
// tests unrelated to staleness pruning are never silently pruned. The pruning-specific tests
// override worktreePath with purpose-built git worktrees.
const LIVE_WORKTREE = mkdtempSync(path.join(os.tmpdir(), 'swarm-state-live-'));

afterAll(() => {
	rmSync(LIVE_WORKTREE, { recursive: true, force: true });
});

function makeEntry(overrides: Partial<SwarmWorkerEntry> = {}): SwarmWorkerEntry {
	return {
		kind: 'ticket',
		issue: 1,
		pr: null,
		branch: 'feature/1-example',
		title: 'Example',
		worktreePath: LIVE_WORKTREE,
		agentId: 'agent-1',
		model: 'sonnet',
		startedAt: '2026-01-01T00:00:00.000Z',
		...overrides,
	};
}

// git honours an inherited GIT_DIR over cwd (git sets it when invoking hooks), so strip the
// discovery overrides for every git call these tests make — otherwise a suite run from the
// pre-push hook would re-target the real repo instead of the isolated temp worktree.
const GIT_ENV = (() => {
	const env = { ...process.env };
	delete env.GIT_DIR;
	delete env.GIT_WORK_TREE;
	delete env.GIT_INDEX_FILE;
	return env;
})();

async function gitInWorktree(args: string[], cwd: string, extraEnv: Record<string, string> = {}): Promise<void> {
	await execa('git', args, { cwd, env: { ...GIT_ENV, ...extraEnv }, extendEnv: false });
}

/** Creates a standalone git worktree (own repo) at `dir` — behaves identically to a real swarm worktree for `git status`/`git log`. */
async function initWorktreeRepo(dir: string): Promise<void> {
	await fs.mkdir(dir, { recursive: true });
	await gitInWorktree(['init', '--quiet'], dir);
	await gitInWorktree(['config', 'user.email', 'test@example.com'], dir);
	await gitInWorktree(['config', 'user.name', 'Test'], dir);
}

/** Stages everything and commits with the committer date pinned to `dateIso` (drives `git log %cI`). */
async function commitAllAt(dir: string, message: string, dateIso: string): Promise<void> {
	await gitInWorktree(['add', '-A'], dir);
	await gitInWorktree(['commit', '--quiet', '-m', message], dir, {
		GIT_AUTHOR_DATE: dateIso,
		GIT_COMMITTER_DATE: dateIso,
	});
}

/** Writes a file and pins its mtime to `mtimeMs` (integer-second precision, so exact for round values). */
async function writeFileWithMtime(filePath: string, mtimeMs: number): Promise<void> {
	await fs.writeFile(filePath, 'content', 'utf8');
	const seconds = mtimeMs / 1000;
	await fs.utimes(filePath, seconds, seconds);
}

describe('state-file', () => {
	let repoDir: string;

	beforeEach(async () => {
		repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'swarm-state-test-'));
		// `git init` honours an inherited GIT_DIR over cwd — git sets GIT_DIR when invoking hooks,
		// so running this suite from the pre-push hook would otherwise re-target the real repo's
		// .git instead of creating an isolated one here. Strip it (and disable execa's default
		// extendEnv, which would otherwise re-merge it back in from process.env) so the temp repo
		// is genuinely isolated regardless of what invoked the test run.
		const env = { ...process.env };
		delete env.GIT_DIR;
		delete env.GIT_WORK_TREE;
		delete env.GIT_INDEX_FILE;
		await execa('git', ['init', '--quiet'], { cwd: repoDir, env, extendEnv: false });
	});

	afterEach(async () => {
		await fs.rm(repoDir, { recursive: true, force: true });
	});

	// Usual
	it('returns an empty array when the state file does not exist yet', async () => {
		expect(await listState(repoDir)).toEqual([]);
	});

	it('appends an entry via withStateLock and reads it back', async () => {
		const entry = makeEntry();
		await withStateLock((entries) => ({ entries: [...entries, entry], result: undefined }), repoDir);
		expect(await listState(repoDir)).toEqual([entry]);
	});

	// Structure
	it('removes an entry by predicate via withStateLock', async () => {
		const entry = makeEntry();
		await withStateLock((entries) => ({ entries: [...entries, entry], result: undefined }), repoDir);
		await withStateLock(
			(entries) => ({ entries: entries.filter((e) => e.agentId !== entry.agentId), result: undefined }),
			repoDir
		);
		expect(await listState(repoDir)).toEqual([]);
	});

	it('writes the file under .claude/swarm-state.json at the repo root', async () => {
		await withStateLock((entries) => ({ entries: [...entries, makeEntry()], result: undefined }), repoDir);
		const raw = await fs.readFile(path.join(repoDir, '.claude', 'swarm-state.json'), 'utf8');
		expect(JSON.parse(raw)).toHaveLength(1);
	});

	// Edge
	it('serializes concurrent appends without losing an update', async () => {
		const entries = Array.from({ length: 8 }, (_, i) => makeEntry({ agentId: `agent-${i}` }));
		await Promise.all(
			entries.map((entry) => withStateLock((current) => ({ entries: [...current, entry], result: undefined }), repoDir))
		);
		const final = await listState(repoDir);
		expect(final).toHaveLength(8);
		expect(new Set(final.map((e) => e.agentId)).size).toBe(8);
	});

	it('returns a result value from the mutator', async () => {
		const entry = makeEntry();
		const removed = await withStateLock((entries) => ({ entries: [...entries, entry], result: entry.agentId }), repoDir);
		expect(removed).toBe('agent-1');
	});

	describe('schema validation', () => {
		async function writeRawState(raw: string): Promise<void> {
			const dir = path.join(repoDir, '.claude');
			await fs.mkdir(dir, { recursive: true });
			await fs.writeFile(path.join(dir, 'swarm-state.json'), raw, 'utf8');
		}

		// Structure
		it('throws SwarmStateSchemaError when the file holds an object instead of an array', async () => {
			await writeRawState(JSON.stringify({ workers: [] }));
			await expect(listState(repoDir)).rejects.toThrow(SwarmStateSchemaError);
		});

		it('throws SwarmStateSchemaError when an entry is missing a required key', async () => {
			const { agentId: _agentId, ...withoutAgentId } = makeEntry();
			await writeRawState(JSON.stringify([withoutAgentId]));
			await expect(listState(repoDir)).rejects.toThrow(SwarmStateSchemaError);
		});

		it('throws SwarmStateSchemaError when an entry has the wrong type for a field', async () => {
			await writeRawState(JSON.stringify([{ ...makeEntry(), issue: 'not-a-number' }]));
			await expect(listState(repoDir)).rejects.toThrow(SwarmStateSchemaError);
		});

		it('throws SwarmStateSchemaError when the top level is neither an object nor an array', async () => {
			await writeRawState(JSON.stringify('just a string'));
			await expect(listState(repoDir)).rejects.toThrow(SwarmStateSchemaError);
		});

		// Edge
		it('accepts an empty array', async () => {
			await writeRawState('[]');
			expect(await listState(repoDir)).toEqual([]);
		});

		it('tolerates unknown extra keys on an otherwise-valid entry', async () => {
			await writeRawState(JSON.stringify([{ ...makeEntry(), extraField: 'from-a-future-version' }]));
			const result = await listState(repoDir);
			expect(result).toHaveLength(1);
			expect(result[0].agentId).toBe('agent-1');
		});
	});

	describe('listState — stale worktree pruning', () => {
		async function readRawState(): Promise<SwarmWorkerEntry[]> {
			const raw = await fs.readFile(path.join(repoDir, '.claude', 'swarm-state.json'), 'utf8');
			return JSON.parse(raw);
		}

		// Usual
		it('omits an entry whose worktreePath no longer exists on disk', async () => {
			const deadEntry = makeEntry({ agentId: 'agent-dead', worktreePath: path.join(repoDir, 'nonexistent-worktree') });
			await withStateLock((entries) => ({ entries: [...entries, deadEntry], result: undefined }), repoDir);

			expect(await listState(repoDir)).toEqual([]);
		});

		it('keeps an entry whose worktreePath still exists on disk', async () => {
			const liveWorktreePath = path.join(repoDir, 'live-worktree');
			await fs.mkdir(liveWorktreePath, { recursive: true });
			const liveEntry = makeEntry({ agentId: 'agent-live', worktreePath: liveWorktreePath });
			await withStateLock((entries) => ({ entries: [...entries, liveEntry], result: undefined }), repoDir);

			expect(await listState(repoDir)).toEqual([liveEntry]);
		});

		// Structure
		it('prunes the stale entry from the on-disk file after listState surfaces it', async () => {
			const deadEntry = makeEntry({ agentId: 'agent-dead', worktreePath: path.join(repoDir, 'nonexistent-worktree') });
			await withStateLock((entries) => ({ entries: [...entries, deadEntry], result: undefined }), repoDir);

			await listState(repoDir);

			expect(await readRawState()).toEqual([]);
		});

		it('prunes only the stale entry when one is stale and one is live, keeping the live one intact', async () => {
			const liveWorktreePath = path.join(repoDir, 'live-worktree');
			await fs.mkdir(liveWorktreePath, { recursive: true });
			const liveEntry = makeEntry({ agentId: 'agent-live', worktreePath: liveWorktreePath });
			const deadEntry = makeEntry({ agentId: 'agent-dead', worktreePath: path.join(repoDir, 'nonexistent-worktree') });
			await withStateLock((entries) => ({ entries: [...entries, liveEntry, deadEntry], result: undefined }), repoDir);

			const result = await listState(repoDir);

			expect(result).toEqual([liveEntry]);
			expect(await readRawState()).toEqual([liveEntry]);
		});

		// Edge
		it('does not touch the on-disk file when all entries are live', async () => {
			const liveWorktreePath = path.join(repoDir, 'live-worktree');
			await fs.mkdir(liveWorktreePath, { recursive: true });
			const liveEntry = makeEntry({ agentId: 'agent-live', worktreePath: liveWorktreePath });
			await withStateLock((entries) => ({ entries: [...entries, liveEntry], result: undefined }), repoDir);
			const before = await fs.stat(path.join(repoDir, '.claude', 'swarm-state.json'));

			await listState(repoDir);

			const after = await fs.stat(path.join(repoDir, '.claude', 'swarm-state.json'));
			expect(after.mtimeMs).toBe(before.mtimeMs);
		});
	});

	describe('listState — stale-inactivity pruning', () => {
		async function readRawState(): Promise<SwarmWorkerEntry[]> {
			const raw = await fs.readFile(path.join(repoDir, '.claude', 'swarm-state.json'), 'utf8');
			return JSON.parse(raw);
		}

		// A round, divisible-by-1000 fixed instant so `now - threshold` lands on an exact integer
		// second — fs.utimes stores seconds, so boundary comparisons are then exact.
		const NOW = 1_800_000_000_000;
		const WITHIN = 5 * 60 * 1000;
		const BEYOND = STALE_INACTIVITY_THRESHOLD_MS + 5 * 60 * 1000;

		// Usual
		it('keeps an entry whose worktree has a changed-file mtime newer than the threshold', async () => {
			const wt = path.join(repoDir, 'wt-fresh-file');
			await initWorktreeRepo(wt);
			await writeFileWithMtime(path.join(wt, 'work.txt'), NOW - WITHIN);
			const entry = makeEntry({ agentId: 'agent-active', worktreePath: wt });
			await withStateLock((entries) => ({ entries: [...entries, entry], result: undefined }), repoDir);

			expect(await listState(repoDir, NOW)).toEqual([entry]);
		});

		it('prunes an entry whose worktree exists but every changed-file mtime is older than the threshold', async () => {
			const wt = path.join(repoDir, 'wt-stale-file');
			await initWorktreeRepo(wt);
			await writeFileWithMtime(path.join(wt, 'work.txt'), NOW - BEYOND);
			const entry = makeEntry({ agentId: 'agent-dead', worktreePath: wt });
			await withStateLock((entries) => ({ entries: [...entries, entry], result: undefined }), repoDir);

			expect(await listState(repoDir, NOW)).toEqual([]);
			expect(await readRawState()).toEqual([]);
		});

		// Structure
		it('prunes based on last-commit date when the worktree is clean and the last commit predates the threshold', async () => {
			const wt = path.join(repoDir, 'wt-old-commit');
			await initWorktreeRepo(wt);
			await fs.writeFile(path.join(wt, 'file.txt'), 'x', 'utf8');
			await commitAllAt(wt, 'old work', new Date(NOW - BEYOND).toISOString());
			const entry = makeEntry({ agentId: 'agent-old-commit', worktreePath: wt });
			await withStateLock((entries) => ({ entries: [...entries, entry], result: undefined }), repoDir);

			expect(await listState(repoDir, NOW)).toEqual([]);
		});

		it('keeps an entry based on last-commit date when the worktree is clean but the last commit is within the threshold', async () => {
			const wt = path.join(repoDir, 'wt-recent-commit');
			await initWorktreeRepo(wt);
			await fs.writeFile(path.join(wt, 'file.txt'), 'x', 'utf8');
			await commitAllAt(wt, 'recent work', new Date(NOW - WITHIN).toISOString());
			const entry = makeEntry({ agentId: 'agent-recent-commit', worktreePath: wt });
			await withStateLock((entries) => ({ entries: [...entries, entry], result: undefined }), repoDir);

			expect(await listState(repoDir, NOW)).toEqual([entry]);
		});

		it('reports reason stale-inactivity for an inactive worktree, distinct from worktree-missing', async () => {
			const staleWt = path.join(repoDir, 'wt-inactive');
			await initWorktreeRepo(staleWt);
			await writeFileWithMtime(path.join(staleWt, 'work.txt'), NOW - BEYOND);
			const inactiveEntry = makeEntry({ agentId: 'agent-inactive', worktreePath: staleWt });
			const missingEntry = makeEntry({ agentId: 'agent-missing', worktreePath: path.join(repoDir, 'gone') });
			await withStateLock(
				(entries) => ({ entries: [...entries, inactiveEntry, missingEntry], result: undefined }),
				repoDir
			);

			const { workers, pruned } = await listStateWithPruneReport(repoDir, NOW);

			expect(workers).toEqual([]);
			expect(pruned).toEqual([
				{ agentId: 'agent-inactive', branch: inactiveEntry.branch, issue: 1, pr: null, title: 'Example', reason: 'stale-inactivity' },
				{ agentId: 'agent-missing', branch: missingEntry.branch, issue: 1, pr: null, title: 'Example', reason: 'worktree-missing' },
			]);
		});

		it('prunes only the stale-inactive entry when another entry is live, keeping the live one intact', async () => {
			const liveWt = path.join(repoDir, 'wt-live');
			await initWorktreeRepo(liveWt);
			await writeFileWithMtime(path.join(liveWt, 'work.txt'), NOW - WITHIN);
			const staleWt = path.join(repoDir, 'wt-stale');
			await initWorktreeRepo(staleWt);
			await writeFileWithMtime(path.join(staleWt, 'work.txt'), NOW - BEYOND);
			const liveEntry = makeEntry({ agentId: 'agent-live', worktreePath: liveWt });
			const staleEntry = makeEntry({ agentId: 'agent-stale', worktreePath: staleWt });
			await withStateLock((entries) => ({ entries: [...entries, liveEntry, staleEntry], result: undefined }), repoDir);

			const result = await listState(repoDir, NOW);

			expect(result).toEqual([liveEntry]);
			expect(await readRawState()).toEqual([liveEntry]);
		});

		// Edge
		it('keeps a freshly-created worktree with no files and no commits (dir-mtime fallback treats it as just-born)', async () => {
			const wt = path.join(repoDir, 'wt-empty');
			await initWorktreeRepo(wt);
			const entry = makeEntry({ agentId: 'agent-fresh', worktreePath: wt });
			await withStateLock((entries) => ({ entries: [...entries, entry], result: undefined }), repoDir);

			// Real Date.now(): the fallback is the directory's real creation time, not a fixed instant.
			expect(await listState(repoDir)).toEqual([entry]);
		});

		it('keeps an entry whose newest activity is exactly at the threshold boundary (inclusive)', async () => {
			const wt = path.join(repoDir, 'wt-boundary');
			await initWorktreeRepo(wt);
			await writeFileWithMtime(path.join(wt, 'work.txt'), NOW - STALE_INACTIVITY_THRESHOLD_MS);
			const entry = makeEntry({ agentId: 'agent-boundary', worktreePath: wt });
			await withStateLock((entries) => ({ entries: [...entries, entry], result: undefined }), repoDir);

			expect(await listState(repoDir, NOW)).toEqual([entry]);
		});

		it('does not touch the on-disk file when all entries are live under the stale-inactivity check', async () => {
			const wt = path.join(repoDir, 'wt-live-only');
			await initWorktreeRepo(wt);
			await writeFileWithMtime(path.join(wt, 'work.txt'), NOW - WITHIN);
			const entry = makeEntry({ agentId: 'agent-live-only', worktreePath: wt });
			await withStateLock((entries) => ({ entries: [...entries, entry], result: undefined }), repoDir);
			const before = await fs.stat(path.join(repoDir, '.claude', 'swarm-state.json'));

			await listState(repoDir, NOW);

			const after = await fs.stat(path.join(repoDir, '.claude', 'swarm-state.json'));
			expect(after.mtimeMs).toBe(before.mtimeMs);
		});

		it('produces exactly one prune-report entry for a missing worktree (both signals would apply)', async () => {
			const missingEntry = makeEntry({ agentId: 'agent-both', worktreePath: path.join(repoDir, 'gone') });
			await withStateLock((entries) => ({ entries: [...entries, missingEntry], result: undefined }), repoDir);

			const { pruned } = await listStateWithPruneReport(repoDir, NOW);

			expect(pruned).toEqual([
				{ agentId: 'agent-both', branch: missingEntry.branch, issue: 1, pr: null, title: 'Example', reason: 'worktree-missing' },
			]);
		});
	});
});
