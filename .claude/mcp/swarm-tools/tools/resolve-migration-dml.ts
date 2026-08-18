import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import { ghJson } from '../lib/gh';

const PR_BODY_ANCHOR =
	'<summary>Data migration — append to the end of the regenerated DDL migration before pushing to prod';
const SQL_FENCE_OPEN = '```sql';
const SQL_FENCE_CLOSE = '```';
const LOCAL_FILE_MARKER = '-- Hand-authored data migration';

export function extractSqlFromPrBody(body: string): string | null {
	const anchorIndex = body.indexOf(PR_BODY_ANCHOR);
	if (anchorIndex === -1) return null;
	const afterAnchor = body.slice(anchorIndex);
	const fenceStart = afterAnchor.indexOf(SQL_FENCE_OPEN);
	if (fenceStart === -1) return null;
	const afterFenceOpen = afterAnchor.slice(fenceStart + SQL_FENCE_OPEN.length);
	const fenceEnd = afterFenceOpen.indexOf(SQL_FENCE_CLOSE);
	if (fenceEnd === -1) return null;
	const sql = afterFenceOpen.slice(0, fenceEnd).trim();
	return sql || null;
}

export function extractSqlFromLocalFile(content: string): string | null {
	const markerIndex = content.indexOf(LOCAL_FILE_MARKER);
	if (markerIndex === -1) return null;
	const sql = content.slice(markerIndex).trim();
	return sql || null;
}

async function findMostRecentMigrationFile(worktreePath: string, branch: string): Promise<string | null> {
	const sanitizedBranch = branch.replace(/[^a-zA-Z0-9]/g, '_');
	const migrationsDir = path.join(worktreePath, 'supabase', 'migrations');
	let names: string[];
	try {
		names = await fs.readdir(migrationsDir);
	} catch {
		return null;
	}
	const matches = names.filter((name) => name.endsWith('.sql') && name.includes(sanitizedBranch));
	if (matches.length === 0) return null;
	const withMtime = await Promise.all(
		matches.map(async (name) => {
			const filePath = path.join(migrationsDir, name);
			const stats = await fs.stat(filePath);
			return { filePath, mtimeMs: stats.mtimeMs };
		})
	);
	withMtime.sort((a, b) => b.mtimeMs - a.mtimeMs);
	return withMtime[0].filePath;
}

export function registerResolveMigrationDmlTool(server: McpServer) {
	server.registerTool(
		'resolve_migration_dml',
		{
			description:
				'Extract hand-authored backfill DML for a db-migration branch: prefers the "Prod-ready migration SQL" section of the branch\'s PR body, falls back to the local migration file\'s hand-authored marker.',
			inputSchema: {
				branch: z.string(),
				worktreePath: z.string().optional(),
				prNumber: z.number().optional(),
			},
			outputSchema: {
				source: z.enum(['pr-body', 'local-file', 'none']),
				sql: z.string().optional(),
				filePath: z.string().optional(),
			},
		},
		async ({ branch, worktreePath, prNumber }) => {
			if (prNumber !== undefined) {
				const pr = await ghJson<{ body: string }>(['pr', 'view', String(prNumber), '--json', 'body']);
				const sql = extractSqlFromPrBody(pr.body ?? '');
				if (sql) {
					const structuredContent = { source: 'pr-body' as const, sql };
					return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
				}
			}

			if (worktreePath !== undefined) {
				const filePath = await findMostRecentMigrationFile(worktreePath, branch);
				if (filePath) {
					const content = await fs.readFile(filePath, 'utf8');
					const sql = extractSqlFromLocalFile(content);
					if (sql) {
						const structuredContent = { source: 'local-file' as const, sql, filePath };
						return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
					}
				}
			}

			const structuredContent = { source: 'none' as const };
			return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
		}
	);
}
