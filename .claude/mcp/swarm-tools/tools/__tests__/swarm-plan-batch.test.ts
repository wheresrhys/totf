import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../lib/gh', () => ({ ghJson: vi.fn() }));

import { ghJson } from '../../lib/gh';
import {
	getExclusiveLabel,
	getModelLabel,
	hasOutstandingReviewFeedback,
	hasOutstandingInlineFeedback,
	rankMaintenanceCandidates,
	rankTicketCandidates,
	allocateBudget,
	resolveMaintenanceCandidateModel,
	type MaintenanceCandidate,
	type TicketCandidate,
} from '../swarm-plan-batch';

describe('getExclusiveLabel', () => {
	// Usual
	it('finds db-migration among other labels', () => {
		expect(getExclusiveLabel(['ready', 'opus', 'db-migration'])).toBe('db-migration');
	});

	// Structure
	it('finds e2e-exclusive', () => {
		expect(getExclusiveLabel(['e2e-exclusive'])).toBe('e2e-exclusive');
	});

	// Edge
	it('returns undefined when no exclusive label is present', () => {
		expect(getExclusiveLabel(['ready', 'sonnet'])).toBeUndefined();
	});
});

describe('getModelLabel', () => {
	it('finds the model label among other labels', () => {
		expect(getModelLabel(['ready', 'db-migration', 'opus'])).toBe('opus');
	});

	it('returns null when no model label is present', () => {
		expect(getModelLabel(['ready'])).toBeNull();
	});
});

describe('resolveMaintenanceCandidateModel', () => {
	const mockGhJson = vi.mocked(ghJson);

	afterEach(() => {
		mockGhJson.mockReset();
	});

	// Usual — regression test for the real crash on PR #498: `gh pr view --json
	// closingIssuesReferences` returns linked-issue objects WITHOUT a `labels` field (only
	// id/number/repository/url), so the model must come from a separate `gh issue view` call.
	it('resolves the model label via a separate issue lookup, matching gh\'s actual label-less closingIssuesReferences shape', async () => {
		mockGhJson
			.mockResolvedValueOnce({ closingIssuesReferences: [{ number: 488 }] })
			.mockResolvedValueOnce({ labels: [{ name: 'opus' }] });

		const model = await resolveMaintenanceCandidateModel(498);

		expect(model).toBe('opus');
		expect(mockGhJson).toHaveBeenNthCalledWith(1, ['pr', 'view', '498', '--json', 'closingIssuesReferences']);
		expect(mockGhJson).toHaveBeenNthCalledWith(2, ['issue', 'view', '488', '--json', 'labels']);
	});

	// Structure
	it('returns null without a second call when the PR has no linked issue', async () => {
		mockGhJson.mockResolvedValueOnce({ closingIssuesReferences: [] });

		const model = await resolveMaintenanceCandidateModel(499);

		expect(model).toBeNull();
		expect(mockGhJson).toHaveBeenCalledTimes(1);
	});

	it('returns null when the linked issue has no model label', async () => {
		mockGhJson
			.mockResolvedValueOnce({ closingIssuesReferences: [{ number: 1 }] })
			.mockResolvedValueOnce({ labels: [{ name: 'ready' }] });

		const model = await resolveMaintenanceCandidateModel(1);

		expect(model).toBeNull();
	});

	// Edge
	it('returns null when the closingIssuesReferences lookup itself fails', async () => {
		mockGhJson.mockRejectedValueOnce(new Error('gh error'));

		const model = await resolveMaintenanceCandidateModel(2);

		expect(model).toBeNull();
	});

	it('returns null when the issue-view lookup fails', async () => {
		mockGhJson
			.mockResolvedValueOnce({ closingIssuesReferences: [{ number: 3 }] })
			.mockRejectedValueOnce(new Error('gh error'));

		const model = await resolveMaintenanceCandidateModel(3);

		expect(model).toBeNull();
	});
});

