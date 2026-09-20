import { promises as fs, constants as fsConstants } from 'fs';
import path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { resolveMainCheckoutRoot } from '../lib/locked-json-file';

/**
 * A freshly created git worktree (`git worktree add`, or the Agent tool's `isolation: "worktree"`)
 * never has `.env.dev` — it's gitignored, so worktree creation doesn't carry it over — and without
 * it `npm run qa` / the pre-push hook fail with `SUPABASE_JWT_ROLE environment variable is not
 * set`. This used to be prose in `.claude/skills/swarm/SKILL.md` telling a spawned worker to `cp`
 * it manually from the main checkout; a worker sometimes skipped or mis-executed that step, so the
 * copy now lives here instead, where it's guaranteed rather than a shell recipe a worker can forget.
 */

export type EnsureWorktreeEnvStatus =
	| 'copied'
	| 'already-present'
	| 'same-as-source'
	| 'source-missing';

export interface EnsureWorktreeEnvResult {
	status: EnsureWorktreeEnvStatus;
	/** `.env.dev` in the main checkout root, resolved via `resolveMainCheckoutRoot`. */
	sourcePath: string;
	/** `.env.dev` inside the worktree this call was asked to provision. */
	destPath: string;
}

async function fileExists(targetPath: string): Promise<boolean> {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Realpath-resolved equality: `resolveMainCheckoutRoot` returns whatever `git rev-parse
 * --path-format=absolute` prints, which git resolves through any symlink in the path (e.g. macOS's
 * `/tmp` → `/private/tmp`), while a caller-supplied `worktreePath` may not be. A plain string/`path
 * .resolve` comparison of the two would then see the main checkout and the worktree itself as
 * different paths even when they're the same directory. Falls back to the un-resolved path if
 * `realpath` fails (e.g. the directory doesn't exist), so a genuine `source-missing`/`copied` case
 * still proceeds rather than throwing here.
 */
async function isSamePath(a: string, b: string): Promise<boolean> {
	const [realA, realB] = await Promise.all([
		fs.realpath(a).catch(() => path.resolve(a)),
		fs.realpath(b).catch(() => path.resolve(b))
	]);
	return realA === realB;
}

/**
 * Copies `.env.dev` from the main checkout root into `worktreePath`, no-clobber — matching the
 * prose's `cp -n` semantics — so a *reused* worktree that already has one (possibly with different
 * local state) is never overwritten. The main checkout root resolves the same way every other
 * machine-local-state file in this package does (`resolveMainCheckoutRoot`, i.e. `git rev-parse
 * --path-format=absolute --git-common-dir`'s parent directory). Called from the *main* checkout
 * itself, that resolves to `worktreePath` too, so source and dest coincide — handled explicitly as
 * `same-as-source` rather than left to throw or silently no-op inside `copyFile`.
 */
export async function ensureWorktreeEnv(
	worktreePath: string
): Promise<EnsureWorktreeEnvResult> {
	const mainRoot = await resolveMainCheckoutRoot(worktreePath);
	const sourcePath = path.join(mainRoot, '.env.dev');
	const destPath = path.join(worktreePath, '.env.dev');

	if (await isSamePath(worktreePath, mainRoot)) {
		return { status: 'same-as-source', sourcePath, destPath };
	}

	if (!(await fileExists(sourcePath))) {
		return { status: 'source-missing', sourcePath, destPath };
	}

	try {
		// COPYFILE_EXCL makes the no-clobber check atomic (no separate exists-then-copy race between
		// sibling worktrees provisioning the same shared main checkout's .env.dev concurrently).
		await fs.copyFile(sourcePath, destPath, fsConstants.COPYFILE_EXCL);
		return { status: 'copied', sourcePath, destPath };
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
			return { status: 'already-present', sourcePath, destPath };
		}
		throw err;
	}
}

export function registerEnsureWorktreeEnvTool(server: McpServer) {
	server.registerTool(
		'ensure_worktree_env',
		{
			description:
				"Copy .env.dev from the main checkout root into a git worktree, no-clobber, before any tests run there. A freshly created worktree (git worktree add, or the Agent tool's isolation: \"worktree\") never has .env.dev — it's gitignored — and without it npm run qa / the pre-push hook fail with `SUPABASE_JWT_ROLE environment variable is not set`. status: 'copied' (did the copy), 'already-present' (worktree already had one — left untouched), 'same-as-source' (called against the main checkout itself, where source and dest are the same path — a safe no-op), 'source-missing' (the main checkout has no .env.dev either — nothing to copy; let the caller's own qa/test run surface that).",
			inputSchema: {
				worktreePath: z.string()
			},
			outputSchema: {
				status: z.enum([
					'copied',
					'already-present',
					'same-as-source',
					'source-missing'
				]),
				sourcePath: z.string(),
				destPath: z.string()
			}
		},
		async ({ worktreePath }) => {
			const structuredContent = await ensureWorktreeEnv(worktreePath);
			// Spread into a fresh object literal: the SDK types `structuredContent` as an
			// index-signatured `{ [x: string]: unknown }`, which a named interface
			// (`EnsureWorktreeEnvResult`) is not assignable to, but an object-literal type is.
			return {
				content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
				structuredContent: { ...structuredContent }
			};
		}
	);
}
