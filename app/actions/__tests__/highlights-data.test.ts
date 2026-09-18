import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { cachedSupabaseFetch } from '@/app/lib/cached-supabase-fetch';
import { fetchAllPaginatedRows } from '@/lib/supabase';
import { fetchDailyStats, uncachedDailyCoreStats } from '../highlights-data';

vi.mock('@/lib/supabase', () => ({
	fetchAllPaginatedRows: vi
		.fn()
		.mockImplementation(
			async (paginatedDataFetcher) => (await paginatedDataFetcher(10, 20))?.data
		)
}));

const mockRange = vi.fn();
const mockOrder = vi.fn().mockImplementation(() => ({
	order: mockOrder,
	range: mockRange
}));
const mockRpc = vi.fn().mockImplementation(() => ({
	order: mockOrder
}));

const mockSupabaseClient = {
	rpc: mockRpc
};

function setMockResponse(data: unknown) {
	mockRange.mockImplementation(() => Promise.resolve({ data, error: null }));
}

vi.mock('@/app/lib/cached-supabase-fetch', () => ({
	cachedSupabaseFetch: vi
		.fn()
		.mockImplementation((namespace, viewedGroupId, dataFetcher) =>
			dataFetcher(mockSupabaseClient, viewedGroupId)
		)
}));

const GROUP_ID = 1;

describe('fetchDailyStats', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});
	it('wraps the db call in the cached-supabase-fetch utility', async () => {
		setMockResponse('hello');
		await fetchDailyStats(GROUP_ID);
		expect(cachedSupabaseFetch).toHaveBeenCalledOnce();
		expect(cachedSupabaseFetch).toHaveBeenCalledWith(
			'daily-core-stats',
			GROUP_ID,
			uncachedDailyCoreStats
		);
	});
	it('wraps the db call in the fetchAllPaginatedRows utility appropriately', async () => {
		setMockResponse('hello');
		await fetchDailyStats(GROUP_ID);
		expect(fetchAllPaginatedRows).toHaveBeenCalledOnce();
		// ensures the range values from fetchAllPaginatedRows actually get used in the underlying query
		expect(mockRange).toHaveBeenCalledWith(10, 20);
	});
	it('calls the core_stats rpc grouped and ordered by species and day', async () => {
		setMockResponse('hello');
		await fetchDailyStats(GROUP_ID);
		expect(mockOrder).toHaveBeenCalledTimes(2);
		expect(mockOrder).toHaveBeenCalledWith('time_period');
		expect(mockOrder).toHaveBeenCalledWith('species_name');
	});
	it('returns the result of the core_stats rpc call', async () => {
		setMockResponse('hello');
		const result = await fetchDailyStats(GROUP_ID);
		expect(result).toBe('hello');
	});
});
