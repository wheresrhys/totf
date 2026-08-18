import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { listState, type SwarmWorkerEntry } from '../lib/state-file';
import { listBranches, listWorktrees } from '../lib/git';
import { ghJson } from '../lib/gh';

export interface WorkItemMatch {
	source: 'state-file' | 'git' | 'gh-search';
	agentId?: string;
	kind?: SwarmWorkerEntry['kind'];
	issue?: number | null;
	pr?: number | null;
	branch: string;
	title?: string;
	worktreePath?: string;
}

export function parseNumericIdentifier(identifier: string): number | null {
	const match = identifier.trim().match(/^#?(\d+)$/);
	return match ? Number(match[1]) : null;
}

/** Numbers and branch/ref-shaped strings (no spaces) are not paraphrases worth a gh search. */
export function looksLikeParaphrase(identifier: string): boolean {
	if (!identifier.trim()) return false;
	if (parseNumericIdentifier(identifier) !== null) return false;
	return !/^[a-zA-Z0-9._/-]+$/.test(identifier);
}

function toMatch(entry: SwarmWorkerEntry): WorkItemMatch {
	return {
		source: 'state-file',
		agentId: entry.agentId,
		kind: entry.kind,
		issue: entry.issue,
		pr: entry.pr,
		branch: entry.branch,
		title: entry.title,
		worktreePath: entry.worktreePath,
	};
}

/**
 * The 4 state-file strategies from take-over step 1, tried in order. Returns the first
 * strategy that finds at least one match (not necessarily exactly one — an ambiguous match
 * within the first hitting strategy is still returned, for the caller to disambiguate, rather
 * than silently falling through to a looser strategy).
 */
export function matchStateFileStrategies(
	entries: SwarmWorkerEntry[],
	identifier: string
): { strategy: string; entries: SwarmWorkerEntry[] } | null {
	const exactBranch = entries.filter((entry) => entry.branch === identifier);
	if (exactBranch.length > 0) return { strategy: 'exact-branch', entries: exactBranch };

	const asNumber = parseNumericIdentifier(identifier);
	if (asNumber !== null) {
		const byNumber = entries.filter((entry) => entry.issue === asNumber || entry.pr === asNumber);
		if (byNumber.length > 0) return { strategy: 'issue-or-pr-number', entries: byNumber };
	}

	const byAgentId = entries.filter((entry) => entry.agentId === identifier);
	if (byAgentId.length > 0) return { strategy: 'agent-id', entries: byAgentId };

	const needle = identifier.toLowerCase();
	const byTitle = entries.filter((entry) => entry.title.toLowerCase().includes(needle));
	if (byTitle.length > 0) return { strategy: 'title-substring', entries: byTitle };

	return null;
}

function branchPatternMatches(branches: string[], issueNumber: number): string[] {
	const prefix = `feature/${issueNumber}-`;
	return branches.filter((branch) => branch === prefix.slice(0, -1) || branch.startsWith(prefix));
}

export function registerResolveWorkItemTool(server: McpServer) {
	server.registerTool(
		'resolve_work_item',
		{
			description:
				"Resolve a branch name, issue/PR number, agent id, or title paraphrase to the worker doing that work — take-over's identifier resolution in one call.",
			inputSchema: {
				identifier: z.string(),
			},
			outputSchema: {
				matches: z.array(
					z.object({
						source: z.enum(['state-file', 'git', 'gh-search']),
						agentId: z.string().optional(),
						kind: z.enum(['ticket', 'maintenance']).optional(),
						issue: z.number().nullable().optional(),
						pr: z.number().nullable().optional(),
						branch: z.string(),
						title: z.string().optional(),
						worktreePath: z.string().optional(),
					})
				),
				strategyUsed: z.string(),
			},
		},
		async ({ identifier }) => {
			const entries = await listState();

			const stateMatch = matchStateFileStrategies(entries, identifier);
			if (stateMatch) {
				const structuredContent = { matches: stateMatch.entries.map(toMatch), strategyUsed: stateMatch.strategy };
				return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
			}

			const branches = await listBranches();
			const worktrees = await listWorktrees();

			if (branches.includes(identifier)) {
				const worktree = worktrees.find((wt) => wt.branch === identifier);
				const structuredContent = {
					matches: [{ source: 'git' as const, branch: identifier, worktreePath: worktree?.path }],
					strategyUsed: 'exact-branch-git',
				};
				return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
			}

			let candidateIssue: { number: number; title: string } | null = null;
			if (looksLikeParaphrase(identifier)) {
				const searchResults = await ghJson<{ number: number; title: string }[]>([
					'issue',
					'list',
					'--search',
					identifier,
					'--state',
					'open',
					'--json',
					'number,title',
				]);
				for (const result of searchResults) {
					const byNumber = entries.filter((entry) => entry.issue === result.number || entry.pr === result.number);
					if (byNumber.length > 0) {
						const structuredContent = { matches: byNumber.map(toMatch), strategyUsed: 'gh-search+issue-number' };
						return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
					}
				}
				candidateIssue = searchResults[0] ?? null;
			} else {
				const asNumber = parseNumericIdentifier(identifier);
				if (asNumber !== null) candidateIssue = { number: asNumber, title: '' };
			}

			if (candidateIssue) {
				const candidateBranches = branchPatternMatches(branches, candidateIssue.number);
				if (candidateBranches.length > 0) {
					const matches: WorkItemMatch[] = candidateBranches.map((branch) => ({
						source: 'gh-search' as const,
						branch,
						issue: candidateIssue!.number,
						title: candidateIssue!.title || undefined,
						worktreePath: worktrees.find((wt) => wt.branch === branch)?.path,
					}));
					const structuredContent = { matches, strategyUsed: 'branch-pattern-fallback' };
					return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
				}
			}

			const structuredContent = { matches: [], strategyUsed: 'none' };
			return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
		}
	);
}
