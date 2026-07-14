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
const PAGE_SIZE = 1000;

// Queries are paginated (PostgREST caps responses at 1000 rows), so the
// mock builders serve rows page by page from these arrays
let rpcPages: {
	species_name: string;
	visit_date: string;
	metric_value: number;
}[][];
let sessionPages: { visit_date: string }[][];

function pageForRange(pages: unknown[][], fromRow: number) {
	return Promise.resolve({
		data: pages[fromRow / PAGE_SIZE] ?? [],
		error: null
	});
}

const mockRpcOrder = vi.fn();
const mockRpcRange = vi.fn();
// The paginated rpc (metrics_by_period_and_species) returns a query builder;
// the non-paginated rpc (long_absence_retraps) returns a thenable.
const paginatedRpcQueryBuilder = { order: mockRpcOrder, range: mockRpcRange };
const mockLongAbsenceRpcResult = Promise.resolve({ data: [], error: null });
const mockRpc = vi.fn();

const mockSessionsOrder = vi.fn();
const mockSessionsRange = vi.fn();
const sessionsQueryBuilder = {
	order: mockSessionsOrder,
	range: mockSessionsRange
};
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
	vi.clearAllMocks();
	rpcPages = [
		[
			{ species_name: 'Robin', visit_date: SESSION_DATE, metric_value: 74 },
			{ species_name: 'Robin', visit_date: '2022-05-01', metric_value: 30 },
			{ species_name: 'Wren', visit_date: '2022-05-01', metric_value: 30 }
		]
	];
	sessionPages = [[{ visit_date: '2022-05-01' }, { visit_date: SESSION_DATE }]];
	// Route rpc calls by function name: paginated vs non-paginated
	mockRpc.mockImplementation((functionName: string) => {
		if (functionName === 'long_absence_retraps') {
			return mockLongAbsenceRpcResult;
		}
		return paginatedRpcQueryBuilder;
	});
	mockRpcOrder.mockReturnValue(paginatedRpcQueryBuilder);
	mockRpcRange.mockImplementation((fromRow: number) =>
		pageForRange(rpcPages, fromRow)
	);
	mockEq.mockReturnValue(sessionsQueryBuilder);
	mockSessionsOrder.mockReturnValue(sessionsQueryBuilder);
	mockSessionsRange.mockImplementation((fromRow: number) =>
		pageForRange(sessionPages, fromRow)
	);
	mockGetAuthenticatedSupabaseClient.mockResolvedValue({
		rpc: mockRpc,
		from: mockFrom
	});
});

describe('fetchSessionHighlights', () => {
	it('fetches day-species metrics and long-absence retraps in parallel', async () => {
		const fetchSessionHighlights = await importFetchSessionHighlights();
		const highlights = await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		// Two rpc calls: metrics_by_period_and_species (paginated) and
		// long_absence_retraps (non-paginated)
		expect(mockRpc).toHaveBeenCalledTimes(2);
		const rpcFunctionNames = mockRpc.mock.calls.map(
			(call) => (call as [string, unknown])[0]
		);
		expect(rpcFunctionNames).toContain('metrics_by_period_and_species');
		expect(rpcFunctionNames).toContain('long_absence_retraps');
		const [, metricsArgs] = mockRpc.mock.calls.find(
			(call) =>
				(call as [string, unknown])[0] === 'metrics_by_period_and_species'
		) as [
			string,
			{
				temporal_unit: string;
				metric_name: string;
				filters: TopMetricsFilterParams;
			}
		];
		expect(metricsArgs.temporal_unit).toBe('day');
		expect(metricsArgs.metric_name).toBe('encounters');
		expect(metricsArgs.filters.ringing_group_filter).toBe(GROUP_ID);
		expect(highlights).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: 'session-total-record',
					metric: 'encounters',
					scope: 'all-time',
					value: 74
				})
			])
		);
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

	it('requests deterministic ordering for paginated queries', async () => {
		const fetchSessionHighlights = await importFetchSessionHighlights();
		await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		expect(mockRpcOrder).toHaveBeenCalledWith('visit_date');
		expect(mockRpcOrder).toHaveBeenCalledWith('species_name');
		expect(mockRpcRange).toHaveBeenCalledWith(0, PAGE_SIZE - 1);
		expect(mockSessionsOrder).toHaveBeenCalledWith('visit_date');
		expect(mockSessionsRange).toHaveBeenCalledWith(0, PAGE_SIZE - 1);
	});

	it('derives highlights from rows beyond the first page', async () => {
		rpcPages = [
			Array.from({ length: PAGE_SIZE }, (_, index) => ({
				species_name: `Species ${index}`,
				visit_date: '2022-05-01',
				metric_value: 1
			})),
			[
				{
					species_name: 'Robin',
					visit_date: SESSION_DATE,
					metric_value: 2000
				}
			]
		];
		const fetchSessionHighlights = await importFetchSessionHighlights();
		const highlights = await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		expect(mockRpcRange).toHaveBeenCalledTimes(2);
		expect(mockRpcRange).toHaveBeenNthCalledWith(
			2,
			PAGE_SIZE,
			2 * PAGE_SIZE - 1
		);
		expect(highlights).toContainEqual(
			expect.objectContaining({
				type: 'session-total-record',
				metric: 'encounters',
				scope: 'all-time',
				value: 2000
			})
		);
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
		// metrics_by_period_and_species is cached (called once), but
		// long_absence_retraps is per-session (called twice)
		const metricsCalls = mockRpc.mock.calls.filter(
			(call) => (call as [string])[0] === 'metrics_by_period_and_species'
		);
		expect(metricsCalls).toHaveLength(1);
		expect(mockEq).toHaveBeenCalledTimes(1);
		// the cached blob still serves other session dates — the 2022 session
		// holds the most-varied record (2 species vs 1 on the 2024 day)
		expect(secondResult).toEqual([
			expect.objectContaining({
				type: 'session-total-record',
				metric: 'species',
				scope: 'all-time',
				value: 2
			})
		]);
	});
});