describe('hasOutstandingReviewFeedback', () => {
	const headCommitDate = '2026-01-05T00:00:00Z';

	// Usual
	it('flags a CHANGES_REQUESTED review regardless of date', () => {
		const reviews = [{ author: { login: 'reviewer' }, state: 'CHANGES_REQUESTED', submittedAt: '2026-01-01T00:00:00Z' }];
		expect(hasOutstandingReviewFeedback(reviews, headCommitDate)).toBe(true);
	});

	// Structure
	it('flags a non-empty human review newer than the head commit', () => {
		const reviews = [{ author: { login: 'reviewer' }, state: 'COMMENTED', body: 'looks off', submittedAt: '2026-01-06T00:00:00Z' }];
		expect(hasOutstandingReviewFeedback(reviews, headCommitDate)).toBe(true);
	});

	it('ignores a review older than the head commit', () => {
		const reviews = [{ author: { login: 'reviewer' }, state: 'COMMENTED', body: 'old', submittedAt: '2026-01-01T00:00:00Z' }];
		expect(hasOutstandingReviewFeedback(reviews, headCommitDate)).toBe(false);
	});

	it('ignores a bot-authored review', () => {
		const reviews = [{ author: { login: 'some-bot[bot]' }, state: 'CHANGES_REQUESTED', submittedAt: '2026-01-06T00:00:00Z' }];
		expect(hasOutstandingReviewFeedback(reviews, headCommitDate)).toBe(false);
	});

	it('ignores a mermaid-diff comment body', () => {
		const reviews = [{ author: { login: 'reviewer' }, state: 'COMMENTED', body: '```mermaid\nflowchart TB\n```', submittedAt: '2026-01-06T00:00:00Z' }];
		expect(hasOutstandingReviewFeedback(reviews, headCommitDate)).toBe(false);
	});

	// Edge
	it('returns false for no reviews', () => {
		expect(hasOutstandingReviewFeedback([], headCommitDate)).toBe(false);
	});
});

describe('hasOutstandingInlineFeedback', () => {
	const headCommitDate = '2026-01-05T00:00:00Z';

	// Usual
	it('flags a fresh top-level comment newer than the head commit', () => {
		const comments = [{ id: 1, user: { login: 'reviewer' }, body: 'fix this', created_at: '2026-01-06T00:00:00Z' }];
		expect(hasOutstandingInlineFeedback(comments, headCommitDate)).toBe(true);
	});

	// Structure
	it('treats a thread as answered when the latest reply is newer and not from the original commenter', () => {
		const comments = [
			{ id: 1, user: { login: 'reviewer' }, body: 'fix this', created_at: '2026-01-06T00:00:00Z' },
			{ id: 2, in_reply_to_id: 1, user: { login: 'author' }, body: 'done', created_at: '2026-01-07T00:00:00Z' },
		];
		// The latest comment in the thread (id 2) is what's evaluated — it's newer than head, so still "outstanding"
		// from a pure recency read (no semantic understanding of who replied to whom beyond timestamp).
		expect(hasOutstandingInlineFeedback(comments, headCommitDate)).toBe(true);
	});

	it('ignores a thread whose latest comment predates the head commit', () => {
		const comments = [{ id: 1, user: { login: 'reviewer' }, body: 'fix this', created_at: '2026-01-01T00:00:00Z' }];
		expect(hasOutstandingInlineFeedback(comments, headCommitDate)).toBe(false);
	});

	it('ignores a bot-authored comment', () => {
		const comments = [{ id: 1, user: { login: 'github-actions[bot]' }, body: 'automated note', created_at: '2026-01-06T00:00:00Z' }];
		expect(hasOutstandingInlineFeedback(comments, headCommitDate)).toBe(false);
	});

	it('ignores the mermaid-diff bot comment by content', () => {
		const comments = [{ id: 1, user: { login: 'wheresrhys' }, body: '```mermaid\nflowchart TB\n```', created_at: '2026-01-06T00:00:00Z' }];
		expect(hasOutstandingInlineFeedback(comments, headCommitDate)).toBe(false);
	});

	// Edge
	it('returns false for no comments', () => {
		expect(hasOutstandingInlineFeedback([], headCommitDate)).toBe(false);
	});
});

