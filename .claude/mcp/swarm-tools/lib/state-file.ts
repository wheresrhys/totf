import { promises as fs } from 'fs';
import path from 'path';
import { execa } from 'execa';
import { z } from 'zod';

/**
 * Single source of truth for a worker entry's shape — used both to validate
 * .claude/swarm-state.json on read (see readState below) and, via tools/swarm-state.ts, to type
 * the swarm_state_* MCP tools' stored-entry output. Keeping one definition means a shape change
 * can't drift between "what we store" and "what we validate".
 */
export const swarmWorkerEntrySchema = z.object({
	kind: z.enum(['ticket', 'maintenance']),
	issue: z.number().nullable(),
	pr: z.number().nullable(),
	branch: z.string(),
	title: z.string(),
	worktreePath: z.string(),
	agentId: z.string(),
	model: z.string(),
	startedAt: z.string(),
});

export type SwarmWorkerEntry = z.infer<typeof swarmWorkerEntrySchema>;

const swarmStateSchema = z.array(swarmWorkerEntrySchema);

/** Thrown when .claude/swarm-state.json on disk doesn't match SwarmWorkerEntry[] — see #484. */
export class SwarmStateSchemaError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SwarmStateSchemaError';
	}
}

function formatZodIssues(error: z.ZodError): string {
	return error.issues.map((issue) => `${issue.path.length ? issue.path.join('.') : '(root)'}: ${issue.message}`).join('; ');
}

const LOCK_RETRY_MS = 50;
const LOCK_TIMEOUT_MS = 5000;

/**
 * Every git worktree of this repo shares one common `.git` dir, so resolving the state file's
 * path via `git rev-parse --git-common-dir` (rather than `process.cwd()` or this module's own
 * on-disk location) always lands on the *main* checkout's `.claude/swarm-state.json` — even if
 * this server process happens to be running with a worktree as its cwd. Cached per (cwd, process)
 * since it can't change during the server's lifetime.
 */
const projectRootCache = new Map<string, Promise<string>>();

/**
 * `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE` in the environment make git skip cwd-based repo
 * discovery entirely and operate on whatever repo those vars name — git itself sets `GIT_DIR`
 * when invoking hooks (e.g. this repo's `.husky/pre-push`), so a `git rev-parse` shelled out
 * during a pre-push run inherits it. Without stripping these, a caller passing an isolated
 * temp-repo `cwd` (as `state-file.test.ts` does) still resolves to the *real* repo whenever this
 * runs under a git hook, silently escaping the isolation and hitting the real
 * `.claude/swarm-state.json`. `extendEnv: false` is required alongside this — execa's default
 * `extendEnv: true` re-merges the spawned process's env on top of whatever `env` object is
 * passed, which would otherwise silently reintroduce the very vars just deleted from our copy.
 */
function envWithoutGitDiscoveryOverrides(): NodeJS.ProcessEnv {
	const env = { ...process.env };
	delete env.GIT_DIR;
	delete env.GIT_WORK_TREE;
	delete env.GIT_INDEX_FILE;
	return env;
}

async function resolveProjectRoot(cwd: string): Promise<string> {
	let cached = projectRootCache.get(cwd);
	if (!cached) {
		cached = execa('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
			cwd,
			env: envWithoutGitDiscoveryOverrides(),
			extendEnv: false,
		}).then((result) => path.dirname(result.stdout.trim()));
		projectRootCache.set(cwd, cached);
	}
	return cached;
}

async function resolveStateFilePath(cwd: string): Promise<string> {
	const root = await resolveProjectRoot(cwd);
	return path.join(root, '.claude', 'swarm-state.json');
}

async function acquireLock(stateFilePath: string): Promise<string> {
	const lockPath = `${stateFilePath}.lock`;
	await fs.mkdir(path.dirname(stateFilePath), { recursive: true });
	const deadline = Date.now() + LOCK_TIMEOUT_MS;
	for (;;) {
		try {
			const handle = await fs.open(lockPath, 'wx');
			await handle.close();
			return lockPath;
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
			if (Date.now() > deadline) {
				throw new Error(`Timed out waiting for lock on ${stateFilePath}`);
			}
			await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
		}
	}
}

async function releaseLock(lockPath: string): Promise<void> {
	await fs.rm(lockPath, { force: true });
}

