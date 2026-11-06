import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runGh, listLabelNames, GhCommandError } from '../lib/gh';

const EXCLUSIVE_LABEL_DESCRIPTIONS: Record<string, string> = {
	'db-migration':
		'Touches supabase/schema/ — swarm runs at most one exclusive-resource ticket at a time',
	'e2e-exclusive':
		'Touches a @mutates E2E spec\'s trigger path — swarm runs at most one exclusive-resource ticket at a time',
};

// Mirrors the canonical zone list in CLAUDE.md's "Repo zones" section — three top-level zones
// plus one per modules/<name>/ directory. A zod enum needs static literals, so this is the one
// place that can't just link to the doc: adding a new module means adding it here (both this map
// and the `zoneLabels` enum below) as well as to that table. GitHub caps a label description at
// 100 characters, so keep each string under that.
const ZONE_LABEL_DESCRIPTIONS: Record<string, string> = {
	'zone:app': 'Touches only app/ — safe to scope investigation/context to that subtree',
	'zone:supabase':
		'Touches only supabase/ (schema/scripts/tests) — safe to scope investigation/context to that subtree',
	'zone:agentic-tooling':
		'Touches only .claude/ (skills, MCP, hooks) — safe to scope investigation/context to that subtree',
	'zone:modules/stats':
		'Touches only modules/stats/ — safe to scope investigation/context to that subtree',
	'zone:modules/demon-import':
		'Touches only modules/demon-import/ — safe to scope investigation/context to that subtree',
	'zone:modules/ui-kit':
		'Touches only modules/ui-kit/ — safe to scope investigation/context to that subtree',
	'zone:modules/stats-view':
		'Touches only modules/stats-view/ — safe to scope investigation/context to that subtree',
};

async function ensureLabelsExist(labels: string[], cwd?: string): Promise<void> {
	const existing = new Set(await listLabelNames(cwd));
	for (const label of labels) {
		if (existing.has(label)) continue;
		const description = EXCLUSIVE_LABEL_DESCRIPTIONS[label] ?? ZONE_LABEL_DESCRIPTIONS[label];
		if (!description) continue; // ready/opus/sonnet/fable are expected to already exist in this repo
		const color = ZONE_LABEL_DESCRIPTIONS[label] ? '1d76db' : 'b60205';
		const result = await runGh(['label', 'create', label, '--color', color, '--description', description], {
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
				'Create a labelled GitHub issue: ensures the model + ready + any exclusive-resource/zone labels exist, creates the issue with the body piped over stdin (no shell-escaping/tempfile dance), and optionally links it as a sub-issue of a parent and/or blocked-by other issues.',
			inputSchema: {
				title: z.string(),
				body: z.string(),
				modelLabel: z.enum(['opus', 'sonnet', 'fable']),
				extraLabels: z.array(z.enum(['db-migration', 'e2e-exclusive'])).optional(),
				// Keep in step with ZONE_LABEL_DESCRIPTIONS above and CLAUDE.md's "Repo zones" table.
				zoneLabels: z
					.array(
						z.enum([
							'zone:app',
							'zone:supabase',
							'zone:agentic-tooling',
							'zone:modules/stats',
							'zone:modules/demon-import',
							'zone:modules/ui-kit',
							'zone:modules/stats-view',
						])
					)
					.min(1)
					.optional(),
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
		async ({ title, body, modelLabel, extraLabels = [], zoneLabels = [], parentIssue, blockedBy = [] }) => {
			const labels = [modelLabel, 'ready', ...extraLabels, ...zoneLabels];
			await ensureLabelsExist([...extraLabels, ...zoneLabels]);

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
