import { promises as fs } from 'fs';
import path from 'path';
import { execa } from 'execa';

/**
 * Shared filesystem-lock + atomic-write + main-checkout-root resolution primitives, extracted so
 * that every machine-local JSON state file under the main checkout's `.claude/` (the swarm
 * worker-array in `state-file.ts`, the migration marker in `migration-marker.ts`) acquires its
 * lock and persists its writes through *one* implementation. Duplicating the lock logic per file
 * is the failure mode this guards against — a divergence in how two files lock would let concurrent
 * worktrees clobber each other on whichever file lagged behind.
 */

const LOCK_RETRY_MS = 50;
const LOCK_TIMEOUT_MS = 5000;

/**
 * `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE` in the environment make git skip cwd-based repo
 * discovery entirely and operate on whatever repo those vars name — git itself sets `GIT_DIR`
 * when invoking hooks (e.g. this repo's `.husky/pre-push`), so a `git rev-parse` shelled out
 * during a pre-push run inherits it. Without stripping these, a caller passing an isolated
 * temp-repo `cwd` (as the tests do) still resolves to the *real* repo whenever this runs under a
 * git hook, silently escaping the isolation. `extendEnv: false` is required alongside this — execa's
 * default `extendEnv: true` re-merges the spawned process's env on top of whatever `env` object is
 * passed, which would otherwise silently reintroduce the very vars just deleted from our copy.
 */
export function envWithoutGitDiscoveryOverrides(): NodeJS.ProcessEnv {
	const env = { ...process.env };
	delete env.GIT_DIR;
	delete env.GIT_WORK_TREE;
	delete env.GIT_INDEX_FILE;
	return env;
}

/**
 * Every git worktree of this repo shares one common `.git` dir, so resolving via
 * `git rev-parse --git-common-dir` (rather than `process.cwd()` or this module's own on-disk
 * location) always lands on the *main* checkout — even if this server process happens to be
 * running with a worktree as its cwd. That's exactly what we want: the state/marker files live in
 * the main checkout's `.claude/` and are shared across every worktree. Cached per (cwd, process)
 * since it can't change during the server's lifetime.
 */
const mainCheckoutRootCache = new Map<string, Promise<string>>();

export async function resolveMainCheckoutRoot(cwd: string): Promise<string> {
	let cached = mainCheckoutRootCache.get(cwd);
	if (!cached) {
		cached = execa('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
			cwd,
			env: envWithoutGitDiscoveryOverrides(),
			extendEnv: false,
		}).then((result) => path.dirname(result.stdout.trim()));
		mainCheckoutRootCache.set(cwd, cached);
	}
	return cached;
}

export async function acquireLock(targetPath: string): Promise<string> {
	const lockPath = `${targetPath}.lock`;
	await fs.mkdir(path.dirname(targetPath), { recursive: true });
	const deadline = Date.now() + LOCK_TIMEOUT_MS;
	for (;;) {
		try {
			const handle = await fs.open(lockPath, 'wx');
			await handle.close();
			return lockPath;
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
			if (Date.now() > deadline) {
				throw new Error(`Timed out waiting for lock on ${targetPath}`);
			}
			await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
		}
	}
}

export async function releaseLock(lockPath: string): Promise<void> {
	await fs.rm(lockPath, { force: true });
}

/** Writes `contents` to `targetPath` via a process-unique tmp file + atomic rename (never a torn read). */
export async function atomicWriteFile(targetPath: string, contents: string): Promise<void> {
	await fs.mkdir(path.dirname(targetPath), { recursive: true });
	// Process-unique tmp filename: concurrent writers must never share one tmp path.
	const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
	await fs.writeFile(tmpPath, contents, 'utf8');
	await fs.rename(tmpPath, targetPath);
}

/** Reads `targetPath`, or `null` if it doesn't exist / is blank. Any other read error propagates. */
export async function readFileOrNull(targetPath: string): Promise<string | null> {
	let raw: string;
	try {
		raw = await fs.readFile(targetPath, 'utf8');
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
		throw err;
	}
	return raw.trim() ? raw : null;
}

/**
 * Locked read-modify-write over a single JSON file. Holds the filesystem lock for the whole
 * `parse → mutate → serialize → atomic-write` cycle, so concurrent worktrees mutating the same file
 * never lose an update to each other. `parse` receives the raw file contents (or `null` when the
 * file is absent/blank) and returns the current state; `mutate` returns the next state plus a result
 * to hand back to the caller. `serialize` turns the next state back into the on-disk string.
 */
export async function withLockedJsonFile<State, Result>(
	targetPath: string,
	options: {
		parse: (raw: string | null) => State;
		serialize: (state: State) => string;
		mutate: (state: State) => { state: State; result: Result } | Promise<{ state: State; result: Result }>;
	}
): Promise<Result> {
	const lockPath = await acquireLock(targetPath);
	try {
		const current = options.parse(await readFileOrNull(targetPath));
		const { state, result } = await options.mutate(current);
		await atomicWriteFile(targetPath, options.serialize(state));
		return result;
	} finally {
		await releaseLock(lockPath);
	}
}
