import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { slugify } from '../../../../lib/slugify';
import { listBranches } from '../lib/git';

const MAX_SLUG_WORDS = 5;

export function deriveTicketSlug(title: string): string {
	return slugify(title).split('-').filter(Boolean).slice(0, MAX_SLUG_WORDS).join('-');
}

export function buildBranchName(issueNumber: number, slug: string, chainSuffix?: string): string {
	const base = `feature/${issueNumber}-${slug}`;
	return chainSuffix ? `${base}/${chainSuffix}` : base;
}

export function registerDeriveBranchNameTool(server: McpServer) {
	server.registerTool(
		'derive_branch_name',
		{
			description:
				'Derive the ticket branch name (feature/<issue>-<slug>[/<chainSuffix>]) from an issue number and title, and check for a collision against existing branches.',
			inputSchema: {
				issueNumber: z.number(),
				title: z.string(),
				chainSuffix: z.string().optional(),
			},
			outputSchema: {
				slug: z.string(),
				branch: z.string(),
				collision: z.boolean(),
				collidingRef: z.string().optional(),
			},
		},
		async ({ issueNumber, title, chainSuffix }) => {
			const slug = deriveTicketSlug(title);
			const branch = buildBranchName(issueNumber, slug, chainSuffix);
			const branches = await listBranches();
			const collidingRef = branches.find((existing) => existing === branch);
			const structuredContent = {
				slug,
				branch,
				collision: Boolean(collidingRef),
				collidingRef,
			};
			return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
		}
	);
}
