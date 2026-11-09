import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	fetchOwnGroupImportJobs,
	type OwnGroupImportJobRow
} from '../import-jobs';
import { getGroupCookie } from '../group-cookie';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

type EqCall = { column: string; value: unknown };
type OrderCall = { column: string; ascending: boolean | undefined };

function makeClient({
	rows = [] as OwnGroupImportJobRow[],
	eqCalls = [] as EqCall[],
	orderCalls = [] as OrderCall[],
	limitCalls = [] as number[]
} = {}) {
	const chain = {
		eq: vi.fn((column: string, value: unknown) => {
			eqCalls.push({ column, value });
			return chain;
		}),
		order: vi.fn((column: string, opts?: { ascending?: boolean }) => {
			orderCalls.push({ column, ascending: opts?.ascending });
			return chain;
		}),
		limit: vi.fn((count: number) => {
			limitCalls.push(count);
			return chain;
		}),
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data: rows, error: null }).then(resolve)
	};
	return { from: vi.fn(() => ({ select: vi.fn(() => chain) })) };
}

describe('fetchOwnGroupImportJobs', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('resolves the group id from the session cookie, never from an input param', async () => {
		vi.mocked(getGroupCookie).mockResolvedValueOnce(42);
		const eqCalls: EqCall[] = [];
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(
			makeClient({ eqCalls })
		);

		await fetchOwnGroupImportJobs();

		expect(eqCalls).toEqual([{ column: 'ringing_group_id', value: 42 }]);
	});

	it('queries ImportJobs filtered to that group id, ordered most-recent first', async () => {
		vi.mocked(getGroupCookie).mockResolvedValueOnce(7);
		const eqCalls: EqCall[] = [];
		const orderCalls: OrderCall[] = [];
		const limitCalls: number[] = [];
		const client = makeClient({ eqCalls, orderCalls, limitCalls });
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);

		await fetchOwnGroupImportJobs();

		expect(client.from).toHaveBeenCalledWith('ImportJobs');
		expect(eqCalls).toEqual([{ column: 'ringing_group_id', value: 7 }]);
		expect(orderCalls).toEqual([{ column: 'started_at', ascending: false }]);
		expect(limitCalls).toEqual([20]);
	});

	it('returns the rows the query resolves with', async () => {
		const rows: OwnGroupImportJobRow[] = [
			{
				id: 1,
				status: 'succeeded',
				started_at: '2026-01-01T00:00:00Z',
				finished_at: '2026-01-01T00:05:00Z',
				rows_processed: 10,
				rows_successful: 10,
				rows_failed: 0,
				day_stats_refresh_status: 'succeeded',
				month_stats_refresh_status: 'succeeded',
				year_stats_refresh_status: 'succeeded',
				month_squashed_stats_refresh_status: 'succeeded',
				all_time_stats_refresh_status: 'succeeded'
			}
		];
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeClient({ rows }));

		const result = await fetchOwnGroupImportJobs();

		expect(result).toEqual(rows);
	});

	it('returns an empty array without querying Supabase if no group is selected', async () => {
		vi.mocked(getGroupCookie).mockResolvedValueOnce(null);

		const result = await fetchOwnGroupImportJobs();

		expect(result).toEqual([]);
		expect(mockGetAuthenticatedSupabaseClient).not.toHaveBeenCalled();
	});
});
