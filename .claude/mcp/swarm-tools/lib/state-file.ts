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

/**
 * Why an entry was pruned from `.claude/swarm-state.json` during a self-healing read:
 * - `worktree-missing`: its `worktreePath` no longer exists on disk (the pre-existing #490 signal
 *   — worker finished/died *and* its worktree was torn down).
 * - `stale-inactivity`: its worktree still exists but has shown no filesystem/commit activity for
 *   longer than {@link STALE_INACTIVITY_THRESHOLD_MS} (the #579 signal — the agent process died
 *   with real work still sitting in the worktree, so `worktree-missing` never fires).
 */
export const pruneReasonSchema = z.enum(['worktree-missing', 'stale-inactivity']);
export type PruneReason = z.infer<typeof pruneReasonSchema>;

/**
 * A pruned worker, surfaced back to the caller (rather than silently dropped) so `/swarm` can warn
 * the user which presumed-dead workers it removed and why — an auto-prune that succeeds quietly
 * would reproduce the original "nobody told me" complaint, just for over-provisioning if the
 * heuristic is ever wrong. Carries enough identity to name the worker in that warning.
 */
export const prunedEntrySchema = z.object({
	agentId: z.string(),
	branch: z.string(),
	issue: z.number().nullable(),
	pr: z.number().nullable(),
	title: z.string(),
	reason: pruneReasonSchema,
});
export type PrunedEntry = z.infer<typeof prunedEntrySchema>;

export interface ListStateResult {
	workers: SwarmWorkerEntry[];
	pruned: PrunedEntry[];
}

/**
 * Idle time past which a worker whose worktree still exists but shows no filesystem/commit
 * activity is presumed dead and pruned. Set to 45 minutes: comfortably longer than the gap a
 * genuinely-alive worker leaves between filesystem writes across even its slowest single step (a
 * full `npm run qa` + Playwright E2E pass is a few minutes at worst), so a busy-but-quiet worker is
 * never killed, yet short enough to reliably catch a truly dead one (the #579 incident's phantom
 * workers had been idle ~1h15m). Deliberately a single documented constant, not user-configurable
 * (YAGNI) — revisit only if false positives turn up in practice.
 */
export const STALE_INACTIVITY_THRESHOLD_MS = 45 * 60 * 1000;

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

/** Runs a git subcommand at `worktreePath`, returning trimmed stdout, or `null` if git errors. */
async function gitAt(worktreePath: string, args: string[]): Promise<string | null> {
	try {
		const { stdout } = await execa('git', args, {
			cwd: worktreePath,
			env: envWithoutGitDiscoveryOverrides(),
			extendEnv: false,
		});
		return stdout;
	} catch {
		return null;
	}
}

/**
 * Newest mtime (ms) among the worktree's *uncommitted-changed* files — modified-tracked plus
 * untracked-non-ignored, via `git ls-files`. This is the true "is the worker still writing?"
 * signal and, because it drives off git's own change list, it costs a handful of `stat`s (not a
 * full-tree walk) and never touches `.git` internals or gitignored paths like `node_modules`.
 * `null` when the worktree is clean (nothing to compare mtimes against) or git can't be run.
 */
async function newestChangedFileMtimeMs(worktreePath: string): Promise<number | null> {
	const stdout = await gitAt(worktreePath, ['ls-files', '-z', '--modified', '--others', '--exclude-standard']);
	if (stdout === null) return null;
	const relPaths = stdout.split('\0').filter(Boolean);
	let newest: number | null = null;
	for (const rel of relPaths) {
		try {
			const stat = await fs.stat(path.join(worktreePath, rel));
			if (newest === null || stat.mtimeMs > newest) newest = stat.mtimeMs;
		} catch {
			// A listed path can be a since-deleted file — skip it rather than failing the check.
		}
	}
	return newest;
}

/** Committer date (ms) of the worktree's HEAD commit, or `null` if it has no commits / git errors. */
async function lastCommitMs(worktreePath: string): Promise<number | null> {
	const stdout = await gitAt(worktreePath, ['log', '-1', '--format=%cI']);
	if (stdout === null) return null;
	const iso = stdout.trim();
	if (!iso) return null;
	const ms = Date.parse(iso);
	return Number.isNaN(ms) ? null : ms;
}

/** Mtime (ms) of the worktree directory itself — the last-ditch fallback for an empty, commit-less worktree. */
async function directoryMtimeMs(worktreePath: string): Promise<number | null> {
	try {
		return (await fs.stat(worktreePath)).mtimeMs;
	} catch {
		return null;
	}
}

/**
 * Newest "activity" timestamp (ms) for a worktree, in priority order:
 * 1. newest mtime among uncommitted-changed files (a worker mid-edit),
 * 2. else the HEAD commit's committer date (a worker that just committed and is quietly running,
 *    e.g. a long test pass with no working-tree writes),
 * 3. else the worktree directory's own mtime (a freshly-created, commit-less worktree — treated as
 *    just-born, so a brand-new worker is never pruned before it writes anything).
 * `null` only if even the directory can't be stat'd (i.e. it's gone — handled by worktree-missing).
 */
