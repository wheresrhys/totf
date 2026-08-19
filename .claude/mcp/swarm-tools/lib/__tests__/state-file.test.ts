// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { execa } from 'execa';
import { withStateLock, listState, type SwarmWorkerEntry } from '../state-file';

function makeEntry(overrides: Partial<SwarmWorkerEntry> = {}): SwarmWorkerEntry {
	return {
		kind: 'ticket',
		issue: 1,
		pr: null,
		branch: 'feature/1-example',
		title: 'Example',
		worktreePath: '/tmp/example',
		agentId: 'agent-1',
		model: 'sonnet',
		startedAt: '2026-01-01T00:00:00.000Z',
		...overrides,
	};
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
		const { GIT_DIR: _GIT_DIR, GIT_WORK_TREE: _GIT_WORK_TREE, GIT_INDEX_FILE: _GIT_INDEX_FILE, ...env } = process.env;
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
});
