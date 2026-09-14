import { describe, it, expect, vi, afterEach } from 'vitest';

// Only listStateWithPruneReport and withStateLock are stubbed; the real schemas/types stay intact so
// swarm-state.ts still imports its zod schemas normally.
vi.mock('../../lib/state-file', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../lib/state-file')>()),
	listStateWithPruneReport: vi.fn(),
	withStateLock: vi.fn(),
}));

import { listStateWithPruneReport, withStateLock, type PrunedEntry, type SwarmWorkerEntry } from '../../lib/state-file';
import { listWorkersWithPrune, releaseDbLockForAgent } from '../swarm-state';

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

describe('releaseDbLockForAgent', () => {
	const mockWithStateLock = vi.mocked(withStateLock);

	/** Stands the locked read-modify-write up over an in-memory array, so the real mutator runs and its writes are observable. */
	function stubState(initial: SwarmWorkerEntry[]): { current: () => SwarmWorkerEntry[] } {
		let entries = initial;
		mockWithStateLock.mockImplementation(async (mutate) => {
			const outcome = await mutate(entries);
			entries = outcome.entries;
			return outcome.result;
		});
		return { current: () => entries };
	}

	afterEach(() => {
		mockWithStateLock.mockReset();
	});

	// Usual — the flag goes on, and the updated entry comes back.
	it('sets dbLockReleased on the matching entry and returns it', async () => {
		const state = stubState([makeEntry({ agentId: 'agent-migration' })]);

		const released = await releaseDbLockForAgent('agent-migration');

		expect(released).toEqual({ ...makeEntry({ agentId: 'agent-migration' }), dbLockReleased: true });
		expect(state.current()).toEqual([released]);
	});

	// Structure — only the named worker is touched; siblings keep their existing state.
	it('leaves every other entry untouched', async () => {
		const other = makeEntry({ agentId: 'agent-other' });
		const state = stubState([makeEntry({ agentId: 'agent-migration' }), other]);

		await releaseDbLockForAgent('agent-migration');

		expect(state.current()[0].dbLockReleased).toBe(true);
		expect(state.current()[1]).toEqual(other);
	});

	// Structure — releasing twice is a no-op, since the signal is one-way.
	it('is idempotent when the entry has already released its lock', async () => {
		const state = stubState([makeEntry({ agentId: 'agent-migration', dbLockReleased: true })]);

		const released = await releaseDbLockForAgent('agent-migration');

		expect(released?.dbLockReleased).toBe(true);
		expect(state.current()).toHaveLength(1);
	});

	// Edge — an unknown agentId mirrors swarm_state_remove's not-found handling.
	it('returns undefined and modifies nothing when no entry matches the agentId', async () => {
		const untouched = makeEntry({ agentId: 'agent-other' });
		const state = stubState([untouched]);

		const released = await releaseDbLockForAgent('agent-missing');

		expect(released).toBeUndefined();
		expect(state.current()).toEqual([untouched]);
	});
});
