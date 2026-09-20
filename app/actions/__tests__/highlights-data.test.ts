import { describe, it, expect, vi, beforeEach } from 'vitest';

import { cachedSupabaseFetch } from '@/app/lib/cached-supabase-fetch';
import { fetchAllPaginatedRows } from '@/lib/supabase';
import {
	fetchDailyStats,
	uncachedDailyCoreStats,
	uncachedDailySpeciesCoreStats
} from '../highlights-data';

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
		mockRange.mockReset();
		mockRange.mockResolvedValue({ data: [], error: null });
	});
	it('wraps the db calls in the cached-supabase-fetch utility', async () => {
		await fetchDailyStats(GROUP_ID);
		expect(cachedSupabaseFetch).toHaveBeenCalledTimes(2);
		expect(cachedSupabaseFetch).toHaveBeenCalledWith(
			'daily-core-stats',
			GROUP_ID,
			uncachedDailyCoreStats
		);
		expect(cachedSupabaseFetch).toHaveBeenCalledWith(
			'daily-species-core-stats',
			GROUP_ID,
			uncachedDailySpeciesCoreStats
		);
	});
	it('wraps the db calls in the fetchAllPaginatedRows utility appropriately', async () => {
		await fetchDailyStats(GROUP_ID);
		expect(fetchAllPaginatedRows).toHaveBeenCalledTimes(2);
		// ensures the range values from fetchAllPaginatedRows actually get used in the underlying query
		expect(mockRange).toHaveBeenCalledTimes(2);
		expect(mockRange).toHaveBeenCalledWith(10, 20);
	});
	it('calls the core_stats rpc grouped and ordered by species and day', async () => {
		await fetchDailyStats(GROUP_ID);
		expect(mockOrder).toHaveBeenCalledTimes(4);
		expect(mockOrder).toHaveBeenCalledWith('time_period');
		expect(mockOrder).toHaveBeenCalledWith('species_name');
	});
	it('calls the core_stats rpc twice, grouped by species and ungrouped', async () => {
		await fetchDailyStats(GROUP_ID);
		expect(mockRpc).toHaveBeenCalledTimes(2);
		expect(mockRpc).toHaveBeenCalledWith('core_stats', {
			ringing_group_filter: GROUP_ID,
			group_by_time_period: 'day'
		});
		expect(mockRpc).toHaveBeenCalledWith('core_stats', {
			ringing_group_filter: GROUP_ID,
			group_by_species: true,
			group_by_time_period: 'day'
		});
	});
	it('returns the result of the core_stats rpc call', async () => {
		mockRange.mockResolvedValueOnce({ data: 'day' });
		mockRange.mockResolvedValueOnce({ data: 'species-day' });
		const result = await fetchDailyStats(GROUP_ID);
		expect(result).toStrictEqual({ bySpecies: 'species-day', overall: 'day' });
	});
});
