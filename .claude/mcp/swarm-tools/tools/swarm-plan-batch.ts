import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { listState } from '../lib/state-file';
import { listBranches } from '../lib/git';
import { ghJson } from '../lib/gh';

export const EXCLUSIVE_LABELS = ['db-migration', 'e2e-exclusive'] as const;
export type ExclusiveLabel = (typeof EXCLUSIVE_LABELS)[number];
export const MODEL_LABELS = ['opus', 'sonnet', 'fable'] as const;
export type ModelLabel = (typeof MODEL_LABELS)[number];

export function getExclusiveLabel(labels: string[]): ExclusiveLabel | undefined {
	return labels.find((label): label is ExclusiveLabel => (EXCLUSIVE_LABELS as readonly string[]).includes(label));
}

export function getModelLabel(labels: string[]): ModelLabel | null {
	return labels.find((label): label is ModelLabel => (MODEL_LABELS as readonly string[]).includes(label)) ?? null;
}

function isBotLogin(login: string | undefined): boolean {
	return Boolean(login?.toLowerCase().endsWith('[bot]'));
}

function isMermaidDiffComment(body: string | undefined): boolean {
	return Boolean(body?.includes('```mermaid'));
}

interface ReviewLike {
	author?: { login?: string };
	state?: string;
	body?: string;
	submittedAt?: string;
}

/** CHANGES_REQUESTED always counts; otherwise a non-empty human review newer than the head commit does. */
export function hasOutstandingReviewFeedback(reviews: ReviewLike[], headCommitDate: string): boolean {
	return reviews.some((review) => {
		if (isBotLogin(review.author?.login)) return false;
		if (review.state === 'CHANGES_REQUESTED') return true;
		if (!review.body || isMermaidDiffComment(review.body)) return false;
		return Boolean(review.submittedAt && review.submittedAt > headCommitDate);
	});
}

interface InlineCommentLike {
	id?: number;
	in_reply_to_id?: number;
	user?: { login?: string };
	body?: string;
	created_at?: string;
}

/**
 * Groups inline review comments into threads (by in_reply_to_id, falling back to the comment's
 * own id for a thread root) and flags a thread as outstanding if its most recent comment is
 * human-authored, not a mermaid-diff comment, and newer than the PR's head commit — i.e. nobody
 * has posted anything since, human or otherwise.
 */
export function hasOutstandingInlineFeedback(comments: InlineCommentLike[], headCommitDate: string): boolean {
	const threads = new Map<number, InlineCommentLike[]>();
	for (const comment of comments) {
		const rootId = comment.in_reply_to_id ?? comment.id ?? -1;
		const thread = threads.get(rootId) ?? [];
		thread.push(comment);
		threads.set(rootId, thread);
	}
	for (const thread of threads.values()) {
		const latest = thread.reduce((a, b) => ((a.created_at ?? '') > (b.created_at ?? '') ? a : b));
		if (isBotLogin(latest.user?.login)) continue;
		if (isMermaidDiffComment(latest.body)) continue;
		if (latest.created_at && latest.created_at > headCommitDate) return true;
	}
	return false;
}

export interface MaintenanceCandidate {
	number: number;
	title: string;
	headRefName: string;
	labels: string[];
	reason: 'conflict' | 'feedback' | 'conflict+feedback';
}

export interface TicketCandidate {
	number: number;
	title: string;
	labels: string[];
	model: ModelLabel;
	blockingCount: number;
}

export function rankMaintenanceCandidates(candidates: MaintenanceCandidate[]): MaintenanceCandidate[] {
	return [...candidates].sort((a, b) => a.number - b.number);
}

export function rankTicketCandidates(candidates: TicketCandidate[]): TicketCandidate[] {
	return [...candidates].sort((a, b) => b.blockingCount - a.blockingCount || a.number - b.number);
}

export interface AllocationResult {
	maintenance: MaintenanceCandidate[];
	tickets: TicketCandidate[];
	soloRunStarted: ExclusiveLabel | null;
}

/**
 * Sequential allocator implementing swarm's solo-run rule: an exclusive-resource-labelled item
 * can only be picked if nothing else has been picked yet this pass, and once picked, nothing
 * else is picked this pass either. Maintenance is allocated before tickets. Assumes candidates
 * are pre-ranked and pre-filtered for eligibility (unblocked, not in-flight, etc).
 */
