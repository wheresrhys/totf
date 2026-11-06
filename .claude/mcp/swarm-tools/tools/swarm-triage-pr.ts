import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ghJson } from '../lib/gh';
import {
	findOutstandingReviews,
	findOutstandingInlineThreads,
	findOutstandingIssueComments,
	type MaintenanceCandidate,
	type ReviewLike,
	type InlineCommentLike,
	type IssueCommentLike,
} from './swarm-plan-batch';

/** `findMaintenanceCandidates`' reason vocabulary plus the `'none'` a single-PR triage can report. */
export type TriageReason = MaintenanceCandidate['reason'] | 'none';

// A type alias, not an interface: `registerTool`'s handler requires the structuredContent type to
// satisfy `{ [x: string]: unknown }`, and only an alias gets TypeScript's implicit index signature.
export type TriagePrResult = {
	number: number;
	headRefName: string;
	hasConflict: boolean;
	outstandingReviews: ReviewLike[];
	outstandingInlineThreads: InlineCommentLike[][];
	outstandingIssueComments: IssueCommentLike[];
	reason: TriageReason;
};

interface GhPrViewItem {
	number: number;
	headRefName: string;
	mergeable: string;
	reviews: ReviewLike[];
	commits: { committedDate: string }[];
}

/**
 * Full maintenance picture for one PR: conflict status plus the *content* of every outstanding
 * review, inline-comment thread and top-level issue comment, run through the same filters
 * `findMaintenanceCandidates` uses to decide whether a PR needs maintenance at all.
 *
 * Deliberately not gated on `SWARM_CREATED_PR_MARKER`: that gate guards the *automatic* scan in
 * `swarm_plan_batch`, whereas triage is only ever reached by naming a PR explicitly — the
 * user-directed path that marker's docs call out as exempt. Also deliberately non-short-circuiting
 * (unlike `findMaintenanceCandidates`, which stops at the first signal): the caller needs all
 * three categories, so all three sources are always fetched.
 */
export async function triagePr(prNumber: number): Promise<TriagePrResult> {
	const pr = await ghJson<GhPrViewItem>([
		'pr',
		'view',
		String(prNumber),
		'--json',
		'number,headRefName,mergeable,reviews,commits',
	]);
	const headCommitDate = pr.commits.at(-1)?.committedDate ?? '';

	const [inlineComments, issueComments] = await Promise.all([
		ghJson<InlineCommentLike[]>(['api', `repos/{owner}/{repo}/pulls/${prNumber}/comments`]).catch(() => []),
		ghJson<IssueCommentLike[]>(['api', `repos/{owner}/{repo}/issues/${prNumber}/comments`]).catch(() => []),
	]);

	const outstandingReviews = findOutstandingReviews(pr.reviews ?? [], headCommitDate);
	const outstandingInlineThreads = findOutstandingInlineThreads(inlineComments, headCommitDate);
	const outstandingIssueComments = findOutstandingIssueComments(issueComments, headCommitDate);

	const hasConflict = pr.mergeable === 'CONFLICTING';
	const hasFeedback =
		outstandingReviews.length > 0 || outstandingInlineThreads.length > 0 || outstandingIssueComments.length > 0;
	const reason: TriageReason =
		hasConflict && hasFeedback ? 'conflict+feedback' : hasConflict ? 'conflict' : hasFeedback ? 'feedback' : 'none';

	return {
		number: pr.number,
		headRefName: pr.headRefName,
		hasConflict,
		outstandingReviews,
		outstandingInlineThreads,
		outstandingIssueComments,
		reason,
	};
}

const reviewSchema = z.object({
	author: z.object({ login: z.string().optional() }).optional(),
	state: z.string().optional(),
	body: z.string().optional(),
	submittedAt: z.string().optional(),
});

const inlineCommentSchema = z.object({
	id: z.number().optional(),
	in_reply_to_id: z.number().optional(),
	user: z.object({ login: z.string().optional() }).optional(),
	body: z.string().optional(),
	created_at: z.string().optional(),
});

const issueCommentSchema = z.object({
	user: z.object({ login: z.string().optional() }).optional(),
	body: z.string().optional(),
	created_at: z.string().optional(),
});

export function registerSwarmTriagePrTool(server: McpServer) {
	server.registerTool(
		'swarm_triage_pr',
		{
			description:
				"Everything a swarm PR-maintenance worker needs about one PR, in one call: whether it has a merge conflict, and the full content (not just a yes/no) of every outstanding review, inline-comment thread and top-level issue comment — already filtered through the same bot-login / mermaid-diff / swarm-worker-reply-marker / head-commit-date rules swarm_plan_batch applies when deciding a PR needs maintenance, so what comes back is the work still to address rather than raw API output to re-derive it from. `reason` matches swarm_plan_batch's vocabulary ('conflict' | 'feedback' | 'conflict+feedback'), plus 'none' when the PR needs nothing. Each entry of outstandingInlineThreads is a whole comment thread (grouped by in_reply_to_id), in fetch order, so a reply can be targeted at the right comment id. Unlike swarm_plan_batch's automatic scan this is not gated on the <!-- swarm-created-pr --> marker — naming a PR here is the user-directed path that gate exempts.",
			inputSchema: {
				prNumber: z.number(),
			},
			outputSchema: {
				number: z.number(),
				headRefName: z.string(),
				hasConflict: z.boolean(),
				outstandingReviews: z.array(reviewSchema),
				outstandingInlineThreads: z.array(z.array(inlineCommentSchema)),
				outstandingIssueComments: z.array(issueCommentSchema),
				reason: z.enum(['conflict', 'feedback', 'conflict+feedback', 'none']),
			},
		},
		async ({ prNumber }) => {
			const structuredContent = await triagePr(prNumber);
			return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
		}
	);
}
