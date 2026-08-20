import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
	AggregateStatsResult,
	StatsPerDayAndSpeciesResult
} from '@/app/models/db';
import payOffStatsFixture from '../../test-fixtures/snapshots/fetchPayOffStats.beta.json';

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

// The module memoises each stats blob (session/year/month) at module scope
// via its own cache Map, so each test imports a fresh copy of the module —
// shared by fetchSessionStats, fetchYearStats and fetchMonthStats tests
// alike since they all reuse the same fetchWithVersionCache mechanism.
async function importUnderlyingStats() {
	vi.resetModules();
	return import('../underlying-stats');
}

async function importFetchSessionStats() {
	const { fetchSessionStats } = await importUnderlyingStats();
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

// fetchYearStats/fetchMonthStats call aggregate_stats directly and
// `.then(catchSupabaseErrors)` the result — no pagination chain — but they
// share fetchSessionStats' version-checked/TTL-backed cache (via
// fetchWithVersionCache), so their mock client still needs a working
// `from` chain for the Encounters version query: reuse the same mockFrom /
// statsVersion scaffolding used for fetchSessionStats above.
const yearlyRows =
	payOffStatsFixture.yearly as unknown as AggregateStatsResult[];
const monthlyRows =
	payOffStatsFixture.monthly as unknown as AggregateStatsResult[];

function makeAggregateStatsClient(response: {
	data: unknown;
	error: { message: string } | null;
}) {
	const mockRpc = vi.fn().mockReturnValue(Promise.resolve(response));
	return { client: { rpc: mockRpc, from: mockFrom }, mockRpc };
}

describe('fetchYearStats', () => {
	it('calls aggregate_stats with group_by_time_period "year" and group_by_species true', async () => {
		const { fetchYearStats } = await importUnderlyingStats();
		const { client, mockRpc } = makeAggregateStatsClient({
			data: yearlyRows,
			error: null
		});
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);

		const result = await fetchYearStats(GROUP_ID);

		expect(mockRpc).toHaveBeenCalledWith('aggregate_stats', {
			ringing_group_filter: GROUP_ID,
			group_by_species: true,
			group_by_time_period: 'year'
		});
		expect(result).toEqual(yearlyRows);
	});

	it('scopes the call to the given viewedGroupId via ringing_group_filter', async () => {
		const { fetchYearStats } = await importUnderlyingStats();
		const { client, mockRpc } = makeAggregateStatsClient({
			data: yearlyRows,
			error: null
		});
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);

		await fetchYearStats(OTHER_GROUP_ID);

		expect(mockRpc).toHaveBeenCalledWith(
			'aggregate_stats',
			expect.objectContaining({ ringing_group_filter: OTHER_GROUP_ID })
		);
	});

	it('passes no from_date/to_date, returning one row per year with data', async () => {
		const { fetchYearStats } = await importUnderlyingStats();
		const { client, mockRpc } = makeAggregateStatsClient({
			data: yearlyRows,
			error: null
		});
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);

		const result = await fetchYearStats(GROUP_ID);

		const callArgs = mockRpc.mock.calls[0][1];
		expect(callArgs).not.toHaveProperty('from_date');
		expect(callArgs).not.toHaveProperty('to_date');
		expect(result).toHaveLength(yearlyRows.length);
	});

	// The ticket's spec describes this as "returns null when the RPC call
	// errors", but the shared catchSupabaseErrors helper (lib/supabase.ts)
	// always throws on a Supabase error rather than returning null — this
	// test asserts that actual (pre-existing, unchanged) behaviour instead.
	it('throws when the RPC call errors', async () => {
		const { fetchYearStats } = await importUnderlyingStats();
		const { client } = makeAggregateStatsClient({
			data: null,
			error: { message: 'boom' }
		});
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);

		await expect(fetchYearStats(GROUP_ID)).rejects.toThrow(
			'Failed to fetch data: boom'
		);
	});

	// Mirrors fetchSessionStats' cache-hit/version-bump/TTL-expiry/per-group
	// tests above — fetchYearStats reuses the exact same
	// fetchWithVersionCache mechanism, just keyed off its own
	// yearStatsCache Map.
	describe('caching', () => {
		it('returns the cached result on a second call when the stats version is unchanged', async () => {
			const { fetchYearStats } = await importUnderlyingStats();
			const { client, mockRpc } = makeAggregateStatsClient({
				data: yearlyRows,
				error: null
			});
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);

			await fetchYearStats(GROUP_ID);
			await fetchYearStats(GROUP_ID);

			expect(mockRpc).toHaveBeenCalledTimes(1);
			// version query still runs on each call
			expect(mockEncountersLimit).toHaveBeenCalledTimes(2);
		});

		it('re-fetches when the stats version (max Encounters.id) has advanced since the cached entry', async () => {
			const { fetchYearStats } = await importUnderlyingStats();
			const { client, mockRpc } = makeAggregateStatsClient({
				data: yearlyRows,
				error: null
			});
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);

			await fetchYearStats(GROUP_ID);
			statsVersion = 101;
			await fetchYearStats(GROUP_ID);

			expect(mockRpc).toHaveBeenCalledTimes(2);
		});

		it('re-fetches when the cached entry has passed its TTL even if the version is unchanged', async () => {
			const { fetchYearStats } = await importUnderlyingStats();
			const { client, mockRpc } = makeAggregateStatsClient({
				data: yearlyRows,
				error: null
			});
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
			const now = Date.now();
			const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

			await fetchYearStats(GROUP_ID);
			dateNowSpy.mockReturnValue(now + TTL_MS + 1);
			await fetchYearStats(GROUP_ID);

			expect(mockRpc).toHaveBeenCalledTimes(2);
		});

		it('keeps separate cache entries per viewedGroupId', async () => {
			const { fetchYearStats } = await importUnderlyingStats();
			const { client, mockRpc } = makeAggregateStatsClient({
				data: yearlyRows,
				error: null
			});
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);

			await fetchYearStats(GROUP_ID);
			await fetchYearStats(OTHER_GROUP_ID);

			expect(mockRpc).toHaveBeenCalledTimes(2);
		});

		// The disambiguation the reviewer flagged: a year lookup and a month
		// lookup for the same group must not collide on the same cache
		// entry, even though both share a viewedGroupId-keyed cache shape.
		it('does not share a cache entry with fetchMonthStats for the same group', async () => {
			const { fetchYearStats, fetchMonthStats } = await importUnderlyingStats();
			const { client, mockRpc } = makeAggregateStatsClient({
				data: yearlyRows,
				error: null
			});
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);

			await fetchYearStats(GROUP_ID);
			await fetchMonthStats(GROUP_ID);

			expect(mockRpc).toHaveBeenCalledTimes(2);
			expect(mockRpc).toHaveBeenCalledWith(
				'aggregate_stats',
				expect.objectContaining({ group_by_time_period: 'year' })
			);
			expect(mockRpc).toHaveBeenCalledWith(
				'aggregate_stats',
				expect.objectContaining({ group_by_time_period: 'month' })
			);
		});
	});
});