export function allocateBudget(
	freeSlots: number,
	soloRunAlreadyActive: boolean,
	rankedMaintenance: MaintenanceCandidate[],
	rankedTickets: TicketCandidate[]
): AllocationResult {
	const maintenance: MaintenanceCandidate[] = [];
	const tickets: TicketCandidate[] = [];
	let slots = freeSlots;
	let anyPickedThisPass = false;
	let exclusiveActive = soloRunAlreadyActive;
	let soloRunStarted: ExclusiveLabel | null = null;

	if (!exclusiveActive) {
		for (const pr of rankedMaintenance) {
			if (slots <= 0) break;
			const exclusiveLabel = getExclusiveLabel(pr.labels);
			if (exclusiveLabel && anyPickedThisPass) continue;
			maintenance.push(pr);
			slots--;
			anyPickedThisPass = true;
			if (exclusiveLabel) {
				exclusiveActive = true;
				soloRunStarted = exclusiveLabel;
				break;
			}
		}
	}

	if (!exclusiveActive) {
		for (const ticket of rankedTickets) {
			if (slots <= 0) break;
			const exclusiveLabel = getExclusiveLabel(ticket.labels);
			if (exclusiveLabel && anyPickedThisPass) continue;
			tickets.push(ticket);
			slots--;
			anyPickedThisPass = true;
			if (exclusiveLabel) {
				exclusiveActive = true;
				soloRunStarted = exclusiveLabel;
				break;
			}
		}
	}

	return { maintenance, tickets, soloRunStarted };
}

interface GhPrListItem {
	number: number;
	title: string;
	headRefName: string;
	labels: { name: string }[];
	mergeable: string;
	reviews: ReviewLike[];
	commits: { committedDate: string }[];
}

interface GhIssueListItem {
	number: number;
	title: string;
	labels: { name: string }[];
	blockedBy: { nodes: { state: string }[] };
	blocking: { nodes: { state: string }[] };
}

async function findMaintenanceCandidates(): Promise<MaintenanceCandidate[]> {
	const prs = await ghJson<GhPrListItem[]>([
		'pr',
		'list',
		'--state',
		'open',
		'--json',
		'number,title,headRefName,labels,reviews,mergeable,commits',
	]);
	const candidates: MaintenanceCandidate[] = [];
	for (const pr of prs) {
		const labels = pr.labels.map((l) => l.name);
		const hasConflict = pr.mergeable === 'CONFLICTING';
		const headCommitDate = pr.commits.at(-1)?.committedDate ?? '';
		let hasFeedback = hasOutstandingReviewFeedback(pr.reviews ?? [], headCommitDate);
		if (!hasFeedback) {
			const comments = await ghJson<InlineCommentLike[]>([
				'api',
				`repos/{owner}/{repo}/pulls/${pr.number}/comments`,
			]).catch(() => []);
			hasFeedback = hasOutstandingInlineFeedback(comments, headCommitDate);
		}
		if (!hasConflict && !hasFeedback) continue;
		const reason: MaintenanceCandidate['reason'] =
			hasConflict && hasFeedback ? 'conflict+feedback' : hasConflict ? 'conflict' : 'feedback';
		candidates.push({ number: pr.number, title: pr.title, headRefName: pr.headRefName, labels, reason });
	}
	return candidates;
}

async function findTicketCandidates(runningIssueNumbers: Set<number>): Promise<TicketCandidate[]> {
	const issues = await ghJson<GhIssueListItem[]>([
		'issue',
		'list',
		'--state',
		'open',
		'--label',
		'ready',
		'--json',
		'number,title,labels,blockedBy,blocking',
	]);
	const branches = await listBranches();
	const candidates: TicketCandidate[] = [];
	for (const issue of issues) {
		const isBlocked = issue.blockedBy.nodes.some((node) => node.state === 'OPEN');
		if (isBlocked) continue;
		if (runningIssueNumbers.has(issue.number)) continue;
		const hasExistingBranch = branches.some((b) => b.startsWith(`feature/${issue.number}-`));
		if (hasExistingBranch) continue;
		const closedByPrs = await ghJson<{ closedByPullRequestsReferences: unknown[] }>([
			'issue',
			'view',
			String(issue.number),
			'--json',
			'closedByPullRequestsReferences',
		])
			.then((r) => r.closedByPullRequestsReferences ?? [])
			.catch(() => []);
		if (closedByPrs.length > 0) continue;
		const labels = issue.labels.map((l) => l.name);
		const model = getModelLabel(labels) ?? 'sonnet';
		const blockingCount = issue.blocking.nodes.filter((node) => node.state === 'OPEN').length;
		candidates.push({ number: issue.number, title: issue.title, labels, model, blockingCount });
	}
	return candidates;
}

