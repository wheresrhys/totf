import { describe, it, expect, vi, beforeEach } from 'vitest';

import { cachedSupabaseFetch } from '@/app/lib/cached-supabase-fetch';
import { fetchAllPaginatedRows } from '@/lib/supabase';
import {
	getStatsByTemporalUnit,
	fetchGroupEffortHistory
} from '../stats-cache';

type CachedSupabaseChainCall = { rpcCall: unknown[]; orderCalls: unknown[][] };
let cachedSupabaseChainCalls: CachedSupabaseChainCall[] = [];

const mockOrder = vi.fn();
const mockRange = vi.fn();
const mockRpc = vi.fn();

vi.mock('@/lib/supabase', () => ({
	fetchAllPaginatedRows: vi
		.fn()
		.mockImplementation(
			async (paginatedDataFetcher) => (await paginatedDataFetcher(10, 20))?.data
		)
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

describe('getStatsByTemporalUnit', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		cachedSupabaseChainCalls = [];
		mockRange.mockReset().mockResolvedValue({ data: [], error: null });

		mockRpc.mockReset().mockImplementation((...rpcArgs) => {
			const call: CachedSupabaseChainCall = {
				rpcCall: rpcArgs,
				orderCalls: []
			};
			const builder = {
				order: (...orderArgs: unknown[]) => {
					mockOrder(...orderArgs);
					call.orderCalls.push(orderArgs);
					return builder;
				},
				range: (...rangeArgs: unknown[]) => {
					cachedSupabaseChainCalls.push(call);
					return mockRange(...rangeArgs);
				}
			};
			return builder;
		});
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
		expect(mockRange).toHaveBeenCalledTimes(3);
		expect(mockRange).toHaveBeenCalledWith(10, 20);
	});

	it('calls the core_stats rpc ungrouped by species, ordered by day', async () => {
		await getStatsByTemporalUnit('day', GROUP_ID);
		expect(cachedSupabaseChainCalls).toContainEqual({
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
		expect(cachedSupabaseChainCalls).toContainEqual({
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
		expect(cachedSupabaseChainCalls).toContainEqual({
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
		mockRange.mockResolvedValueOnce({
			data: [{ species_name: null, time_period: 1 }]
		});
		mockRange.mockResolvedValueOnce({
			data: [
				{ species_name: 'cat', time_period: 1 },
				{ species_name: 'dog', time_period: 1 }
			]
		});
		mockRange.mockResolvedValueOnce({
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

describe('fetchGroupEffortHistory', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		cachedSupabaseChainCalls = [];
		mockRange.mockReset().mockResolvedValue({ data: [], error: null });

		mockRpc.mockReset().mockImplementation((...rpcArgs) => {
			const call: CachedSupabaseChainCall = {
				rpcCall: rpcArgs,
				orderCalls: []
			};
			const builder = {
				order: (...orderArgs: unknown[]) => {
					mockOrder(...orderArgs);
					call.orderCalls.push(orderArgs);
					return builder;
				},
				range: (...rangeArgs: unknown[]) => {
					cachedSupabaseChainCalls.push(call);
					return mockRange(...rangeArgs);
				}
			};
			return builder;
		});
	});

	it('calls the core_stats rpc ungrouped by species, month-grouped by time period, scoped to the group', async () => {
		await fetchGroupEffortHistory(GROUP_ID);
		expect(cachedSupabaseFetch).toHaveBeenCalledWith(
			'month-core-stats',
			GROUP_ID,
			expect.any(Function)
		);
		expect(cachedSupabaseChainCalls).toContainEqual({
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
		mockRange.mockResolvedValueOnce({
			data: [{ time_period: '2023-01', total_effort: '05:30:00' }]
		});
		const result = await fetchGroupEffortHistory(GROUP_ID);
		expect(result).toStrictEqual([
			{ time_period: '2023-01', total_effort: '05:30:00' }
		]);
	});
});
