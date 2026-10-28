import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

import { readStatsCacheRows, type StatsCacheReadParams } from '../../../modules/stats/stats-cache';
import { makeQueryChain } from '@/app/__tests__/helpers/query-chain';
import type { ViewedGroup } from '@/app/lib/group-slug';

const supabaseClientMock = { from: vi.fn() };

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

const GROUP_ID = 1;
const viewedGroup: ViewedGroup = { id: GROUP_ID, slug: 'alpha' };

let queryChain: ReturnType<typeof makeQueryChain>;

function mockStatsCacheRows(
	rows: unknown[] | ((fromRow?: number, toRow?: number) => unknown)
) {
	queryChain = makeQueryChain(rows);
	supabaseClientMock.from.mockReturnValue(queryChain.chain);
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
	mockGetAuthenticatedSupabaseClient.mockResolvedValue(supabaseClientMock);
	mockStatsCacheRows([]);
});

describe('readStatsCacheRows', () => {
	function readRows(
		overrides: Partial<Omit<StatsCacheReadParams, 'client' | 'groupId'>> = {}
	) {
		return readStatsCacheRows({
			client: supabaseClientMock as never,
			viewedGroup: { id: GROUP_ID, slug: 'a' },
			bySpecies: false,
			temporalUnit: 'day',
			...overrides
		});
	}

	describe('table choice', () => {
		it('reads from SimpleStatsCache when bySpecies is false', async () => {
			await readRows({ bySpecies: false });
			expect(tableRead()).toBe('SimpleStatsCache');
		});

		it('reads from SimpleStatsCacheBySpecies when bySpecies is true', async () => {
			await readRows({ bySpecies: true });
			expect(tableRead()).toBe('SimpleStatsCacheBySpecies');
		});
	});

	describe('group and temporal-unit filtering', () => {
		it('filters by group_id and the given temporal_unit', async () => {
			await readRows({ temporalUnit: 'year' });
			expect(filterCalls()).toStrictEqual([
				['group_id', GROUP_ID],
				['temporal_unit', 'year']
			]);
		});

		it.each(['day', 'month', 'year'] as const)(
			'filters temporal_unit to %s',
			async (temporalUnit) => {
				await readRows({ temporalUnit });
				expect(filterCalls()).toContainEqual(['temporal_unit', temporalUnit]);
			}
		);
	});

	describe('time filtering', () => {
		it('filters to an exact time_period when timePeriod is given', async () => {
			await readRows({ timePeriod: '2023-06-01' });
			expect(filterCalls()).toContainEqual(['time_period', '2023-06-01']);
		});

		it('filters to a range via gte/lte when fromDate and toDate are given', async () => {
			await readRows({ fromDate: '2023-01-01', toDate: '2023-12-31' });
			expect((queryChain.chain.gte as Mock).mock.calls).toStrictEqual([
				['time_period', '2023-01-01']
			]);
			expect((queryChain.chain.lte as Mock).mock.calls).toStrictEqual([
				['time_period', '2023-12-31']
			]);
		});
	});

	describe('species filtering', () => {
		it('embeds an inner Species(species_name) join and filters on it when species is given', async () => {
			await readRows({ bySpecies: true, species: 'Wren' });
			expect(selectedColumns()).toStrictEqual([
				'*',
				'Species!inner(species_name)'
			]);
			expect(filterCalls()).toContainEqual(['Species.species_name', 'Wren']);
		});

		it('embeds a non-inner Species(species_name) join with no filter when bySpecies is true and species is omitted', async () => {
			await readRows({ bySpecies: true });
			expect(selectedColumns()).toStrictEqual(['*', 'Species(species_name)']);
			expect(filterCalls()).not.toContainEqual([
				'Species.species_name',
				expect.anything()
			]);
		});

		it('adds no Species embed when bySpecies is false', async () => {
			await readRows({ bySpecies: false });
			expect(selectedColumns()).toStrictEqual(['*']);
		});
	});

	describe('species_name resolution on returned rows', () => {
		it('flattens the embedded species_name onto each row of a bySpecies read', async () => {
			mockStatsCacheRows([
				bySpeciesRow('Blue Tit', '2023-01-01'),
				bySpeciesRow('Wren', '2023-02-01')
			]);
			expect(await readRows({ bySpecies: true })).toStrictEqual([
				{
					time_period: '2023-01-01',
					bird_count: 3,
					species_name: 'Blue Tit'
				},
				{ time_period: '2023-02-01', bird_count: 3, species_name: 'Wren' }
			]);
		});

		it('sets species_name to null on each row of an all-species read', async () => {
			mockStatsCacheRows([{ time_period: '2023-01-01', bird_count: 4 }]);
			expect(await readRows({ bySpecies: false })).toStrictEqual([
				{ time_period: '2023-01-01', bird_count: 4, species_name: null }
			]);
		});
	});

	describe('pagination', () => {
		// One row short of two full PostgREST pages, so fetchAllPaginatedRows
		// must issue a second request to pick up the final row.
		const TOTAL_ROWS = 1001;

		function pagedRow(index: number) {
			return { time_period: `2023-01-01`, row_index: index };
		}

		function pagedRows(fromRow = 0, toRow = 0) {
			const remaining = TOTAL_ROWS - fromRow;
			const count = Math.min(toRow - fromRow + 1, Math.max(remaining, 0));
			return Array.from({ length: count }, (_, offset) =>
				pagedRow(fromRow + offset)
			);
		}

		it('pages through fetchAllPaginatedRows and returns every row across multiple pages', async () => {
			mockStatsCacheRows(pagedRows);
			const rows = await readRows();
			expect(rows).toHaveLength(TOTAL_ROWS);
		});
	});

	describe('ordering', () => {
		it('orders by time_period for an all-species read', async () => {
			await readRows({ bySpecies: false });
			expect(orderCalls()).toStrictEqual([['time_period']]);
		});

		it('orders by time_period then by the embedded Species(species_name) for a bySpecies read', async () => {
			await readRows({ bySpecies: true });
			expect(orderCalls()).toStrictEqual([
				['time_period'],
				['Species(species_name)']
			]);
		});
	});

	describe('row shape', () => {
		it('returns full rows (select *) rather than a narrowed column subset', async () => {
			mockStatsCacheRows([
				{ time_period: '2023-01-01', some_arbitrary_column: 'x' }
			]);
			expect(await readRows()).toStrictEqual([
				{
					time_period: '2023-01-01',
					some_arbitrary_column: 'x',
					species_name: null
				}
			]);
		});

		it('returns an empty array when no rows match', async () => {
			mockStatsCacheRows([]);
			expect(await readRows()).toStrictEqual([]);
		});
	});

	describe('client parameter', () => {
		it('issues the query against the supplied client rather than minting its own', async () => {
			await readRows();
			expect(supabaseClientMock.from).toHaveBeenCalledWith('SimpleStatsCache');
		});
	});

	// The one `'use client'`-facing pass-through onto readStatsCacheRows (#1236)
	// — a SupabaseClient instance can't cross the server/client boundary, so a
	// 'use client' caller mints no client of its own and calls this instead.
	// readStatsCacheRows itself lives in this same module, so it can't be
	// mocked out as a black-box collaborator here (same-module spying doesn't
	// intercept Vite's SSR-transformed internal calls) — these tests instead
	// verify the delegation end to end through the already-mocked
	// `getAuthenticatedSupabaseClient` and the same query-chain helpers
	// `readStatsCacheRows`'s own tests above use, without re-asserting that
	// function's own query-building behaviour.
	describe('no client provided', () => {
		function readRowsNoClientProvided(
			overrides: Partial<
				Omit<StatsCacheReadParams, 'client' | 'viewedGroup'>
			> = {}
		) {
			return readStatsCacheRows({
				viewedGroup,
				bySpecies: false,
				temporalUnit: 'day',
				...overrides
			});
		}

		it('mints an authenticated client and passes it to readStatsCacheRows', async () => {
			await readRowsNoClientProvided();
			expect(mockGetAuthenticatedSupabaseClient).toHaveBeenCalledTimes(1);
			expect(supabaseClientMock.from).toHaveBeenCalledWith('SimpleStatsCache');
		});

		it('derives groupId from the given viewedGroup', async () => {
			await readRowsNoClientProvided();
			expect(filterCalls()).toContainEqual(['group_id', GROUP_ID]);
		});

		it('forwards bySpecies/temporalUnit and any time-filter params unchanged', async () => {
			await readRowsNoClientProvided({
				bySpecies: true,
				temporalUnit: 'year',
				fromDate: '2023-01-01',
				toDate: '2023-12-31'
			});
			expect(tableRead()).toBe('SimpleStatsCacheBySpecies');
			expect(filterCalls()).toContainEqual(['temporal_unit', 'year']);
			expect((queryChain.chain.gte as Mock).mock.calls).toStrictEqual([
				['time_period', '2023-01-01']
			]);
			expect((queryChain.chain.lte as Mock).mock.calls).toStrictEqual([
				['time_period', '2023-12-31']
			]);
		});
	});
});
