import { describe, it, expect, vi, afterEach } from 'vitest';

// Only listStateWithPruneReport is stubbed; the real schemas/types stay intact so swarm-state.ts
// still imports its zod schemas normally.
vi.mock('../../lib/state-file', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../lib/state-file')>()),
	listStateWithPruneReport: vi.fn(),
}));

import { listStateWithPruneReport, type PrunedEntry, type SwarmWorkerEntry } from '../../lib/state-file';
import { listWorkersWithPrune } from '../swarm-state';

function makeEntry(overrides: Partial<SwarmWorkerEntry> = {}): SwarmWorkerEntry {
	return {
		kind: 'ticket',
		issue: 1,
		pr: null,
		branch: 'feature/1-example',
		title: 'Example',
		worktreePath: '/tmp/example',
		agentId: 'agent-1',
		model: 'sonnet',
		startedAt: '2026-01-01T00:00:00.000Z',
		...overrides,
	};
}

describe('listWorkersWithPrune', () => {
	const mockListState = vi.mocked(listStateWithPruneReport);

	afterEach(() => {
		mockListState.mockReset();
	});

	// Usual — a normal list with nothing stale is unchanged and the prune list is empty.
	it('returns the workers unchanged with an empty prune list when nothing was pruned', async () => {
		const entry = makeEntry();
		mockListState.mockResolvedValue({ workers: [entry], pruned: [] });

		const result = await listWorkersWithPrune({});

		expect(result).toEqual({ workers: [entry], pruned: [] });
	});

	// Structure — the prune list is populated and returned alongside the surviving workers.
	it('returns the prune list alongside the (shorter) worker list when listState pruned an entry', async () => {
		const survivor = makeEntry({ agentId: 'agent-live' });
		const pruned: PrunedEntry = {
			agentId: 'agent-dead',
			branch: 'feature/2-dead',
			issue: 2,
			pr: null,
			title: 'Dead worker',
			reason: 'stale-inactivity',
		};
		mockListState.mockResolvedValue({ workers: [survivor], pruned: [pruned] });

		const result = await listWorkersWithPrune({});

		expect(result.workers).toEqual([survivor]);
		expect(result.pruned).toEqual([pruned]);
	});

	// Structure — the caller's filter narrows `workers` but never the prune report.
	it('filters workers by the given predicate while passing the full prune report through unfiltered', async () => {
		const ticketWorker = makeEntry({ agentId: 'agent-ticket', kind: 'ticket', issue: 1, pr: null });
		const maintenanceWorker = makeEntry({ agentId: 'agent-maint', kind: 'maintenance', issue: null, pr: 9 });
		const pruned: PrunedEntry = {
			agentId: 'agent-dead',
			branch: 'feature/2-dead',
			issue: 2,
			pr: null,
			title: 'Dead worker',
			reason: 'worktree-missing',
		};
		mockListState.mockResolvedValue({ workers: [ticketWorker, maintenanceWorker], pruned: [pruned] });

		const result = await listWorkersWithPrune({ kind: 'maintenance' });

		expect(result.workers).toEqual([maintenanceWorker]);
		expect(result.pruned).toEqual([pruned]);
	});
});
