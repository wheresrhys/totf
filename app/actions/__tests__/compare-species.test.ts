import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BiometricsStatsResult, CoreStatsResult } from '@/app/models/db';
import { makeQueryChain } from '@/app/__tests__/helpers/query-chain';
import { fetchSpeciesComparisonStats } from '../compare-species';
import type { ViewedGroup } from '@/app/lib/group-slug';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

const GROUP_ID = 7;
const viewedGroup: ViewedGroup = { id: GROUP_ID, slug: 'alpha' };

// Hand-built `SimpleStatsCacheBySpecies` row, matching the retired
// core_stats/biometrics_stats by-species fixtures' Blue Tit values (#1206) —
// no cache-table snapshot fixture exists yet (see ticket #1206's "Out of
// scope"), so this stands in for a group's cached all-time, by-species cell.
// `time_period` is the cache tables' all-time sentinel date
// (`lib/stats-cache-refresh.ts`'s `ALL_TIME_SENTINEL_DATE`) rather than the
// RPC's own literal `null` for this grain.
const blueTitRow = {
	species_id: 42,
	time_period: '0001-01-01',
	species: { species_name: 'Blue Tit' },
	session_count: 4,
	total_effort: '22:00:00',
	effort_per_session: '02:00:00',
	effort_per_encounter: '03:08:34.285714',
	avg_encounters_per_session: 1.75,
	max_per_session: 3,
	species_count: 1,
	bird_count: 6,
	encounter_count: 7,
	new_bird_count: 6,
	pullus_bird_count: 0,
	juv_bird_count: 0,
	postjuv_bird_count: 5,
	adult_bird_count: 0,
	unknown_age_bird_count: 1,
	pullus_enc_count: 0,
	juv_enc_count: 0,
	postjuv_enc_count: 6,
	adult_enc_count: 1,
	unknown_age_enc_count: 0,
	max_new_per_session: 3,
	max_weight: 13.1,
	avg_weight: 11.2,
	min_weight: 9.8,
	median_weight: 10.8,
	max_wing: 68,
	avg_wing: 66.6,
	min_wing: 65,
	median_wing: 67
};

const expectedCoreStatsRow: CoreStatsResult = {
	species_name: 'Blue Tit',
	time_period: '0001-01-01',
	session_count: 4,
	total_effort: '22:00:00',
	effort_per_session: '02:00:00',
	effort_per_encounter: '03:08:34.285714',
	avg_encounters_per_session: 1.75,
	max_per_session: 3,
	species_count: 1,
	bird_count: 6,
	encounter_count: 7,
	new_bird_count: 6,
	pullus_bird_count: 0,
	juv_bird_count: 0,
	postjuv_bird_count: 5,
	adult_bird_count: 0,
	unknown_age_bird_count: 1,
	pullus_enc_count: 0,
	juv_enc_count: 0,
	postjuv_enc_count: 6,
	adult_enc_count: 1,
	unknown_age_enc_count: 0,
	max_new_per_session: 3
};

const expectedBiometricsRow: BiometricsStatsResult = {
	species_name: 'Blue Tit',
	time_period: '0001-01-01',
	max_weight: 13.1,
	avg_weight: 11.2,
	min_weight: 9.8,
	median_weight: 10.8,
	max_wing: 68,
	avg_wing: 66.6,
	min_wing: 65,
	median_wing: 67,
	encounter_count: 7
};

function makeClient(rows: unknown[]) {
	const { chain, record } = makeQueryChain(rows);
	const from = vi.fn(() => chain);
	mockGetAuthenticatedSupabaseClient.mockResolvedValue({ from });
	return { chain, record, from };
}

describe('fetchSpeciesComparisonStats — fetches all three by-species datasets at once', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('queries SimpleStatsCacheBySpecies filtered to the viewed group and the all-time temporal unit', async () => {
		const { chain, from } = makeClient([blueTitRow]);

		await fetchSpeciesComparisonStats(viewedGroup);

		expect(from).toHaveBeenCalledWith('SimpleStatsCacheBySpecies');
		expect(chain.eq).toHaveBeenCalledWith('group_id', GROUP_ID);
		expect(chain.eq).toHaveBeenCalledWith('temporal_unit', 'all-time');
	});

	it('returns each dataset under its own key, mapped from the same cache rows', async () => {
		makeClient([blueTitRow]);

		const stats = await fetchSpeciesComparisonStats(viewedGroup);

		expect(stats).toEqual({
			coreStats: [expectedCoreStatsRow],
			biometricsStats: [expectedBiometricsRow]
		});
	});

	it("resolves each row's species_name from the joined Species relation", async () => {
		const fieldfareRow = {
			...blueTitRow,
			species_id: 99,
			species: { species_name: 'Fieldfare' }
		};
		makeClient([blueTitRow, fieldfareRow]);

		const stats = await fetchSpeciesComparisonStats(viewedGroup);

		expect(stats.coreStats.map((row) => row.species_name)).toEqual([
			'Blue Tit',
			'Fieldfare'
		]);
		expect(stats.biometricsStats.map((row) => row.species_name)).toEqual([
			'Blue Tit',
			'Fieldfare'
		]);
	});
});
