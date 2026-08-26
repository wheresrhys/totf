import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
	withStateLock,
	listStateWithPruneReport,
	swarmWorkerEntrySchema,
	prunedEntrySchema,
	type SwarmWorkerEntry,
	type ListStateResult,
} from '../lib/state-file';

export interface WorkerFilter {
	kind?: 'ticket' | 'maintenance';
	issue?: number;
	pr?: number;
	branch?: string;
}

/**
 * Self-healing worker list: reads through `listStateWithPruneReport` (so any dead entries are
 * pruned on this call), applies the caller's filter to the surviving `workers`, and passes the
 * full `pruned` report straight through unfiltered — a prune is about what was dropped from state
 * regardless of the query's kind/issue/pr/branch narrowing, so the orchestrator always sees it.
 */
export async function listWorkersWithPrune(filter: WorkerFilter): Promise<ListStateResult> {
	const { workers, pruned } = await listStateWithPruneReport();
	const filtered = workers.filter(
		(entry) =>
			(filter.kind === undefined || entry.kind === filter.kind) &&
			(filter.issue === undefined || entry.issue === filter.issue) &&
			(filter.pr === undefined || entry.pr === filter.pr) &&
			(filter.branch === undefined || entry.branch === filter.branch)
	);
	return { workers: filtered, pruned };
}

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
				pruned: z.array(prunedEntrySchema),
			},
		},
		async ({ kind, issue, pr, branch }) => {
			const structuredContent = await listWorkersWithPrune({ kind, issue, pr, branch });
			return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
		}
	);
}