describe('fetchMonthStats', () => {
	it('calls aggregate_stats with group_by_time_period "month" and group_by_species true', async () => {
		const { fetchMonthStats } = await importUnderlyingStats();
		const { client, mockRpc } = makeAggregateStatsClient({
			data: monthlyRows,
			error: null
		});
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);

		const result = await fetchMonthStats(GROUP_ID);

		expect(mockRpc).toHaveBeenCalledWith('aggregate_stats', {
			ringing_group_filter: GROUP_ID,
			group_by_species: true,
			group_by_time_period: 'month'
		});
		expect(result).toEqual(monthlyRows);
	});

	it('scopes the call to the given viewedGroupId via ringing_group_filter', async () => {
		const { fetchMonthStats } = await importUnderlyingStats();
		const { client, mockRpc } = makeAggregateStatsClient({
			data: monthlyRows,
			error: null
		});
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);

		await fetchMonthStats(OTHER_GROUP_ID);

		expect(mockRpc).toHaveBeenCalledWith(
			'aggregate_stats',
			expect.objectContaining({ ringing_group_filter: OTHER_GROUP_ID })
		);
	});

	// See the equivalent fetchYearStats test above for why this asserts a
	// throw rather than a null return.
	it('throws when the RPC call errors', async () => {
		const { fetchMonthStats } = await importUnderlyingStats();
		const { client } = makeAggregateStatsClient({
			data: null,
			error: { message: 'boom' }
		});
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);

		await expect(fetchMonthStats(GROUP_ID)).rejects.toThrow(
			'Failed to fetch data: boom'
		);
	});

	// Mirrors fetchYearStats' caching describe block above — same
	// fetchWithVersionCache mechanism, keyed off monthStatsCache.
	describe('caching', () => {
		it('returns the cached result on a second call when the stats version is unchanged', async () => {
			const { fetchMonthStats } = await importUnderlyingStats();
			const { client, mockRpc } = makeAggregateStatsClient({
				data: monthlyRows,
				error: null
			});
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);

			await fetchMonthStats(GROUP_ID);
			await fetchMonthStats(GROUP_ID);

			expect(mockRpc).toHaveBeenCalledTimes(1);
			expect(mockEncountersLimit).toHaveBeenCalledTimes(2);
		});

		it('re-fetches when the stats version (max Encounters.id) has advanced since the cached entry', async () => {
			const { fetchMonthStats } = await importUnderlyingStats();
			const { client, mockRpc } = makeAggregateStatsClient({
				data: monthlyRows,
				error: null
			});
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);

			await fetchMonthStats(GROUP_ID);
			statsVersion = 101;
			await fetchMonthStats(GROUP_ID);

			expect(mockRpc).toHaveBeenCalledTimes(2);
		});

		it('re-fetches when the cached entry has passed its TTL even if the version is unchanged', async () => {
			const { fetchMonthStats } = await importUnderlyingStats();
			const { client, mockRpc } = makeAggregateStatsClient({
				data: monthlyRows,
				error: null
			});
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
			const now = Date.now();
			const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

			await fetchMonthStats(GROUP_ID);
			dateNowSpy.mockReturnValue(now + TTL_MS + 1);
			await fetchMonthStats(GROUP_ID);

			expect(mockRpc).toHaveBeenCalledTimes(2);
		});

		it('keeps separate cache entries per viewedGroupId', async () => {
			const { fetchMonthStats } = await importUnderlyingStats();
			const { client, mockRpc } = makeAggregateStatsClient({
				data: monthlyRows,
				error: null
			});
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);

			await fetchMonthStats(GROUP_ID);
			await fetchMonthStats(OTHER_GROUP_ID);

			expect(mockRpc).toHaveBeenCalledTimes(2);
		});
	});
});
