import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StatsPerDayAndSpeciesResult } from '@/app/models/db';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('../group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

const GROUP_ID = 1;
const OTHER_GROUP_ID = 2;
const PAGE_SIZE = 1000;
const TTL_MS = 60 * 60 * 1000;

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
		juv_count: 0,
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
const paginatedRpcQueryBuilder = { order: mockRpcOrder, range: mockRpcRange };
const mockRpc = vi.fn(() => paginatedRpcQueryBuilder);

const mockSessionsOrder = vi.fn();
const mockSessionsRange = vi.fn();
const mockSessionsEq = vi.fn();
// eq is also on the builder itself so it self-chains — fetchSessionStats
// calls .eq() twice (ringing_group_id, then session_type) before .order()
const sessionsQueryBuilder = {
	eq: mockSessionsEq,
	order: mockSessionsOrder,
	range: mockSessionsRange
};
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

// the module memoises the stats blob at module scope, so each test imports a
// fresh copy of the module
async function importFetchSessionStats() {
	vi.resetModules();
	const { fetchSessionStats } = await import('../underlying-stats');
	return fetchSessionStats;
}

beforeEach(() => {
	vi.clearAllMocks();
	statsVersion = 100;
	rpcPages = [
		[
			statsRow('Robin', '2024-09-15', 74),
			statsRow('Robin', '2022-05-01', 30),
			statsRow('Wren', '2022-05-01', 30)
		]
	];
	sessionPages = [[{ visit_date: '2022-05-01' }, { visit_date: '2024-09-15' }]];
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

afterEach(() => {
	vi.restoreAllMocks();
});

describe('fetchSessionStats', () => {
	it('fetches day-species stats and session dates for a group on a cold cache', async () => {
		const fetchSessionStats = await importFetchSessionStats();

		const stats = await fetchSessionStats(GROUP_ID);

		expect(mockRpc).toHaveBeenCalledWith('stats_per_day_and_species', {
			ringing_group_filter: GROUP_ID
		});
		expect(mockFrom).toHaveBeenCalledWith('Sessions');
		expect(mockSessionsEq).toHaveBeenCalledWith('ringing_group_id', GROUP_ID);
		expect(mockSessionsEq).toHaveBeenCalledWith('session_type', 'FULL_GROWN');
		expect(stats.daySpeciesStats).toEqual(rpcPages[0]);
		expect(stats.sessionDates).toEqual(['2022-05-01', '2024-09-15']);
	});

	it('returns the cached result on a second call when the stats version is unchanged', async () => {
		const fetchSessionStats = await importFetchSessionStats();

		await fetchSessionStats(GROUP_ID);
		await fetchSessionStats(GROUP_ID);

		expect(mockRpc).toHaveBeenCalledTimes(1);
		// version query still runs on each call
		expect(mockEncountersLimit).toHaveBeenCalledTimes(2);
	});

	it('re-fetches when the stats version (max Encounters.id) has advanced since the cached entry', async () => {
		const fetchSessionStats = await importFetchSessionStats();

		await fetchSessionStats(GROUP_ID);
		statsVersion = 101;
		await fetchSessionStats(GROUP_ID);

		expect(mockRpc).toHaveBeenCalledTimes(2);
	});

	it('re-fetches when the cached entry has passed its TTL even if the version is unchanged', async () => {
		const fetchSessionStats = await importFetchSessionStats();
		const now = Date.now();
		const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

		await fetchSessionStats(GROUP_ID);
		dateNowSpy.mockReturnValue(now + TTL_MS + 1);
		await fetchSessionStats(GROUP_ID);

		expect(mockRpc).toHaveBeenCalledTimes(2);
	});

	it('paginates through fetchAllPaginatedRows results beyond a single page', async () => {
		rpcPages = [
			Array.from({ length: PAGE_SIZE }, (_, index) =>
				statsRow(`Species ${index}`, '2022-05-01', 1)
			),
			[statsRow('Robin', '2024-09-15', 2000)]
		];
		sessionPages = [
			[{ visit_date: '2022-05-01' }, { visit_date: '2024-09-15' }]
		];
		const fetchSessionStats = await importFetchSessionStats();

		const stats = await fetchSessionStats(GROUP_ID);

		expect(mockRpcRange).toHaveBeenCalledTimes(2);
		expect(mockRpcRange).toHaveBeenNthCalledWith(
			2,
			PAGE_SIZE,
			2 * PAGE_SIZE - 1
		);
		expect(stats.daySpeciesStats).toHaveLength(PAGE_SIZE + 1);
	});

	it('keeps separate cache entries per viewedGroupId', async () => {
		const fetchSessionStats = await importFetchSessionStats();

		await fetchSessionStats(GROUP_ID);
		await fetchSessionStats(OTHER_GROUP_ID);

		expect(mockRpc).toHaveBeenCalledTimes(2);
		expect(mockRpc).toHaveBeenCalledWith('stats_per_day_and_species', {
			ringing_group_filter: GROUP_ID
		});
		expect(mockRpc).toHaveBeenCalledWith('stats_per_day_and_species', {
			ringing_group_filter: OTHER_GROUP_ID
		});
		// each group's version query is scoped by ringing_group_id
		expect(mockEncountersEq).toHaveBeenCalledWith('ringing_group_id', GROUP_ID);
		expect(mockEncountersEq).toHaveBeenCalledWith(
			'ringing_group_id',
			OTHER_GROUP_ID
		);
	});
});
