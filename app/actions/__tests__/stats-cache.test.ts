import { describe, it, expect, vi, beforeEach } from 'vitest';

import { cachedSupabaseFetch } from '@/app/lib/cached-supabase-fetch';
import { fetchAllPaginatedRows } from '@/lib/supabase';
import { getStatsByTemporalUnit, fetchCoreStatsByMonth } from '../stats-cache';
import { makeRpcChainRecorder } from '@/app/__tests__/helpers/rpc-recorder';

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
		.mockImplementation((namespace, viewedGroupId, dataFetcher) =>
			dataFetcher(mockSupabaseClient, viewedGroupId)
		)
}));

const GROUP_ID = 1;

describe('getStatsByTemporalUnit', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		recorder = makeRpcChainRecorder();
		mockSupabaseClient.rpc = recorder.rpc;
		recorder.range.mockResolvedValue({ data: [], error: null });
	});

	it('wraps the db calls in the cached-supabase-fetch utility', async () => {
		await getStatsByTemporalUnit('day', GROUP_ID);
		expect(cachedSupabaseFetch).toHaveBeenCalledTimes(3);
		expect(cachedSupabaseFetch).toHaveBeenCalledWith(
			'day-core-stats',
			GROUP_ID,
			expect.any(Function)
		);
		expect(cachedSupabaseFetch).toHaveBeenCalledWith(
			'day-species-core-stats',
			GROUP_ID,
			expect.any(Function)
		);
		expect(cachedSupabaseFetch).toHaveBeenCalledWith(
			'day-species-biometrics-stats',
			GROUP_ID,
			expect.any(Function)
		);
	});
	it('wraps the db calls in the fetchAllPaginatedRows utility appropriately', async () => {
		await getStatsByTemporalUnit('day', GROUP_ID);
		expect(fetchAllPaginatedRows).toHaveBeenCalledTimes(3);
		// ensures the range values from fetchAllPaginatedRows actually get used in the underlying query
		expect(recorder.range).toHaveBeenCalledTimes(3);
		expect(recorder.range).toHaveBeenCalledWith(10, 20);
	});

	it('calls the core_stats rpc ungrouped by species, ordered by day', async () => {
		await getStatsByTemporalUnit('day', GROUP_ID);
		expect(recorder.calls).toContainEqual({
			rpcCall: [
				'core_stats',
				{
					ringing_group_filter: GROUP_ID,
					group_by_species: false,
					group_by_time_period: 'day'
				}
			],
			orderCalls: [['time_period']]
		});
	});
	it('calls the core_stats rpc grouped by species, ordered by day and species', async () => {
		await getStatsByTemporalUnit('day', GROUP_ID);
		expect(recorder.calls).toContainEqual({
			rpcCall: [
				'core_stats',
				{
					ringing_group_filter: GROUP_ID,
					group_by_species: true,
					group_by_time_period: 'day'
				}
			],
			orderCalls: [['time_period'], ['species_name']]
		});
	});
	it('calls the biometrics_stats rpc grouped by species, ordered by day and species', async () => {
		await getStatsByTemporalUnit('day', GROUP_ID);
		expect(recorder.calls).toContainEqual({
			rpcCall: [
				'biometrics_stats',
				{
					ringing_group_filter: GROUP_ID,
					group_by_species: true,
					group_by_time_period: 'day'
				}
			],
			orderCalls: [['time_period'], ['species_name']]
		});
	});

	it('returns the result of the rpc calls', async () => {
		recorder.range.mockResolvedValueOnce({
			data: [{ species_name: null, time_period: 1 }]
		});
		recorder.range.mockResolvedValueOnce({
			data: [
				{ species_name: 'cat', time_period: 1 },
				{ species_name: 'dog', time_period: 1 }
			]
		});
		recorder.range.mockResolvedValueOnce({
			data: [
				{ species_name: 'fish', time_period: 1 },
				{ species_name: 'owl', time_period: 1 }
			]
		});
		const result = await getStatsByTemporalUnit('day', GROUP_ID);
		expect(result).toStrictEqual({
			coreStats: [{ species_name: null, time_period: 1 }],
			coreStatsWithSpecies: [
				{ species_name: 'cat', time_period: 1 },
				{ species_name: 'dog', time_period: 1 }
			],
			biometricsStatsWithSpecies: [
				{ species_name: 'fish', time_period: 1 },
				{ species_name: 'owl', time_period: 1 }
			]
		});
	});
});

describe('fetchCoreStatsByMonth', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		recorder = makeRpcChainRecorder();
		mockSupabaseClient.rpc = recorder.rpc;
		recorder.range.mockResolvedValue({ data: [], error: null });
	});

	it('calls the core_stats rpc ungrouped by species, month-grouped by time period, scoped to the group', async () => {
		await fetchCoreStatsByMonth(GROUP_ID);
		expect(cachedSupabaseFetch).toHaveBeenCalledWith(
			'month-core-stats',
			GROUP_ID,
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
		const result = await fetchCoreStatsByMonth(GROUP_ID);
		expect(result).toStrictEqual([
			{ time_period: '2023-01', total_effort: '05:30:00' }
		]);
	});
});
