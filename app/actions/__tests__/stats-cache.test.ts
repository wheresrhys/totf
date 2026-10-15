import { describe, it, expect, vi, beforeEach } from 'vitest';

import { cachedSupabaseFetch } from '@/app/lib/cached-supabase-fetch';
import { fetchAllPaginatedRows } from '@/lib/supabase';
import { fetchCoreStatsByMonth } from '../stats-cache';
import { makeRpcChainRecorder } from '@/app/__tests__/helpers/rpc-recorder';
import type { ViewedGroup } from '@/app/lib/group-slug';

let recorder: ReturnType<typeof makeRpcChainRecorder>;

vi.mock('@/lib/supabase', () => ({
	fetchAllPaginatedRows: vi
		.fn()
		.mockImplementation(
			async (paginatedDataFetcher) => (await paginatedDataFetcher(10, 20))?.data
		)
}));

const mockSupabaseClient: { rpc: unknown } = { rpc: undefined };

vi.mock('@/app/lib/cached-supabase-fetch', () => ({
	cachedSupabaseFetch: vi
		.fn()
		.mockImplementation((namespace, viewedGroup, dataFetcher) =>
			dataFetcher(mockSupabaseClient, viewedGroup.id)
		)
}));

const GROUP_ID = 1;
const viewedGroup: ViewedGroup = { id: GROUP_ID, slug: 'alpha' };

describe('fetchCoreStatsByMonth', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		recorder = makeRpcChainRecorder();
		mockSupabaseClient.rpc = recorder.rpc;
		recorder.range.mockResolvedValue({ data: [], error: null });
	});

	it('calls the core_stats rpc ungrouped by species, month-grouped by time period, scoped to the group', async () => {
		await fetchCoreStatsByMonth(viewedGroup);
		expect(cachedSupabaseFetch).toHaveBeenCalledWith(
			'month-core-stats',
			viewedGroup,
			expect.any(Function)
		);
		expect(recorder.calls).toContainEqual({
			rpcCall: [
				'core_stats',
				{
					ringing_group_filter: GROUP_ID,
					group_by_species: false,
					group_by_time_period: 'month'
				}
			],
			orderCalls: [['time_period']]
		});
	});

	it('returns the result of the rpc call', async () => {
		recorder.range.mockResolvedValueOnce({
			data: [{ time_period: '2023-01', total_effort: '05:30:00' }]
		});
		const result = await fetchCoreStatsByMonth(viewedGroup);
		expect(result).toStrictEqual([
			{ time_period: '2023-01', total_effort: '05:30:00' }
		]);
	});
});