async function worktreeActivityMs(worktreePath: string): Promise<number | null> {
	const changedMtime = await newestChangedFileMtimeMs(worktreePath);
	if (changedMtime !== null) return changedMtime;
	const commitMs = await lastCommitMs(worktreePath);
	if (commitMs !== null) return commitMs;
	return directoryMtimeMs(worktreePath);
}

/**
 * True if the worktree shows activity within {@link STALE_INACTIVITY_THRESHOLD_MS} of `nowMs`
 * (boundary inclusive — an entry idle *exactly* the threshold is still considered alive). When no
 * activity timestamp can be derived at all it errs alive (returns `true`): staleness must be a
 * positive signal, never the mere absence of one.
 */
async function worktreeHasRecentActivity(worktreePath: string, nowMs: number): Promise<boolean> {
	const activityMs = await worktreeActivityMs(worktreePath);
	if (activityMs === null) return true;
	return nowMs - activityMs <= STALE_INACTIVITY_THRESHOLD_MS;
}

/** Classifies one entry as live (`null`) or names the single reason it should be pruned. */
async function classifyStaleness(entry: SwarmWorkerEntry, nowMs: number): Promise<PruneReason | null> {
	// worktree-missing wins outright: a gone worktree trivially has no activity, but we report one
	// reason, not two, and skip the git work entirely for the cheap dead-worktree case.
	if (!(await worktreeStillExists(entry.worktreePath))) return 'worktree-missing';
	if (!(await worktreeHasRecentActivity(entry.worktreePath, nowMs))) return 'stale-inactivity';
	return null;
}

function toPrunedEntry(entry: SwarmWorkerEntry, reason: PruneReason): PrunedEntry {
	return {
		agentId: entry.agentId,
		branch: entry.branch,
		issue: entry.issue,
		pr: entry.pr,
		title: entry.title,
		reason,
	};
}

/**
 * Splits `entries` into live ones (worktree present *and* recently active) and a prune report of
 * the rest, each tagged with the single reason it fired (`worktree-missing` or `stale-inactivity`).
 * Order-preserving.
 */
async function partitionStaleEntries(
	entries: SwarmWorkerEntry[],
	nowMs: number
): Promise<{ live: SwarmWorkerEntry[]; pruned: PrunedEntry[] }> {
	const reasons = await Promise.all(entries.map((entry) => classifyStaleness(entry, nowMs)));
	const live: SwarmWorkerEntry[] = [];
	const pruned: PrunedEntry[] = [];
	entries.forEach((entry, i) => {
		const reason = reasons[i];
		if (reason === null) live.push(entry);
		else pruned.push(toPrunedEntry(entry, reason));
	});
	return { live, pruned };
}

/**
 * Self-healing read that also reports what it pruned. An entry is pruned when either (a) its
 * `worktreePath` no longer exists on disk (the #490 signal — a worker that died/finished without
 * its `swarm_state_remove` cleanup running *and* had its worktree torn down) or (b) its worktree
 * still exists but has gone quiet past {@link STALE_INACTIVITY_THRESHOLD_MS} (the #579 signal — the
 * agent process died with real work still sitting in the worktree). Either check alone is
 * sufficient; both are surfaced through `pruned` so callers can warn the user. Every consumer
 * (`swarm_state_list`, `swarm_plan_batch`'s `runningIssueNumbers`/`isSoloRunCurrentlyActive`,
 * `resolve-work-item` via {@link listState}) treats a pruned worker as not-running for free.
 *
 * Cheap and unlocked in the common case (all workers live) — a snapshot read plus, per entry, an
 * `fs.access` and at most a couple of local git calls; no lock taken. Only when something is
 * actually prunable does it pay for a locked read-modify-write, re-checking staleness against the
 * freshly-locked read (not the pre-lock snapshot) to avoid clobbering a concurrent append/remove
 * from another worktree — so the returned `pruned` reflects what was really removed under the lock.
 */
export async function listStateWithPruneReport(
	cwd: string = process.cwd(),
	nowMs: number = Date.now()
): Promise<ListStateResult> {
	const stateFilePath = await resolveStateFilePath(cwd);
	const snapshot = await readState(stateFilePath);
	const { pruned } = await partitionStaleEntries(snapshot, nowMs);
	if (pruned.length === 0) return { workers: snapshot, pruned: [] };

	return withStateLock(async (current) => {
		const { live, pruned: prunedUnderLock } = await partitionStaleEntries(current, nowMs);
		return { entries: live, result: { workers: live, pruned: prunedUnderLock } };
	}, cwd);
}

/** {@link listStateWithPruneReport} without the prune report — the live worker list only. */
export async function listState(
	cwd: string = process.cwd(),
	nowMs: number = Date.now()
): Promise<SwarmWorkerEntry[]> {
	const { workers } = await listStateWithPruneReport(cwd, nowMs);
	return workers;
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
