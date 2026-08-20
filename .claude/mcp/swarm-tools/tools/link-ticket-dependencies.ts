import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runGh, GhCommandError } from '../lib/gh';

/**
 * Builds the `gh issue edit ... --add-blocked-by` argv for a single call, or returns null when
 * there are no blockers to link (so the caller can skip `gh` entirely). Mirrors ticketify's
 * existing flag usage: one call with a comma-joined blocker list.
 */
export function buildAddBlockedByArgs(issueNumber: number, blockedBy: number[]): string[] | null {
	if (blockedBy.length === 0) return null;
	return ['issue', 'edit', String(issueNumber), '--add-blocked-by', blockedBy.join(',')];
}

export async function linkTicketDependencies(
	issueNumber: number,
	blockedBy: number[]
): Promise<{ ok: true; applied: number[] }> {
	const args = buildAddBlockedByArgs(issueNumber, blockedBy);
	if (args === null) return { ok: true, applied: [] };

	const result = await runGh(args);
	if (result.exitCode !== 0) throw new GhCommandError(args, result.stderr);

	return { ok: true, applied: blockedBy };
}

export function registerLinkTicketDependenciesTool(server: McpServer) {
	server.registerTool(
		'link_ticket_dependencies',
		{
			description:
				'Apply GitHub "blocked by" links to an issue in one call: runs `gh issue edit <issueNumber> --add-blocked-by <blocker#>[,...]` with the blockers comma-joined. An empty blocker list makes no `gh` call. Used by ticketify to wire up inter-ticket dependencies.',
			inputSchema: {
				issueNumber: z.number(),
				blockedBy: z.array(z.number()),
			},
			outputSchema: {
				ok: z.literal(true),
				applied: z.array(z.number()),
			},
		},
		async ({ issueNumber, blockedBy }) => {
			const structuredContent = await linkTicketDependencies(issueNumber, blockedBy);
			return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
		}
	);
}
