import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runGh, listLabelNames, GhCommandError } from '../lib/gh';

const EXCLUSIVE_LABEL_DESCRIPTIONS: Record<string, string> = {
	'db-migration':
		'Touches supabase/schema/ — swarm runs at most one exclusive-resource ticket at a time',
	'e2e-exclusive':
		'Touches a @mutates E2E spec\'s trigger path — swarm runs at most one exclusive-resource ticket at a time',
};

async function ensureLabelsExist(labels: string[], cwd?: string): Promise<void> {
	const existing = new Set(await listLabelNames(cwd));
	for (const label of labels) {
		if (existing.has(label)) continue;
		const description = EXCLUSIVE_LABEL_DESCRIPTIONS[label];
		if (!description) continue; // ready/opus/sonnet/fable are expected to already exist in this repo
		const result = await runGh(['label', 'create', label, '--color', 'b60205', '--description', description], {
			cwd,
		});
		if (result.exitCode !== 0) throw new GhCommandError(['label', 'create', label], result.stderr);
	}
}

function parseIssueNumberFromUrl(url: string): number {
	const match = url.trim().match(/\/issues\/(\d+)\s*$/);
	if (!match) throw new Error(`Could not parse issue number from gh issue create output: ${url}`);
	return Number(match[1]);
}

export function registerCreateTicketTool(server: McpServer) {
	server.registerTool(
		'create_ticket',
		{
			description:
				'Create a labelled GitHub issue: ensures the model + ready + any exclusive-resource labels exist, creates the issue with the body piped over stdin (no shell-escaping/tempfile dance), and optionally links it as a sub-issue of a parent and/or blocked-by other issues.',
			inputSchema: {
				title: z.string(),
				body: z.string(),
				modelLabel: z.enum(['opus', 'sonnet', 'fable']),
				extraLabels: z.array(z.enum(['db-migration', 'e2e-exclusive'])).optional(),
				parentIssue: z.number().optional(),
				blockedBy: z.array(z.number()).optional(),
			},
			outputSchema: {
				issueNumber: z.number(),
				url: z.string(),
				labelsApplied: z.array(z.string()),
				subIssueLinked: z.boolean(),
				blockedByApplied: z.array(z.number()),
			},
		},
		async ({ title, body, modelLabel, extraLabels = [], parentIssue, blockedBy = [] }) => {
			const labels = [modelLabel, 'ready', ...extraLabels];
			await ensureLabelsExist(extraLabels);

			const args = ['issue', 'create', '--title', title, '--body-file', '-'];
			for (const label of labels) args.push('--label', label);
			if (parentIssue !== undefined) args.push('--parent', String(parentIssue));
			if (blockedBy.length > 0) args.push('--blocked-by', blockedBy.join(','));

			const result = await runGh(args, { input: body });
			if (result.exitCode !== 0) throw new GhCommandError(args, result.stderr);

			const url = result.stdout.trim();
			const issueNumber = parseIssueNumberFromUrl(url);

			const structuredContent = {
				issueNumber,
				url,
				labelsApplied: labels,
				subIssueLinked: parentIssue !== undefined,
				blockedByApplied: blockedBy,
			};
			return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
		}
	);
}
