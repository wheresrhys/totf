import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StatsPerDayAndSpeciesResult } from '@/app/models/db';
import type { SessionHighlight } from '@/app/models/session-highlights';
import { renderHighlight } from '@/app/components/session-highlight-renderers';

// The action returns plain highlight data; rendering each gives the
// <li key={sentence}>{sentence}</li> whose sentence we assert on
function sentencesOf(highlights: SessionHighlight[]): string[] {
	return highlights.map(
		(highlight) =>
			(renderHighlight(highlight).props as { children: string }).children
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
const mockSessionsEq = vi.fn();
const mockSessionsSelect = vi.fn(() => ({ eq: mockSessionsEq }));

let statsVersion = 100;
const mockEncountersLimit = vi.fn();
const mockEncountersOrder = vi.fn(() => ({ limit: mockEncountersLimit }));
const mockEncountersEq = vi.fn(() => ({ order: mockEncountersOrder }));
const mockEncountersSelect = vi.fn(() => ({ eq: mockEncountersEq }));

const mockFrom = vi.fn((table: string) => {
	if (table === 'Sessions') {
		return { select: mockSessionsSelect };
	}
	// Encounters — version query
	return { select: mockEncountersSelect };
});

// Keep a single mockEq/mockSelect alias so existing tests that reference them
// still work (they only call from('Sessions') paths).
const mockEq = mockSessionsEq;
const mockSelect = mockSessionsSelect;

// the action memoises the stats blob at module scope, so each test
// imports a fresh copy of the module
async function importFetchSessionHighlights() {
	vi.resetModules();
	const { fetchSessionHighlights } = await import('../session-highlights');
	return fetchSessionHighlights;
}

beforeEach(() => {
	vi.clearAllMocks();
	statsVersion = 100;
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
	// Sessions from() chain
	mockSessionsEq.mockReturnValue(sessionsQueryBuilder);
	mockSessionsOrder.mockReturnValue(sessionsQueryBuilder);
	mockSessionsRange.mockImplementation((fromRow: number) =>
		pageForRange(sessionPages, fromRow)
	);
	// Encounters from() chain — version query
	mockEncountersLimit.mockImplementation(() =>
		Promise.resolve({ data: [{ id: statsVersion }], error: null })
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
		// Every derived highlight, ordered by the machine: the scoped record block
		// (busiest all-time, then the all-time species record) leads, the
		// quietest-since comparison follows, then the rare-species mention
		expect(sentencesOf(highlights)).toEqual([
			'Busiest session ever — 74 birds',
			'Record day for Robin — 74 caught, the most ever',
			'Quietest session since 1 May 2022 — 74 birds',
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

	it('serves cached stats when the data version is unchanged', async () => {
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
		expect(mockSessionsEq).toHaveBeenCalledTimes(1);
		// version query is run on each call
		expect(mockEncountersLimit).toHaveBeenCalledTimes(2);
		// the cached blob still serves other session dates — the 2022 session
		// holds the most-varied record (2 species vs 1 on the 2024 day)
		expect(sentencesOf(secondResult)).toEqual([
			'Most varied session ever — 2 species'
		]);
	});

	it('re-fetches stats when the data version changes', async () => {
		const fetchSessionHighlights = await importFetchSessionHighlights();
		statsVersion = 100;
		await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		statsVersion = 101;
		await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		const metricsCalls = mockRpc.mock.calls.filter(
			(call) => (call as [string])[0] === 'stats_per_day_and_species'
		);
		expect(metricsCalls).toHaveLength(2);
	});

	it('queries max Encounters id for the viewed group', async () => {
		const fetchSessionHighlights = await importFetchSessionHighlights();
		await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		expect(mockFrom).toHaveBeenCalledWith('Encounters');
		expect(mockEncountersSelect).toHaveBeenCalledWith('id');
		expect(mockEncountersEq).toHaveBeenCalledWith('ringing_group_id', GROUP_ID);
		expect(mockEncountersOrder).toHaveBeenCalledWith('id', {
			ascending: false
		});
		expect(mockEncountersLimit).toHaveBeenCalledWith(1);
	});

	it('treats a group with no encounters as version 0', async () => {
		mockEncountersLimit.mockResolvedValue({ data: [], error: null });
		const fetchSessionHighlights = await importFetchSessionHighlights();
		await fetchSessionHighlights({
			date: SESSION_DATE,
			viewedGroupId: GROUP_ID
		});
		const secondResult = await fetchSessionHighlights({
			date: '2022-05-01',
			viewedGroupId: GROUP_ID
		});
		// stats_per_day_and_species should be cached (called once)
		const metricsCalls = mockRpc.mock.calls.filter(
			(call) => (call as [string])[0] === 'stats_per_day_and_species'
		);
		expect(metricsCalls).toHaveLength(1);
		expect(sentencesOf(secondResult)).toEqual([
			'Most varied session ever — 2 species'
		]);
	});
});
