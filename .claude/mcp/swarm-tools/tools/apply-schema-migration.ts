import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import { runNpm } from '../lib/npm';
import { listWorktrees } from '../lib/git';

export type ApplyStatus = 'applied' | 'history-mismatch' | 'error';

/**
 * The known `supabase db schema declarative sync` failure that means the shared local Postgres
 * instance has a migration applied whose file lives only in *another* worktree's gitignored
 * migrations directory. Matched case-insensitively so a phrasing tweak in the CLI still classifies.
 */
const HISTORY_MISMATCH_SIGNATURE = 'remote migration versions not found';

/** Supabase migration versions are 14-digit timestamps (YYYYMMDDHHMMSS), the filename prefix. */
const MIGRATION_VERSION_PATTERN = /\b\d{14}\b/g;

export function classifyApplyExit(result: { exitCode: number; stdout: string; stderr: string }): ApplyStatus {
	if (result.exitCode === 0) return 'applied';
	const haystack = `${result.stdout}\n${result.stderr}`.toLowerCase();
	if (haystack.includes(HISTORY_MISMATCH_SIGNATURE)) return 'history-mismatch';
	return 'error';
}

/** Pull the 14-digit migration versions the CLI reported as missing out of its output. */
export function parseMissingMigrationVersions(text: string): string[] {
	const matches = text.match(MIGRATION_VERSION_PATTERN);
	if (!matches) return [];
	return Array.from(new Set(matches));
}

/**
 * Given the migration filenames present in each worktree, return the path of the worktree that
 * holds a file for one of the missing versions (the colliding in-progress migration). Undefined
 * when none matches — e.g. the other worktree was already cleaned up.
 */
export function findConflictingWorktree(
	missingVersions: string[],
	worktreeMigrations: { path: string; files: string[] }[]
): string | undefined {
	for (const { path: worktreePath, files } of worktreeMigrations) {
		const hasCollision = files.some((file) =>
			missingVersions.some((version) => file.startsWith(version))
		);
		if (hasCollision) return worktreePath;
	}
	return undefined;
}

async function readMigrationFilenames(worktreePath: string): Promise<string[]> {
	const migrationsDir = path.join(worktreePath, 'supabase', 'migrations');
	try {
		const names = await fs.readdir(migrationsDir);
		return names.filter((name) => name.endsWith('.sql'));
	} catch {
		return [];
	}
}

async function locateConflictingWorktree(cwd: string, stderr: string, stdout: string): Promise<string | undefined> {
	const missingVersions = parseMissingMigrationVersions(`${stdout}\n${stderr}`);
	if (missingVersions.length === 0) return undefined;
	const worktrees = await listWorktrees(cwd);
	const worktreeMigrations = await Promise.all(
		worktrees.map(async ({ path: worktreePath }) => ({
			path: worktreePath,
			files: await readMigrationFilenames(worktreePath),
		}))
	);
	return findConflictingWorktree(missingVersions, worktreeMigrations);
}

export function registerApplySchemaMigrationTool(server: McpServer) {
	server.registerTool(
		'apply_schema_migration',
		{
			description:
				'Run `npm run db:schema:apply` in a worktree and classify the outcome. status "applied" on success; "history-mismatch" (with conflictingWorktree, when found) when the shared local Postgres has another worktree\'s in-progress migration applied; "error" for any other failure. Wraps take-over step 11\'s outer apply + mismatch detection only — never the destructive reconciliation.',
			inputSchema: {
				cwd: z.string(),
			},
			outputSchema: {
				status: z.enum(['applied', 'history-mismatch', 'error']),
				stdout: z.string(),
				stderr: z.string(),
				conflictingWorktree: z.string().optional(),
			},
		},
		async ({ cwd }) => {
			const result = await runNpm(['run', 'db:schema:apply'], cwd);
			const status = classifyApplyExit(result);

			let conflictingWorktree: string | undefined;
			if (status === 'history-mismatch') {
				conflictingWorktree = await locateConflictingWorktree(cwd, result.stderr, result.stdout);
			}

			const structuredContent = {
				status,
				stdout: result.stdout,
				stderr: result.stderr,
				...(conflictingWorktree !== undefined ? { conflictingWorktree } : {}),
			};
			return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
		}
	);
}
