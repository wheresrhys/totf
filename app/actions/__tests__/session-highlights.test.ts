import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';
import type { StatsPerDayAndSpeciesResult } from '@/app/models/db';

// The action returns each highlight rendered as <li key={sentence}>{sentence}</li>
function sentencesOf(highlights: ReactElement[]): string[] {
	return highlights.map(
		(element) => (element.props as { children: string }).children
	);
}

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
let rpcPages: StatsPerDayAndSpeciesResult[][];
let sessionPages: { visit_date: string }[][];

function statsRow(
	species_name: string,
	visit_date: string,
	encounter_count: number
): StatsPerDayAndSpeciesResult {
	return {
		species_name,
		visit_date,
		encounter_count,
		weighed_birds_count: 0,
		min_weight: 0,
		max_weight: 0
	};
}

function pageForRange(pages: unknown[][], fromRow: number) {
	return Promise.resolve({
		data: pages[fromRow / PAGE_SIZE] ?? [],
		error: null
	});
}

const mockRpcOrder = vi.fn();
const mockRpcRange = vi.fn();
// The paginated rpc (stats_per_day_and_species) returns a query builder;
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
			statsRow('Robin', SESSION_DATE, 74),
			statsRow('Robin', '2022-05-01', 30),
			statsRow('Wren', '2022-05-01', 30)
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
		// Two rpc calls: stats_per_day_and_species (paginated) and
		// long_absence_retraps (non-paginated)
		expect(mockRpc).toHaveBeenCalledTimes(2);
		const rpcFunctionNames = mockRpc.mock.calls.map(
			(call) => (call as [string, unknown])[0]
		);
		expect(rpcFunctionNames).toContain('stats_per_day_and_species');
		expect(rpcFunctionNames).toContain('long_absence_retraps');
		const [, statsArgs] = mockRpc.mock.calls.find(
			(call) => (call as [string, unknown])[0] === 'stats_per_day_and_species'
		) as [string, { ringing_group_filter: number }];
		expect(statsArgs.ringing_group_filter).toBe(GROUP_ID);
		// Every derived highlight, rendered in the machine's fixed type-priority
		// order — a like-for-like guard on both the copy and the ordering
		expect(sentencesOf(highlights)).toEqual([
			'Busiest session ever — 74 birds',
			'Quietest session since 1 May 2022 — 74 birds',
			'Record day for Robin — 74 caught, the most ever',
			'Rarely recorded — Robin seen on only 2 days ever'
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
			Array.from({ length: PAGE_SIZE }, (_, index) =>
				statsRow(`Species ${index}`, '2022-05-01', 1)
			),
			[statsRow('Robin', SESSION_DATE, 2000)]
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
		expect(sentencesOf(highlights)).toContain(
			'Busiest session ever — 2000 birds'
		);
	});

	it('includes weight record highlights in the fan-out', async () => {
		rpcPages = [
			[
				{
					species_name: 'Blue Tit',
					visit_date: SESSION_DATE,
					encounter_count: 5,
					weighed_birds_count: 5,
					min_weight: 11,
					max_weight: 13.1
				},
				{
					species_name: 'Blue Tit',
					visit_date: '2022-05-01',
					encounter_count: 4,
					weighed_birds_count: 4,
					min_weight: 10.5,
					max_weight: 13.0
				}
			]
		];
		const fetchSessionHighlights = await importFetchSessionHighlights();
		const highlights = await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		expect(sentencesOf(highlights)).toContain(
			'Heaviest Blue Tit ever weighed — 13.1g'
		);
	});

	it('includes rare-species highlights in the fan-out', async () => {
		rpcPages = [
			[
				statsRow('Firecrest', SESSION_DATE, 1),
				statsRow('Firecrest', '2022-05-01', 1)
			]
		];
		sessionPages = [
			[{ visit_date: '2022-05-01' }, { visit_date: SESSION_DATE }]
		];
		const fetchSessionHighlights = await importFetchSessionHighlights();
		const highlights = await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		expect(sentencesOf(highlights)).toContain(
			'Rarely recorded — Firecrest seen on only 2 days ever'
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
		// stats_per_day_and_species is cached (called once), but
		// long_absence_retraps is per-session (called twice)
		const metricsCalls = mockRpc.mock.calls.filter(
			(call) => (call as [string])[0] === 'stats_per_day_and_species'
		);
		expect(metricsCalls).toHaveLength(1);
		expect(mockEq).toHaveBeenCalledTimes(1);
		// the cached blob still serves other session dates — the 2022 session
		// holds the most-varied record (2 species vs 1 on the 2024 day)
		expect(sentencesOf(secondResult)).toEqual([
			'Most varied session ever — 2 species'
		]);
	});
});