describe('rankMaintenanceCandidates', () => {
	it('sorts by issue number ascending', () => {
		const candidates: MaintenanceCandidate[] = [
			{ number: 20, title: 'b', headRefName: 'b', labels: [], reason: 'conflict' },
			{ number: 5, title: 'a', headRefName: 'a', labels: [], reason: 'feedback' },
		];
		expect(rankMaintenanceCandidates(candidates).map((c) => c.number)).toEqual([5, 20]);
	});
});

describe('rankTicketCandidates', () => {
	// Usual
	it('ranks by blockingCount descending', () => {
		const candidates: TicketCandidate[] = [
			{ number: 1, title: 'a', labels: [], model: 'sonnet', blockingCount: 0 },
			{ number: 2, title: 'b', labels: [], model: 'sonnet', blockingCount: 3 },
		];
		expect(rankTicketCandidates(candidates).map((c) => c.number)).toEqual([2, 1]);
	});

	// Edge
	it('tie-breaks on lowest issue number', () => {
		const candidates: TicketCandidate[] = [
			{ number: 20, title: 'a', labels: [], model: 'sonnet', blockingCount: 1 },
			{ number: 5, title: 'b', labels: [], model: 'sonnet', blockingCount: 1 },
		];
		expect(rankTicketCandidates(candidates).map((c) => c.number)).toEqual([5, 20]);
	});
});

describe('allocateBudget', () => {
	const nonExclusiveMaintenance: MaintenanceCandidate[] = [
		{ number: 1, title: 'pr1', headRefName: 'b1', labels: ['ready'], reason: 'conflict' },
	];
	const exclusiveMaintenance: MaintenanceCandidate[] = [
		{ number: 2, title: 'pr2', headRefName: 'b2', labels: ['db-migration'], reason: 'conflict' },
	];
	const nonExclusiveTickets: TicketCandidate[] = [
		{ number: 10, title: 't1', labels: ['ready'], model: 'sonnet', blockingCount: 0 },
	];
	const exclusiveTickets: TicketCandidate[] = [
		{ number: 11, title: 't2', labels: ['e2e-exclusive'], model: 'sonnet', blockingCount: 0 },
	];

	// Usual
	it('fills maintenance first, then tickets, within free slots', () => {
		const result = allocateBudget(2, false, nonExclusiveMaintenance, nonExclusiveTickets);
		expect(result.maintenance.map((m) => m.number)).toEqual([1]);
		expect(result.tickets.map((t) => t.number)).toEqual([10]);
		expect(result.soloRunStarted).toBeNull();
	});

	// Structure
	it('selects nothing when a solo run is already active', () => {
		const result = allocateBudget(4, true, nonExclusiveMaintenance, nonExclusiveTickets);
		expect(result.maintenance).toEqual([]);
		expect(result.tickets).toEqual([]);
	});

	it('picks an exclusive maintenance PR alone and stops the pass', () => {
		const result = allocateBudget(4, false, [...exclusiveMaintenance, ...nonExclusiveMaintenance], nonExclusiveTickets);
		expect(result.maintenance.map((m) => m.number)).toEqual([2]);
		expect(result.tickets).toEqual([]);
		expect(result.soloRunStarted).toBe('db-migration');
	});

	it('skips an exclusive ticket that would join an already non-empty batch, leaving it for next round', () => {
		const result = allocateBudget(4, false, nonExclusiveMaintenance, [...exclusiveTickets, ...nonExclusiveTickets]);
		expect(result.maintenance.map((m) => m.number)).toEqual([1]);
		expect(result.tickets.map((t) => t.number)).toEqual([10]);
	});

	it('picks a lone exclusive ticket when nothing else is eligible', () => {
		const result = allocateBudget(4, false, [], exclusiveTickets);
		expect(result.tickets.map((t) => t.number)).toEqual([11]);
		expect(result.soloRunStarted).toBe('e2e-exclusive');
	});

	// Edge
	it('respects freeSlots of 0', () => {
		const result = allocateBudget(0, false, nonExclusiveMaintenance, nonExclusiveTickets);
		expect(result.maintenance).toEqual([]);
		expect(result.tickets).toEqual([]);
	});

	it('returns empty results when there are no candidates', () => {
		const result = allocateBudget(4, false, [], []);
		expect(result).toEqual({ maintenance: [], tickets: [], soloRunStarted: null });
	});
});