/**
 * Resolves a maintenance PR's model label via its linked issue. `gh pr view --json
 * closingIssuesReferences` does not return `labels` on the linked-issue objects (only
 * `id`/`number`/`repository`/`url`), so this needs a second `gh issue view --json labels`
 * call keyed off the issue number — mirroring isSoloRunCurrentlyActive's two-call pattern
 * below, rather than assuming labels ride along on the first response.
 */
export async function resolveMaintenanceCandidateModel(prNumber: number): Promise<ModelLabel | null> {
	const closing = await ghJson<{ closingIssuesReferences?: { number: number }[] }>([
		'pr',
		'view',
		String(prNumber),
		'--json',
		'closingIssuesReferences',
	]).catch(() => ({ closingIssuesReferences: [] }));
	const linkedIssueNumber = closing.closingIssuesReferences?.[0]?.number;
	if (linkedIssueNumber === undefined) return null;
	return ghJson<{ labels: { name: string }[] }>(['issue', 'view', String(linkedIssueNumber), '--json', 'labels'])
		.then((result) => getModelLabel(result.labels.map((l) => l.name)))
		.catch(() => null);
}

async function isSoloRunCurrentlyActive(): Promise<ExclusiveLabel | null> {
	const running = await listState();
	for (const entry of running) {
		const target =
			entry.kind === 'maintenance' && entry.pr !== null
				? (['pr', 'view', String(entry.pr), '--json', 'labels'] as const)
				: entry.kind === 'ticket' && entry.issue !== null
					? (['issue', 'view', String(entry.issue), '--json', 'labels'] as const)
					: null;
		if (!target) continue;
		const result = await ghJson<{ labels: { name: string }[] }>([...target]).catch(() => ({ labels: [] }));
		const exclusiveLabel = getExclusiveLabel(result.labels.map((l) => l.name));
		if (exclusiveLabel) return exclusiveLabel;
	}
	return null;
}

export function registerSwarmPlanBatchTool(server: McpServer) {
	server.registerTool(
		'swarm_plan_batch',
		{
			description:
				"Pre-filtered, pre-ranked PR-maintenance and ready-ticket lists for swarm's §1+§2 selection, already applying the unblocked/not-in-flight/solo-run rules and truncated to freeSlots.",
			inputSchema: {
				freeSlots: z.number(),
			},
			outputSchema: {
				soloRunActive: z.boolean(),
				soloRunLabel: z.enum(EXCLUSIVE_LABELS).optional(),
				prsNeedingMaintenance: z.array(
					z.object({
						number: z.number(),
						title: z.string(),
						headRefName: z.string(),
						labels: z.array(z.string()),
						model: z.string().nullable(),
						reason: z.enum(['conflict', 'feedback', 'conflict+feedback']),
						blockedBySoloRun: z.boolean(),
					})
				),
				ticketsToImplement: z.array(
					z.object({
						number: z.number(),
						title: z.string(),
						labels: z.array(z.string()),
						model: z.enum(MODEL_LABELS),
						blockingCount: z.number(),
						blockedBySoloRun: z.boolean(),
					})
				),
				drained: z.boolean(),
			},
		},
		async ({ freeSlots }) => {
			const runningEntries = await listState();
			const soloRunLabel = await isSoloRunCurrentlyActive();
			const soloRunActive = soloRunLabel !== null;

			const runningIssueNumbers = new Set(
				runningEntries.filter((e) => e.kind === 'ticket' && e.issue !== null).map((e) => e.issue as number)
			);

			const maintenanceCandidates = await findMaintenanceCandidates();
			const ticketCandidates = await findTicketCandidates(runningIssueNumbers);

			const rankedMaintenance = rankMaintenanceCandidates(maintenanceCandidates);
			const rankedTickets = rankTicketCandidates(ticketCandidates);

			const allocation = allocateBudget(freeSlots, soloRunActive, rankedMaintenance, rankedTickets);

			const prsNeedingMaintenance = await Promise.all(
				allocation.maintenance.map(async (pr) => {
					const model = await resolveMaintenanceCandidateModel(pr.number);
					return { ...pr, model: model ?? 'sonnet', blockedBySoloRun: false };
				})
			);
			const ticketsToImplement = allocation.tickets.map((ticket) => ({ ...ticket, blockedBySoloRun: false }));

			const drained =
				maintenanceCandidates.length === 0 && ticketCandidates.length === 0 && runningEntries.length === 0;

			const structuredContent = {
				soloRunActive,
				soloRunLabel: soloRunLabel ?? undefined,
				prsNeedingMaintenance,
				ticketsToImplement,
				drained,
			};
			return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
		}
	);
}
