import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CoreStatsResult } from '@/app/models/db';
import { makeQueryChain } from '@/app/__tests__/helpers/query-chain';
import { fetchPayOffStats } from '../pay-off-stats';
import type { ViewedGroup } from '@/app/lib/group-slug';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

const GROUP_ID = 7;
const viewedGroup: ViewedGroup = { id: GROUP_ID, slug: 'alpha' };

// Hand-built `SimpleStatsCache` row (group-wide, no species dimension) —
// no cache-table snapshot fixture exists yet (see ticket #1206's "Out of
// scope"), so this stands in for one cached yearly/monthly cell.
const cacheRow = {
	time_period: '2023-01-01',
	session_count: 12,
	total_effort: '48:00:00',
	effort_per_session: '04:00:00',
	effort_per_encounter: '00:30:00',
	avg_encounters_per_session: 8.5,
	max_per_session: 20,
	species_count: 5,
	bird_count: 90,
	encounter_count: 102,
	new_bird_count: 60,
	pullus_bird_count: 1,
	juv_bird_count: 20,
	postjuv_bird_count: 30,
	adult_bird_count: 35,
	unknown_age_bird_count: 4,
	pullus_enc_count: 1,
	juv_enc_count: 22,
	postjuv_enc_count: 34,
	adult_enc_count: 40,
	unknown_age_enc_count: 5,
	max_new_per_session: 9
};

const expectedCoreStatsRow: CoreStatsResult = {
	species_name: '',
	time_period: '2023-01-01',
	session_count: 12,
	total_effort: '48:00:00',
	effort_per_session: '04:00:00',
	effort_per_encounter: '00:30:00',
	avg_encounters_per_session: 8.5,
	max_per_session: 20,
	species_count: 5,
	bird_count: 90,
	encounter_count: 102,
	new_bird_count: 60,
	pullus_bird_count: 1,
	juv_bird_count: 20,
	postjuv_bird_count: 30,
	adult_bird_count: 35,
	unknown_age_bird_count: 4,
	pullus_enc_count: 1,
	juv_enc_count: 22,
	postjuv_enc_count: 34,
	adult_enc_count: 40,
	unknown_age_enc_count: 5,
	max_new_per_session: 9
};

/**
 * `fetchPayOffStats` fires its yearly and monthly `SimpleStatsCache` queries
 * via `Promise.all`, both against `.from('SimpleStatsCache')` — so the two
 * calls are told apart positionally (`from.mockImplementationOnce` queued in
 * call order: yearly first, then monthly), not by table name.
 */
function makeClient(yearlyRows: unknown, monthlyRows: unknown) {
	const { chain: yearlyChain } = makeQueryChain(yearlyRows);
	const { chain: monthlyChain } = makeQueryChain(monthlyRows);
	const from = vi
		.fn()
		.mockImplementationOnce(() => yearlyChain)
		.mockImplementationOnce(() => monthlyChain);
	mockGetAuthenticatedSupabaseClient.mockResolvedValue({ from });
	return { yearlyChain, monthlyChain, from };
}

describe('fetchPayOffStats — fetches yearly and monthly effort stats from the cache', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('queries SimpleStatsCache filtered to the year temporal unit for yearly and month for monthly', async () => {
		const { yearlyChain, monthlyChain, from } = makeClient(
			[cacheRow],
			[cacheRow]
		);

		await fetchPayOffStats(viewedGroup);

		expect(from).toHaveBeenCalledWith('SimpleStatsCache');
		expect(yearlyChain.eq).toHaveBeenCalledWith('group_id', GROUP_ID);
		expect(yearlyChain.eq).toHaveBeenCalledWith('temporal_unit', 'year');
		expect(monthlyChain.eq).toHaveBeenCalledWith('group_id', GROUP_ID);
		expect(monthlyChain.eq).toHaveBeenCalledWith('temporal_unit', 'month');
	});

	it('maps each cache row into a CoreStatsResult entry', async () => {
		makeClient([cacheRow], [cacheRow]);

		const stats = await fetchPayOffStats(viewedGroup);

		expect(stats).toEqual({
			yearly: [expectedCoreStatsRow],
			monthly: [expectedCoreStatsRow]
		});
	});

	it('returns null if either query errors', async () => {
		makeClient(null, [cacheRow]);

		const stats = await fetchPayOffStats(viewedGroup);

		expect(stats).toBeNull();
	});
});
