import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { listStateWithPruneReport, prunedEntrySchema, type SwarmWorkerEntry } from '../lib/state-file';
import { listBranches, listWorktrees, getBranchTip, getAheadBehind } from '../lib/git';
import { ghJson } from '../lib/gh';

export const EXCLUSIVE_LABELS = ['db-migration', 'e2e-exclusive'] as const;
export type ExclusiveLabel = (typeof EXCLUSIVE_LABELS)[number];
export const MODEL_LABELS = ['opus', 'sonnet', 'fable'] as const;
export type ModelLabel = (typeof MODEL_LABELS)[number];

/** Priority-override label: a `next`-labelled ready ticket ranks above every ticket without it. */
export const NEXT_LABEL = 'next';

export function getExclusiveLabel(labels: string[]): ExclusiveLabel | undefined {
	return labels.find((label): label is ExclusiveLabel => (EXCLUSIVE_LABELS as readonly string[]).includes(label));
}

export function hasNextLabel(labels: string[]): boolean {
	return labels.includes(NEXT_LABEL);
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

/**
 * Trailing marker a swarm maintenance worker appends to every reply it posts on a PR it's
 * addressing (see `/swarm` §1 step 4). An HTML comment, so it's invisible in GitHub's rendered
 * view. There is no bot identity for swarm workers — `gh pr comment` authenticates as the same
 * human account a real reviewer uses — so `isBotLogin` cannot tell a worker's own reply from
 * genuine unaddressed feedback, and without this marker a replied-to PR loops through maintenance
 * spawns forever (#904).
 */
export const SWARM_WORKER_REPLY_MARKER = '<!-- swarm-worker-reply -->';

function isSwarmWorkerReply(body: string | undefined): boolean {
	return Boolean(body?.includes(SWARM_WORKER_REPLY_MARKER));
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
 * human-authored, not a mermaid-diff comment, not a swarm worker's own marked reply, and newer
 * than the PR's head commit — i.e. nobody has posted anything since, human or otherwise.
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
		if (isSwarmWorkerReply(latest.body)) continue;
		if (latest.created_at && latest.created_at > headCommitDate) return true;
	}
	return false;
}

interface IssueCommentLike {
	user?: { login?: string };
	body?: string;
	created_at?: string;
}

/**
 * Flags a top-level PR conversation comment (`GET /issues/{n}/comments` — what both `gh pr
 * comment` and the `mermaid-diff` skill write to) as outstanding feedback if it's human-authored,
 * not a mermaid-diff comment, not a swarm worker's own marked reply, and newer than the PR's head
 * commit. Issue comments are a flat list, not threaded like review comments, so unlike
 * `hasOutstandingInlineFeedback` there's no reply-threading step — each comment is evaluated on
 * its own.
 */
