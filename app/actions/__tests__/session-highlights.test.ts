import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TopMetricsFilterParams } from '@/app/models/db';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/lib/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

const SESSION_DATE = '2024-09-15';
const GROUP_ID = 1;

const mockRpc = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

// the action memoises the stats blob at module scope, so each test
// imports a fresh copy of the module
async function importFetchSessionHighlights() {
	vi.resetModules();
	const { fetchSessionHighlights } = await import('../session-highlights');
	return fetchSessionHighlights;
}

beforeEach(() => {
	mockRpc.mockReset();
	mockEq.mockReset();
	mockRpc.mockResolvedValue({
		data: [
			{ species_name: 'Robin', visit_date: SESSION_DATE, metric_value: 74 },
			{ species_name: 'Robin', visit_date: '2022-05-01', metric_value: 30 },
			{ species_name: 'Wren', visit_date: '2022-05-01', metric_value: 30 }
		],
		error: null
	});
	mockEq.mockResolvedValue({
		data: [{ visit_date: '2022-05-01' }, { visit_date: SESSION_DATE }],
		error: null
	});
	mockGetAuthenticatedSupabaseClient.mockResolvedValue({
		rpc: mockRpc,
		from: mockFrom
	});
});

describe('fetchSessionHighlights', () => {
	it('fetches day-species metrics once with the group filter', async () => {
		const fetchSessionHighlights = await importFetchSessionHighlights();
		const highlights = await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		expect(mockRpc).toHaveBeenCalledTimes(1);
		const [functionName, args] = mockRpc.mock.calls[0] as [
			string,
			{
				temporal_unit: string;
				metric_name: string;
				filters: TopMetricsFilterParams;
			}
		];
		expect(functionName).toBe('metrics_by_period_and_species');
		expect(args.temporal_unit).toBe('day');
		expect(args.metric_name).toBe('encounters');
		expect(args.filters.ringing_group_filter).toBe(GROUP_ID);
		expect(highlights).toEqual([
			expect.objectContaining({
				type: 'session-total-record',
				metric: 'encounters',
				scope: 'all-time',
				value: 74
			})
		]);
	});

	it('fetches session dates', async () => {
		const fetchSessionHighlights = await importFetchSessionHighlights();
		await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		expect(mockFrom).toHaveBeenCalledWith('Sessions');
		expect(mockSelect).toHaveBeenCalledWith('visit_date');
		expect(mockEq).toHaveBeenCalledWith('ringing_group_id', GROUP_ID);
	});

	it('returns cached data within the TTL', async () => {
		const fetchSessionHighlights = await importFetchSessionHighlights();
		await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		const secondResult = await fetchSessionHighlights({
			date: '2022-05-01',
			viewedGroupId: GROUP_ID
		});
		expect(mockRpc).toHaveBeenCalledTimes(1);
		expect(mockEq).toHaveBeenCalledTimes(1);
		// the cached blob still serves other session dates
		expect(secondResult).toEqual([]);
	});
});
