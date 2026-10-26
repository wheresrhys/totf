import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

import {
	fetchCoreStatsByMonth,
	getServerCachedStats,
	type StatsCacheRpcName
} from '../stats-cache';
import { makeQueryChain } from '@/app/__tests__/helpers/query-chain';
import type { TemporalUnit } from '@/app/components/shared/StatOutput';
import type { ViewedGroup } from '@/app/lib/group-slug';

const supabaseClientMock = { from: vi.fn() };

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: vi.fn(async () => supabaseClientMock)
}));

const GROUP_ID = 1;
const viewedGroup: ViewedGroup = { id: GROUP_ID, slug: 'alpha' };

// The exact column subsets each rpcName is expected to ask the cache tables
// for, mirroring core_stats_result / biometrics_stats_result minus
// `species_name` (no cache table has that column — it is synthesised from the
// Species embed, or null).
const CORE_STATS_COLUMNS = [
	'time_period',
	'session_count',
	'total_effort',
	'effort_per_session',
	'effort_per_encounter',
	'avg_encounters_per_session',
	'max_per_session',
	'species_count',
	'bird_count',
	'encounter_count',
	'new_bird_count',
	'pullus_bird_count',
	'juv_bird_count',
	'postjuv_bird_count',
	'adult_bird_count',
	'unknown_age_bird_count',
	'pullus_enc_count',
	'juv_enc_count',
	'postjuv_enc_count',
	'adult_enc_count',
	'unknown_age_enc_count',
	'max_new_per_session'
];

const BIOMETRICS_STATS_COLUMNS = [
	'time_period',
	'encounter_count',
	'max_weight',
	'avg_weight',
	'min_weight',
	'median_weight',
	'max_wing',
	'avg_wing',
	'min_wing',
	'median_wing'
];

let queryChain: ReturnType<typeof makeQueryChain>;

function mockStatsCacheRows(rows: unknown[]) {
	queryChain = makeQueryChain(rows);
	supabaseClientMock.from.mockReturnValue(queryChain.chain);
}

function readStats({
	rpcName = 'core_stats',
	fetchDataBySpecies = false,
	temporalUnit = 'day'
}: {
	rpcName?: StatsCacheRpcName;
	fetchDataBySpecies?: boolean;
	temporalUnit?: TemporalUnit;
} = {}) {
	return getServerCachedStats({
		rpcName,
		fetchDataBySpecies,
		temporalUnit,
		viewedGroup
	});
}

const tableRead = () => supabaseClientMock.from.mock.calls[0][0];
const selectedColumns = () => queryChain.record.select?.split(', ');
const filterCalls = () => (queryChain.chain.eq as Mock).mock.calls;
const orderCalls = () => (queryChain.chain.order as Mock).mock.calls;

// A by-species row as PostgREST returns it: the to-one Species embed is a
// single nested object, not an array.
const bySpeciesRow = (speciesName: string, timePeriod: string) => ({
	time_period: timePeriod,
	bird_count: 3,
	Species: { species_name: speciesName }
});

beforeEach(() => {
	vi.clearAllMocks();
	mockStatsCacheRows([]);
});

describe('fetchCoreStatsByMonth', () => {
	it('queries SimpleStatsCache filtered to the group and month, ungrouped by species', async () => {
		await fetchCoreStatsByMonth(viewedGroup);
		expect(tableRead()).toBe('SimpleStatsCache');
		expect(filterCalls()).toStrictEqual([
			['group_id', GROUP_ID],
			['temporal_unit', 'month']
		]);
		expect(selectedColumns()).toStrictEqual(CORE_STATS_COLUMNS);
	});

	it('returns the rows resolved from the table query', async () => {
		mockStatsCacheRows([
			{ time_period: '2023-01-01', total_effort: '05:30:00' }
		]);
		expect(await fetchCoreStatsByMonth(viewedGroup)).toStrictEqual([
			{
				time_period: '2023-01-01',
				total_effort: '05:30:00',
				species_name: null
			}
		]);
	});
});

describe('getServerCachedStats', () => {
	describe('querying the ungrouped table', () => {
		it('selects from SimpleStatsCache filtered by group_id and the given temporal_unit', async () => {
			await readStats({ fetchDataBySpecies: false, temporalUnit: 'year' });
			expect(tableRead()).toBe('SimpleStatsCache');
			expect(filterCalls()).toStrictEqual([
				['group_id', GROUP_ID],
				['temporal_unit', 'year']
			]);
			expect(selectedColumns()).not.toContain('Species(species_name)');
		});

		it('returns rows with species_name set to null', async () => {
			mockStatsCacheRows([
				{ time_period: '2023-01-01', bird_count: 4 },
				{ time_period: '2023-02-01', bird_count: 7 }
			]);
			expect(await readStats({ fetchDataBySpecies: false })).toStrictEqual([
				{ time_period: '2023-01-01', bird_count: 4, species_name: null },
				{ time_period: '2023-02-01', bird_count: 7, species_name: null }
			]);
		});
	});

	describe('querying the by-species table', () => {
		it('selects from SimpleStatsCacheBySpecies with an embedded Species(species_name) join', async () => {
			await readStats({ fetchDataBySpecies: true });
			expect(tableRead()).toBe('SimpleStatsCacheBySpecies');
			expect(selectedColumns()).toStrictEqual([
				...CORE_STATS_COLUMNS,
				'Species(species_name)'
			]);
		});

		it('flattens the embedded species_name onto each returned row', async () => {
			mockStatsCacheRows([
				bySpeciesRow('Blue Tit', '2023-01-01'),
				bySpeciesRow('Wren', '2023-01-01')
			]);
			expect(await readStats({ fetchDataBySpecies: true })).toStrictEqual([
				{ time_period: '2023-01-01', bird_count: 3, species_name: 'Blue Tit' },
				{ time_period: '2023-01-01', bird_count: 3, species_name: 'Wren' }
			]);
		});

		it('orders by time_period then species_name', async () => {
			await readStats({ fetchDataBySpecies: true });
			expect(orderCalls()).toStrictEqual([
				['time_period'],
				['Species(species_name)']
			]);
		});
	});

	describe('temporal unit variants', () => {
		it.each(['day', 'month', 'year'] as const)(
			'filters temporal_unit to %s',
			async (temporalUnit) => {
				await readStats({ temporalUnit });
				expect(filterCalls()).toContainEqual(['temporal_unit', temporalUnit]);
			}
		);
	});

	describe('rpcName variants', () => {
		it('a core_stats read selects the core-stats column set', async () => {
			await readStats({ rpcName: 'core_stats' });
			expect(selectedColumns()).toStrictEqual(CORE_STATS_COLUMNS);
		});

		it('a biometrics_stats read selects the biometric column set', async () => {
			await readStats({ rpcName: 'biometrics_stats' });
			expect(selectedColumns()).toStrictEqual(BIOMETRICS_STATS_COLUMNS);
		});
	});

	it('returns an empty array when the table has no matching rows for the group/period', async () => {
		mockStatsCacheRows([]);
		expect(await readStats()).toStrictEqual([]);
	});
});