export function hasOutstandingIssueCommentFeedback(comments: IssueCommentLike[], headCommitDate: string): boolean {
	return comments.some((comment) => {
		if (isBotLogin(comment.user?.login)) return false;
		if (!comment.body || isMermaidDiffComment(comment.body)) return false;
		if (isSwarmWorkerReply(comment.body)) return false;
		return Boolean(comment.created_at && comment.created_at > headCommitDate);
	});
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

/**
 * A `ready`, unblocked, not-in-flight issue whose only disqualifier is a pre-existing
 * `feature/<issue>-*` branch — but that branch's most recent (and only non-open) PR was closed
 * without merging, so the branch is a stale leftover of an abandoned attempt rather than active
 * in-flight work. These are surfaced separately (never auto-added to `ticketsToImplement`) so the
 * orchestrator can prompt the user to reuse/replace the branch instead of silently dropping the
 * issue forever — the failure mode this ticket (#546) fixes.
 */
export interface StaleClosedPrTicket {
	number: number;
	title: string;
	labels: string[];
	staleBranch: string;
	closedPrNumber: number;
}

/**
 * A `ready`, unblocked issue whose only disqualifier is a pre-existing `feature/<issue>-*` branch
 * that has **never had any PR opened against it** — open, closed or merged — and that no live
 * `.claude/swarm-state.json` entry claims. That combination means a previous worker created the
 * branch (and usually a worktree) and then died before it ever got as far as pushing a PR, so the
 * branch is a crashed-attempt leftover rather than active in-flight work.
 *
 * This is the third branch-exists case, distinct from both of the others:
 * - an **open** PR on the branch → genuinely in-flight, stays silently excluded;
 * - a **closed-not-merged** PR → {@link StaleClosedPrTicket}, which has a `closedPrNumber` to point
 *   the user back at for context;
 * - **no PR at all** → this — there is no PR history to inspect, so instead of a three-option
 *   reuse/replace flow the report just carries what git itself knows about the branch (tip commit,
 *   surviving worktree, divergence from `origin/main`) for the orchestrator to show the user.
 *
 * A branch whose only PR was **merged** is deliberately *not* reported here: that's completed work
 * whose branch simply wasn't deleted, not an interrupted attempt, and the issue being still open is
 * a ticket-hygiene matter rather than a stuck-queue one.
 *
 * Before this existed (#546 covered only the closed-PR case) such an issue was excluded with no
 * signal whatsoever — indistinguishable from "someone is working on it right now" — so it vanished
 * from the queue permanently with nothing to tell the user why.
 *
 * Every git-derived field is nullable: a branch that exists only on `origin` has no local worktree,
 * and `origin/main` may not resolve in an odd checkout. `null` means "couldn't determine", never
 * zero.
 */
export interface OrphanedBranchTicket {
	number: number;
	title: string;
	labels: string[];
	orphanedBranch: string;
	/** ISO 8601 committer date of the branch tip, or `null` if the branch tip can't be resolved. */
	lastCommitDate: string | null;
	/** Subject line of the branch's tip commit, or `null` alongside a null `lastCommitDate`. */
	lastCommitMessage: string | null;
	/** Absolute path of a still-checked-out worktree for the branch, or `null` if none survives. */
	worktreePath: string | null;
	/** Commits on the branch but not on `origin/main`, or `null` if the comparison failed. */
	aheadOfMain: number | null;
	/** Commits on `origin/main` but not on the branch, or `null` if the comparison failed. */
	behindMain: number | null;
}

/**
 * {@link OrphanedBranchTicket} as returned by `swarm_plan_batch`, plus the one field only
 * `planBatch` can know: whether this same call's self-healing prune dropped a worker entry for this
 * issue/branch.
 *
 * The two signals genuinely describe one incident — a worker died, its phantom state entry got
 * pruned, and the branch it left behind is the orphan — so reporting them as two unrelated warnings
 * would be a confusing double-signal. Suppressing the orphan instead would be worse: the ticket
 * would then be invisible for exactly the call that discovered the death, which is the failure mode
 * this whole field exists to end. So both are reported and the link between them is made explicit
 * here, for the orchestrator to fold into a single message (see `/swarm` §1.7).
 */
export interface OrphanedBranchTicketReport extends OrphanedBranchTicket {
	prunedThisCall: boolean;
}

export interface TicketCandidatesResult {
	candidates: TicketCandidate[];
	staleClosedPrTickets: StaleClosedPrTicket[];
	orphanedBranchTickets: OrphanedBranchTicket[];
}

export function rankMaintenanceCandidates(candidates: MaintenanceCandidate[]): MaintenanceCandidate[] {
	return [...candidates].sort((a, b) => a.number - b.number);
}

export function rankTicketCandidates(candidates: TicketCandidate[]): TicketCandidate[] {
	// `next` is a priority override: any ticket carrying it ranks above every ticket without it,
	// regardless of blockingCount. Within each group the existing tiebreak holds — blockingCount
	// descending, then issue number ascending.
	return [...candidates].sort(
		(a, b) =>
			Number(hasNextLabel(b.labels)) - Number(hasNextLabel(a.labels)) ||
			b.blockingCount - a.blockingCount ||
			a.number - b.number
	);
}

export interface AllocationResult {
	maintenance: MaintenanceCandidate[];
	tickets: TicketCandidate[];
	soloRunStarted: ExclusiveLabel | null;
}

/**
 * Sequential allocator implementing swarm's solo-run rule: an exclusive-resource-labelled item
 * can only be picked if nothing else has been picked yet this pass AND no worker of any kind is
 * currently running (an exclusive item must run completely solo — see `/swarm`), and once picked,
 * nothing else is picked this pass either. Maintenance is allocated before tickets. Assumes
 * candidates are pre-ranked and pre-filtered for eligibility (unblocked, not in-flight, etc).
 *
 * `soloRunAlreadyActive` (an *exclusive* worker is already running) blocks the whole pass — nothing
 * can be picked until it finishes alone. `anyWorkerRunning` (a worker of *any* kind is running)
 * only blocks *exclusive* candidates: an exclusive item ranked first must be skipped past — via
 * `continue`, so every remaining non-exclusive candidate still gets evaluated and can fill the rest
 * of `freeSlots` — rather than picked (which would break the pass and hide those candidates, #835).
 */
export function allocateBudget(
	freeSlots: number,
	soloRunAlreadyActive: boolean,
	anyWorkerRunning: boolean,
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
			if (exclusiveLabel && (anyPickedThisPass || anyWorkerRunning)) continue;
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
			if (exclusiveLabel && (anyPickedThisPass || anyWorkerRunning)) continue;
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
	updatedAt: string;
}

interface GhIssueListItem {
	number: number;
	title: string;
	labels: { name: string }[];
	blockedBy: { nodes: { state: string }[] };
	blocking: { nodes: { state: string }[] };
	updatedAt: string;
}

/**
 * Process-lifetime caches keyed by `updatedAt` (GitHub bumps this on any label/comment/review
 * change), so a PR/issue that hasn't changed since the last `swarm_plan_batch` call reuses its
 * previously-computed result instead of re-paying for the comment/branch-lookup calls below.
 * `resetSwarmPlanBatchCaches` clears all three — called both by `forceRescan` and by tests that
 * reuse fixture numbers across cases.
 */
const prFeedbackCache = new Map<number, { updatedAt: string; hasFeedback: boolean }>();
const issueClosedByPrCache = new Map<number, { updatedAt: string; closedByPrs: boolean }>();
const issueBranchClassificationCache = new Map<
	number,
	{ updatedAt: string; branch: string; classification: ReturnType<typeof classifyStaleBranchPrs> }
>();

export function resetSwarmPlanBatchCaches(): void {
	prFeedbackCache.clear();
	issueClosedByPrCache.clear();
	issueBranchClassificationCache.clear();
}

/** `gh pr list --head <branch> --state all --json number,state`. `state` is OPEN | CLOSED | MERGED. */
interface GhPrHeadItem {
	number: number;
	state: string;
}

/**
 * Classifies a stale-looking `feature/<issue>-*` branch (an issue's only disqualifier) by the
 * state of its associated PRs, so the caller can tell an actively-worked branch from an abandoned
 * one. GitHub's `closedByPullRequestsReferences` is empty for a PR closed manually (not merged),
 * so that path can't distinguish these — a per-branch `gh pr list --head` lookup can.
 *
 * - open PR present → `'in-flight'` (genuinely being worked — keep excluded, no change)
 * - no open PR but ≥1 closed-not-merged PR → `{ closedPrNumber }` (stale leftover — a new
 *   candidate the orchestrator should prompt about), reporting the most recent (highest-numbered)
 *   closed PR when several exist (a branch re-attempted more than once)
 * - no PR of any kind, ever → `'no-pr-history'` (a possible {@link OrphanedBranchTicket}; the
 *   caller still has to rule out a live state-file entry before calling it orphaned)
 * - only a merged PR → `'excluded'` (completed work whose branch wasn't deleted — stays silent)
 */
export function classifyStaleBranchPrs(
	prs: GhPrHeadItem[]
): 'in-flight' | 'excluded' | 'no-pr-history' | { closedPrNumber: number } {
	if (prs.some((pr) => pr.state === 'OPEN')) return 'in-flight';
	const closedUnmerged = prs.filter((pr) => pr.state === 'CLOSED');
	if (closedUnmerged.length > 0) {
		const mostRecent = closedUnmerged.reduce((a, b) => (b.number > a.number ? b : a));
		return { closedPrNumber: mostRecent.number };
	}
	return prs.length === 0 ? 'no-pr-history' : 'excluded';
}

/** Base ref every orphaned branch's ahead/behind count is measured against. */
export const ORPHAN_BASE_REF = 'origin/main';

/** The best-effort, git-derived half of an {@link OrphanedBranchTicket}. */
type OrphanedBranchGitDetails = Pick<
	OrphanedBranchTicket,
	'lastCommitDate' | 'lastCommitMessage' | 'worktreePath' | 'aheadOfMain' | 'behindMain'
>;

/**
 * Gathers the git-side facts about an orphaned branch for the user-facing report: its tip commit,
 * whether a worktree is still checked out on it, and how far it has diverged from `origin/main`.
 * Deliberately *not* cached alongside the branch classification — that cache is keyed on the
 * issue's GitHub `updatedAt`, which says nothing about local git state, so a cached answer here
 * could show a long-stale commit date. These are cheap local git calls on a rare path.
 */
async function describeOrphanedBranch(
	branch: string,
	worktrees: { path: string; branch: string | null }[]
): Promise<OrphanedBranchGitDetails> {
	const [tip, divergence] = await Promise.all([getBranchTip(branch), getAheadBehind(ORPHAN_BASE_REF, branch)]);
	return {
		lastCommitDate: tip?.committedDate ?? null,
		lastCommitMessage: tip?.subject ?? null,
		worktreePath: worktrees.find((worktree) => worktree.branch === branch)?.path ?? null,
		aheadOfMain: divergence?.ahead ?? null,
		behindMain: divergence?.behind ?? null,
	};
}

export async function findMaintenanceCandidates(): Promise<MaintenanceCandidate[]> {
	const prs = await ghJson<GhPrListItem[]>([
		'pr',
		'list',
		'--state',
		'open',
		'--json',
		'number,title,headRefName,labels,reviews,mergeable,commits,updatedAt',
	]);
	const candidates: MaintenanceCandidate[] = [];
	for (const pr of prs) {
		const labels = pr.labels.map((l) => l.name);
		const hasConflict = pr.mergeable === 'CONFLICTING';
		const headCommitDate = pr.commits.at(-1)?.committedDate ?? '';
		let hasFeedback = hasOutstandingReviewFeedback(pr.reviews ?? [], headCommitDate);
		if (!hasFeedback) {
			const cached = prFeedbackCache.get(pr.number);
			if (cached && cached.updatedAt === pr.updatedAt) {
				hasFeedback = cached.hasFeedback;
			} else {
				const comments = await ghJson<InlineCommentLike[]>([
					'api',
					`repos/{owner}/{repo}/pulls/${pr.number}/comments`,
				]).catch(() => []);
				hasFeedback = hasOutstandingInlineFeedback(comments, headCommitDate);
				if (!hasFeedback) {
					const issueComments = await ghJson<IssueCommentLike[]>([
						'api',
						`repos/{owner}/{repo}/issues/${pr.number}/comments`,
					]).catch(() => []);
					hasFeedback = hasOutstandingIssueCommentFeedback(issueComments, headCommitDate);
				}
				prFeedbackCache.set(pr.number, { updatedAt: pr.updatedAt, hasFeedback });
			}
		}
		if (!hasConflict && !hasFeedback) continue;
		const reason: MaintenanceCandidate['reason'] =
			hasConflict && hasFeedback ? 'conflict+feedback' : hasConflict ? 'conflict' : 'feedback';
		candidates.push({ number: pr.number, title: pr.title, headRefName: pr.headRefName, labels, reason });
	}
	return candidates;
}

/**
 * @param runningIssueNumbers issue numbers of live `kind: 'ticket'` state-file entries.
 * @param runningBranches branch names of *every* live state-file entry, either kind. A branch
 *   claimed here is being worked right now, so it must stay silently excluded rather than being
 *   reported as orphaned — this is the guard that keeps the normal in-progress case invisible.
 *   Issue-number matching alone isn't enough: a maintenance entry carries no issue number, and an
 *   entry can outlive the issue-number association if the branch is re-pointed.
 */
export async function findTicketCandidates(
	runningIssueNumbers: Set<number>,
	runningBranches: Set<string> = new Set()
): Promise<TicketCandidatesResult> {
	const issues = await ghJson<GhIssueListItem[]>([
		'issue',
		'list',
		'--state',
		'open',
		'--label',
		'ready',
		'--json',
		'number,title,labels,blockedBy,blocking,updatedAt',
	]);
	const branches = await listBranches();
	const candidates: TicketCandidate[] = [];
	const staleClosedPrTickets: StaleClosedPrTicket[] = [];
	const orphanedBranchTickets: OrphanedBranchTicket[] = [];
	// Resolved at most once per call, and only if an orphan is actually found — the overwhelmingly
	// common pass finds none and pays nothing for the `git worktree list`.
	let worktreesPromise: ReturnType<typeof listWorktrees> | null = null;
	for (const issue of issues) {
		const isBlocked = issue.blockedBy.nodes.some((node) => node.state === 'OPEN');
		if (isBlocked) continue;
		if (runningIssueNumbers.has(issue.number)) continue;
		const existingBranch = branches.find((b) => b.startsWith(`feature/${issue.number}-`));
		if (existingBranch) {
			// The branch alone would exclude this issue. Only now (i.e. solely for issues that
			// would otherwise be dropped as in-flight) pay for the extra per-branch PR lookup, to
			// tell an actively-worked branch from a stale leftover of a closed-not-merged PR.
			const cachedBranch = issueBranchClassificationCache.get(issue.number);
			let classification: ReturnType<typeof classifyStaleBranchPrs>;
			if (cachedBranch && cachedBranch.updatedAt === issue.updatedAt && cachedBranch.branch === existingBranch) {
				classification = cachedBranch.classification;
			} else {
				const branchPrs = await ghJson<GhPrHeadItem[]>([
					'pr',
					'list',
					'--head',
					existingBranch,
					'--state',
					'all',
					'--json',
					'number,state',
				]).catch(() => []);
				classification = classifyStaleBranchPrs(branchPrs);
				issueBranchClassificationCache.set(issue.number, {
					updatedAt: issue.updatedAt,
					branch: existingBranch,
					classification,
				});
			}
			if (typeof classification === 'object') {
				staleClosedPrTickets.push({
					number: issue.number,
					title: issue.title,
					labels: issue.labels.map((l) => l.name),
					staleBranch: existingBranch,
					closedPrNumber: classification.closedPrNumber,
				});
			} else if (classification === 'no-pr-history' && !runningBranches.has(existingBranch)) {
				// No PR was ever opened on this branch and no live worker claims it: a crashed
				// attempt's leftover, which used to be excluded with no signal at all.
				worktreesPromise ??= listWorktrees();
				orphanedBranchTickets.push({
					number: issue.number,
					title: issue.title,
					labels: issue.labels.map((l) => l.name),
					orphanedBranch: existingBranch,
					...(await describeOrphanedBranch(existingBranch, await worktreesPromise)),
				});
			}
			// 'in-flight', 'excluded', stale-closed and orphaned alike stay out of `candidates` —
			// the branch disqualifies the issue from being auto-implemented either way. The two
			// reported cases are surfaced for a user decision instead, never auto-spawned.
			continue;
		}
		const cachedClosedBy = issueClosedByPrCache.get(issue.number);
		let hasClosedByPrs: boolean;
		if (cachedClosedBy && cachedClosedBy.updatedAt === issue.updatedAt) {
			hasClosedByPrs = cachedClosedBy.closedByPrs;
		} else {
			const closedByPrs = await ghJson<{ closedByPullRequestsReferences: unknown[] }>([
				'issue',
				'view',
				String(issue.number),
				'--json',
				'closedByPullRequestsReferences',
			])
				.then((r) => r.closedByPullRequestsReferences ?? [])
				.catch(() => []);
			hasClosedByPrs = closedByPrs.length > 0;
			issueClosedByPrCache.set(issue.number, { updatedAt: issue.updatedAt, closedByPrs: hasClosedByPrs });
		}
		if (hasClosedByPrs) continue;
		const labels = issue.labels.map((l) => l.name);
		const model = getModelLabel(labels) ?? 'sonnet';
		const blockingCount = issue.blocking.nodes.filter((node) => node.state === 'OPEN').length;
		candidates.push({ number: issue.number, title: issue.title, labels, model, blockingCount });
	}
	return { candidates, staleClosedPrTickets, orphanedBranchTickets };
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

/**
 * The exclusive label of the first running worker still holding the shared-local-Postgres lock, or
 * `null` when none is. An entry that has explicitly released its lock early (`dbLockReleased`, set
 * via `swarm_state_release_db_lock` once its migration/`@mutates` work is applied and verified) is
 * skipped *before* its `gh` label lookup — cheaper, and correct: a released entry must never
 * contribute an exclusive label even though its issue/PR still carries one. The flag is the sole
 * signal; liveness/idleness is deliberately not consulted here (the release is one-way and persists
 * however the worker behaves afterwards, including going idle or opening its PR).
 */
async function isSoloRunCurrentlyActive(running: SwarmWorkerEntry[]): Promise<ExclusiveLabel | null> {
	for (const entry of running) {
		if (entry.dbLockReleased === true) continue;
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

/**
 * Core batch planner behind the `swarm_plan_batch` tool, extracted so it can be exercised directly
 * in tests. Reads worker state *through the self-healing prune*, so a dead worker (missing worktree
 * or gone stale-inactive) is dropped before any accounting: it no longer inflates
 * `runningIssueNumbers` (freeing a phantom cap slot) nor keeps a solo run "active"
 * (`isSoloRunCurrentlyActive` sees only the surviving live workers) — fixing both raised impacts of
 * #579 at this single point. The `pruned` report is passed straight through for the orchestrator to
 * warn on.
 *
 * `forceRescan` clears the per-item caches (see `resetSwarmPlanBatchCaches`) before planning, so a
 * manual re-check always reflects live GitHub state instead of a cached result from an earlier
 * call in this same process.
 */
export async function planBatch(freeSlots: number, forceRescan = false) {
	if (forceRescan) resetSwarmPlanBatchCaches();
	const { workers: runningEntries, pruned } = await listStateWithPruneReport();
	const soloRunLabel = await isSoloRunCurrentlyActive(runningEntries);
	const soloRunActive = soloRunLabel !== null;

	const runningIssueNumbers = new Set(
		runningEntries.filter((e) => e.kind === 'ticket' && e.issue !== null).map((e) => e.issue as number)
	);
	// Every live entry's branch, both kinds — the "is someone working this branch right now?" guard
	// for orphaned-branch detection. Taken from the *post-prune* entries, so a phantom worker can't
	// keep masking its own orphaned branch forever.
	const runningBranches = new Set(runningEntries.map((e) => e.branch));

	const maintenanceCandidates = await findMaintenanceCandidates();
	const {
		candidates: ticketCandidates,
		staleClosedPrTickets,
		orphanedBranchTickets,
	} = await findTicketCandidates(runningIssueNumbers, runningBranches);

	// Tie each orphan back to a worker entry this same call pruned, when there is one, so the
	// orchestrator reports one incident rather than two unrelated warnings — see
	// OrphanedBranchTicketReport for why both are reported at all.
	const orphanedBranchTicketReports: OrphanedBranchTicketReport[] = orphanedBranchTickets.map((orphan) => ({
		...orphan,
		prunedThisCall: pruned.some((entry) => entry.branch === orphan.orphanedBranch || entry.issue === orphan.number),
	}));

	const rankedMaintenance = rankMaintenanceCandidates(maintenanceCandidates);
	const rankedTickets = rankTicketCandidates(ticketCandidates);

	// An exclusive-resource candidate can only be picked when *nothing else is running at all* —
	// not merely when no exclusive worker is running (#835). `soloRunActive` still blocks the whole
	// pass (an exclusive worker must finish solo); `anyWorkerRunning` additionally keeps a new
	// exclusive candidate from being picked while ordinary workers are live, without hiding the
	// ordinary candidates that should still fill the free slots.
	const anyWorkerRunning = runningEntries.length > 0;

	const allocation = allocateBudget(freeSlots, soloRunActive, anyWorkerRunning, rankedMaintenance, rankedTickets);

	const prsNeedingMaintenance = await Promise.all(
		allocation.maintenance.map(async (pr) => {
			const model = await resolveMaintenanceCandidateModel(pr.number);
			return { ...pr, model: model ?? 'sonnet', blockedBySoloRun: false };
		})
	);
	const ticketsToImplement = allocation.tickets.map((ticket) => ({ ...ticket, blockedBySoloRun: false }));

	// Stale-closed-PR and orphaned-branch tickets are pending work too (each awaiting a user
	// decision), so the pool isn't genuinely drained while any remain — otherwise the orchestrator
	// would go idle and never surface them.
	const drained =
		maintenanceCandidates.length === 0 &&
		ticketCandidates.length === 0 &&
		staleClosedPrTickets.length === 0 &&
		orphanedBranchTicketReports.length === 0 &&
		runningEntries.length === 0;

	return {
		soloRunActive,
		soloRunLabel: soloRunLabel ?? undefined,
		prsNeedingMaintenance,
		ticketsToImplement,
		staleClosedPrTickets,
		orphanedBranchTickets: orphanedBranchTicketReports,
		drained,
		pruned,
	};
}

export function registerSwarmPlanBatchTool(server: McpServer) {
	server.registerTool(
		'swarm_plan_batch',
		{
			description:
				"Pre-filtered, pre-ranked PR-maintenance and ready-ticket lists for swarm's §1+§2 selection, already applying the unblocked/not-in-flight/solo-run rules and truncated to freeSlots. Also returns staleClosedPrTickets — ready tickets excluded only because a feature/<issue>-* branch from a closed-not-merged PR still exists — for the orchestrator to prompt on before reusing/replacing. And orphanedBranchTickets — ready tickets excluded only because a feature/<issue>-* branch exists that never had ANY PR opened against it (open, closed or merged) and that no live swarm-state.json entry claims: a branch left behind by a worker that crashed before it ever pushed a PR. Each carries the branch's tip commit date/message, a surviving worktree path if any, ahead/behind counts vs origin/main, and prunedThisCall (true when this same call also pruned a dead worker entry for that branch/issue — report the two as one incident, not two warnings). Never auto-spawn either list; ask the user first (§1.5 / §1.7). `pruned` lists worker entries auto-removed from state this call as presumed-dead (missing worktree, or no worktree activity past the staleness threshold) — warn the user on any non-empty list before selecting. Per-item feedback/branch-classification results are cached in-process across calls, keyed by each PR/issue's own `updatedAt` — pass `forceRescan: true` (e.g. on a user-requested re-check) to bypass the cache and recompute everything from live GitHub state.",
			inputSchema: {
				freeSlots: z.number(),
				forceRescan: z.boolean().optional(),
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
				staleClosedPrTickets: z.array(
					z.object({
						number: z.number(),
						title: z.string(),
						labels: z.array(z.string()),
						staleBranch: z.string(),
						closedPrNumber: z.number(),
					})
				),
				orphanedBranchTickets: z.array(
					z.object({
						number: z.number(),
						title: z.string(),
						labels: z.array(z.string()),
						orphanedBranch: z.string(),
						lastCommitDate: z.string().nullable(),
						lastCommitMessage: z.string().nullable(),
						worktreePath: z.string().nullable(),
						aheadOfMain: z.number().nullable(),
						behindMain: z.number().nullable(),
						prunedThisCall: z.boolean(),
					})
				),
				drained: z.boolean(),
				pruned: z.array(prunedEntrySchema),
			},
		},
		async ({ freeSlots, forceRescan }) => {
			const structuredContent = await planBatch(freeSlots, forceRescan);
			return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
		}
	);
}
