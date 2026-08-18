import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { withStateLock, listState, type SwarmWorkerEntry } from '../lib/state-file';

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

export function registerSwarmStateTools(server: McpServer) {
	server.registerTool(
		'swarm_state_append',
		{
			description:
				'Atomically append one worker entry to .claude/swarm-state.json. Always use this instead of hand-writing the file with jq — this tool holds a filesystem lock so concurrent worktrees never lose an update to each other.',
			inputSchema: {
				kind: z.enum(['ticket', 'maintenance']),
				issue: z.number().nullable().optional(),
				pr: z.number().nullable().optional(),
				branch: z.string(),
				title: z.string(),
				worktreePath: z.string(),
				agentId: z.string(),
				model: z.string(),
				startedAt: z.string().optional(),
			},
			outputSchema: {
				ok: z.literal(true),
				entry: swarmWorkerEntrySchema,
			},
		},
		async (input) => {
			const entry: SwarmWorkerEntry = {
				kind: input.kind,
				issue: input.issue ?? null,
				pr: input.pr ?? null,
				branch: input.branch,
				title: input.title,
				worktreePath: input.worktreePath,
				agentId: input.agentId,
				model: input.model,
				startedAt: input.startedAt ?? new Date().toISOString(),
			};
			await withStateLock((entries) => ({ entries: [...entries, entry], result: undefined }));
			const structuredContent = { ok: true as const, entry };
			return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
		}
	);

	server.registerTool(
		'swarm_state_remove',
		{
			description:
				'Atomically remove a worker entry from .claude/swarm-state.json by agentId. Always use this instead of hand-writing the file with jq.',
			inputSchema: {
				agentId: z.string(),
			},
			outputSchema: {
				ok: z.literal(true),
				removed: z.boolean(),
				entry: swarmWorkerEntrySchema.optional(),
			},
		},
		async ({ agentId }) => {
			const removedEntry = await withStateLock((entries) => {
				const match = entries.find((entry) => entry.agentId === agentId);
				const remaining = entries.filter((entry) => entry.agentId !== agentId);
				return { entries: remaining, result: match };
			});
			const structuredContent = { ok: true as const, removed: Boolean(removedEntry), entry: removedEntry };
			return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
		}
	);

	server.registerTool(
		'swarm_state_list',
		{
			description: 'List worker entries from .claude/swarm-state.json, optionally filtered by kind/issue/pr/branch.',
			inputSchema: {
				kind: z.enum(['ticket', 'maintenance']).optional(),
				issue: z.number().optional(),
				pr: z.number().optional(),
				branch: z.string().optional(),
			},
			outputSchema: {
				workers: z.array(swarmWorkerEntrySchema),
			},
		},
		async ({ kind, issue, pr, branch }) => {
			const entries = await listState();
			const filtered = entries.filter(
				(entry) =>
					(kind === undefined || entry.kind === kind) &&
					(issue === undefined || entry.issue === issue) &&
					(pr === undefined || entry.pr === pr) &&
					(branch === undefined || entry.branch === branch)
			);
			const structuredContent = { workers: filtered };
			return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
		}
	);
}