async function readState(stateFilePath: string): Promise<SwarmWorkerEntry[]> {
	let raw: string;
	try {
		raw = await fs.readFile(stateFilePath, 'utf8');
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
		throw err;
	}
	if (!raw.trim()) return [];

	const parsed: unknown = JSON.parse(raw);
	const result = swarmStateSchema.safeParse(parsed);
	if (!result.success) {
		throw new SwarmStateSchemaError(
			`${stateFilePath} does not match the expected SwarmWorkerEntry[] shape: ${formatZodIssues(result.error)}`
		);
	}
	return result.data;
}

async function writeState(stateFilePath: string, entries: SwarmWorkerEntry[]): Promise<void> {
	await fs.mkdir(path.dirname(stateFilePath), { recursive: true });
	// Process-unique tmp filename: concurrent writers must never share one tmp path.
	const tmpPath = `${stateFilePath}.${process.pid}.${Date.now()}.tmp`;
	await fs.writeFile(tmpPath, JSON.stringify(entries, null, 2) + '\n', 'utf8');
	await fs.rename(tmpPath, stateFilePath);
}

/** True if `worktreePath` still exists on disk — a plain, local, no-network/no-git liveness check. */
async function worktreeStillExists(worktreePath: string): Promise<boolean> {
	try {
		await fs.access(worktreePath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Splits `entries` into those whose `worktreePath` still exists (live) and those whose worktree
 * is gone (stale — the worker died or finished without its cleanup step running). Order-preserving.
 */
async function partitionStaleEntries(
	entries: SwarmWorkerEntry[]
): Promise<{ live: SwarmWorkerEntry[]; stale: SwarmWorkerEntry[] }> {
	const stillExists = await Promise.all(entries.map((entry) => worktreeStillExists(entry.worktreePath)));
	const live: SwarmWorkerEntry[] = [];
	const stale: SwarmWorkerEntry[] = [];
	entries.forEach((entry, i) => (stillExists[i] ? live.push(entry) : stale.push(entry)));
	return { live, stale };
}

/**
 * Self-healing read: filters out any entry whose `worktreePath` no longer exists on disk (a
 * worker that died or finished without its `swarm_state_remove` cleanup step running — see
 * the stale-issue-#490 incident) before returning to the caller, so every consumer
 * (`swarm_state_list`, `swarm_plan_batch`'s `runningIssueNumbers`/`isSoloRunCurrentlyActive`,
 * `resolve-work-item`) treats a dead worktree as not-running without needing its own fix.
 *
 * Cheap and unlocked in the common case (all worktrees live) — just a snapshot read plus local
 * `fs.access` checks, no lock taken. Only when a stale entry is actually found does it pay for a
 * locked read-modify-write to prune the file, re-checking staleness against the freshly-locked
 * read (rather than trusting the pre-lock snapshot) to avoid clobbering a concurrent
 * append/remove from another worktree.
 */
export async function listState(cwd: string = process.cwd()): Promise<SwarmWorkerEntry[]> {
	const stateFilePath = await resolveStateFilePath(cwd);
	const snapshot = await readState(stateFilePath);
	const { stale } = await partitionStaleEntries(snapshot);
	if (stale.length === 0) return snapshot;

	return withStateLock(async (current) => {
		const { live } = await partitionStaleEntries(current);
		return { entries: live, result: live };
	}, cwd);
}

/**
 * Locked read-modify-write. `mutate` receives the current entries and returns (synchronously or
 * via a Promise) the entries to persist plus a result to hand back to the caller. Holds a
 * filesystem lock for the duration, so concurrent worktrees appending/removing/pruning entries
 * never lose an update to each other.
 */
export async function withStateLock<T>(
	mutate: (
		entries: SwarmWorkerEntry[]
	) => { entries: SwarmWorkerEntry[]; result: T } | Promise<{ entries: SwarmWorkerEntry[]; result: T }>,
	cwd: string = process.cwd()
): Promise<T> {
	const stateFilePath = await resolveStateFilePath(cwd);
	const lockPath = await acquireLock(stateFilePath);
	try {
		const current = await readState(stateFilePath);
		const { entries, result } = await mutate(current);
		await writeState(stateFilePath, entries);
		return result;
	} finally {
		await releaseLock(lockPath);
	}
}
