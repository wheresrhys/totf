// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { execa } from 'execa';
import { withStateLock, listState, SwarmStateSchemaError, type SwarmWorkerEntry } from '../state-file';

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
});
