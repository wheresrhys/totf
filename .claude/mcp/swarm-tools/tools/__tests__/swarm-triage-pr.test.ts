import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../lib/gh', () => ({ ghJson: vi.fn() }));

import { ghJson } from '../../lib/gh';
import { SWARM_WORKER_REPLY_MARKER } from '../swarm-plan-batch';
import { triagePr } from '../swarm-triage-pr';

const headCommitDate = '2026-01-05T00:00:00Z';
const afterHeadCommit = '2026-01-06T00:00:00Z';
const beforeHeadCommit = '2026-01-01T00:00:00Z';

describe('swarm_triage_pr', () => {
	const mockGhJson = vi.mocked(ghJson);

	afterEach(() => {
		mockGhJson.mockReset();
	});

	/**
	 * Queues the three `gh` responses `triagePr` makes, in call order: the `gh pr view`, then the
	 * inline review comments, then the top-level issue comments.
	 */
	function mockPr({
		mergeable = 'MERGEABLE',
		reviews = [] as unknown[],
		inlineComments = [] as unknown[],
		issueComments = [] as unknown[],
	} = {}) {
		mockGhJson
			.mockResolvedValueOnce({
				number: 1200,
				headRefName: 'feature/1200-x',
				mergeable,
				reviews,
				commits: [{ committedDate: headCommitDate }],
			})
			.mockResolvedValueOnce(inlineComments)
			.mockResolvedValueOnce(issueComments);
	}

	describe('conflict detection', () => {
		// Usual
		it('flags hasConflict true when mergeable is CONFLICTING', async () => {
			mockPr({ mergeable: 'CONFLICTING' });

			const triage = await triagePr(1200);

			expect(triage).toMatchObject({
				number: 1200,
				headRefName: 'feature/1200-x',
				hasConflict: true,
				reason: 'conflict',
			});
			expect(mockGhJson).toHaveBeenNthCalledWith(1, [
				'pr',
				'view',
				'1200',
				'--json',
				'number,headRefName,mergeable,reviews,commits',
			]);
		});

		// Structure
		it('flags hasConflict false when mergeable is MERGEABLE', async () => {
			mockPr({ mergeable: 'MERGEABLE' });

			expect(await triagePr(1200)).toMatchObject({ hasConflict: false });
		});
	});

	describe('outstanding review feedback', () => {
		// Usual — CHANGES_REQUESTED counts however old it is, and the whole review comes back, not a flag.
		it("includes a CHANGES_REQUESTED review's full content regardless of date", async () => {
			const changesRequested = {
				author: { login: 'wheresrhys' },
				state: 'CHANGES_REQUESTED',
				body: 'rename this function',
				submittedAt: beforeHeadCommit,
			};
			mockPr({ reviews: [changesRequested] });

			const triage = await triagePr(1200);

			expect(triage.outstandingReviews).toEqual([changesRequested]);
			expect(triage.reason).toBe('feedback');
		});

		// Edge
		it('excludes a bot-authored or mermaid-diff-bodied review', async () => {
			mockPr({
				reviews: [
					{ author: { login: 'vercel[bot]' }, state: 'COMMENTED', body: 'deployed', submittedAt: afterHeadCommit },
					{
						author: { login: 'wheresrhys' },
						state: 'COMMENTED',
						body: '```mermaid\ngraph TD;\n```',
						submittedAt: afterHeadCommit,
					},
				],
			});

			const triage = await triagePr(1200);

			expect(triage.outstandingReviews).toEqual([]);
			expect(triage.reason).toBe('none');
		});
	});

	describe('outstanding inline comment threads', () => {
		// Usual — the whole thread is returned, not just the comment that made it outstanding.
		it('includes a thread whose latest comment is a fresh, unmarked human reply', async () => {
			const threadRoot = { id: 10, user: { login: 'wheresrhys' }, body: 'fix this', created_at: beforeHeadCommit };
			const humanReply = {
				id: 11,
				in_reply_to_id: 10,
				user: { login: 'wheresrhys' },
				body: 'still not fixed',
				created_at: afterHeadCommit,
			};
			mockPr({ inlineComments: [threadRoot, humanReply] });

			const triage = await triagePr(1200);

			expect(triage.outstandingInlineThreads).toEqual([[threadRoot, humanReply]]);
			expect(mockGhJson).toHaveBeenNthCalledWith(2, ['api', 'repos/{owner}/{repo}/pulls/1200/comments']);
		});

		// Edge
		it('excludes a thread whose latest comment carries the swarm-worker-reply marker', async () => {
			mockPr({
				inlineComments: [
					{ id: 10, user: { login: 'wheresrhys' }, body: 'fix this', created_at: afterHeadCommit },
					{
						id: 11,
						in_reply_to_id: 10,
						user: { login: 'wheresrhys' },
						body: `Done.\n\n${SWARM_WORKER_REPLY_MARKER}`,
						created_at: '2026-01-07T00:00:00Z',
					},
				],
			});

			const triage = await triagePr(1200);

			expect(triage.outstandingInlineThreads).toEqual([]);
			expect(triage.reason).toBe('none');
		});
	});

	describe('outstanding issue comments', () => {
		// Usual
		it('includes a fresh human top-level comment', async () => {
			const comment = { user: { login: 'wheresrhys' }, body: 'please also edit this', created_at: afterHeadCommit };
			mockPr({ issueComments: [comment] });

			const triage = await triagePr(1200);

			expect(triage.outstandingIssueComments).toEqual([comment]);
			expect(mockGhJson).toHaveBeenNthCalledWith(3, ['api', 'repos/{owner}/{repo}/issues/1200/comments']);
		});

		// Edge
		it('excludes a swarm-worker-marked reply', async () => {
			mockPr({
				issueComments: [
					{
						user: { login: 'wheresrhys' },
						body: `Addressed in the latest push.\n\n${SWARM_WORKER_REPLY_MARKER}`,
						created_at: afterHeadCommit,
					},
				],
			});

			const triage = await triagePr(1200);

			expect(triage.outstandingIssueComments).toEqual([]);
			expect(triage.reason).toBe('none');
		});
	});

	describe('reason', () => {
		// Usual
		it('reports conflict+feedback when both are present', async () => {
			mockPr({
				mergeable: 'CONFLICTING',
				issueComments: [{ user: { login: 'wheresrhys' }, body: 'one more thing', created_at: afterHeadCommit }],
			});

			expect((await triagePr(1200)).reason).toBe('conflict+feedback');
		});

		// Edge
		it('reports none when the PR has no conflict and no outstanding feedback', async () => {
			mockPr();

			const triage = await triagePr(1200);

			expect(triage).toEqual({
				number: 1200,
				headRefName: 'feature/1200-x',
				hasConflict: false,
				outstandingReviews: [],
				outstandingInlineThreads: [],
				outstandingIssueComments: [],
				reason: 'none',
			});
		});
	});
});
