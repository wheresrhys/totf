import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	fetchPageOfBirds,
	fetchNotableRetraps,
	fetchGraphableEncounterData,
	getSpeciesStatsHistory,
	getSpeciesDemographicsStats,
	getSpeciesArrivalsStats,
	fetchSpeciesPeriodTotals,
	fetchSpeciesCombinedMonthTotals,
	getGroupEffortHistory,
	fetchYearTotalsTabData,
	fetchMonthTotalsTabData,
	fetchSessionTotalsTabData,
	type SpeciesTotalsTabParams
} from '../sp-data';
import type { CoreStatsResult } from '@/app/models/db';
import type { ViewedGroup } from '@/app/lib/group-slug';
import { makeQueryChain } from '@/app/__tests__/helpers/query-chain';
import { makeRpcCallRecorder } from '@/app/__tests__/helpers/rpc-recorder';

const { mockGetAuthenticatedSupabaseClient, mockFetchCoreStatsByMonth } =
	vi.hoisted(() => ({
		mockGetAuthenticatedSupabaseClient: vi.fn(),
		mockFetchCoreStatsByMonth: vi.fn()
	}));

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

// getGroupEffortHistory delegates the RPC call + caching to
// fetchCoreStatsByMonth (app/actions/stats-cache.ts) — that function's own
// RPC-args/caching behaviour is covered by the fetchCoreStatsByMonth
// describe block in __tests__/stats-cache.test.ts, so here it's mocked
// directly and these tests only assert the interval->hours conversion +
// [time_period, hours] pair shaping.
vi.mock('../stats-cache', () => ({
	fetchCoreStatsByMonth: mockFetchCoreStatsByMonth
}));

const SPECIES_ID = 1;
const SPECIES_NAME = 'Robin';
const GROUP_ID = 7;
const viewedGroup: ViewedGroup = { id: GROUP_ID, slug: 'alpha' };
const FROM_DATE = '2023-01-01';
const TO_DATE = '2023-12-31';
// `makeQueryChain` records every `.eq()` alongside the `.filter()`/`.gte()`/
// `.lte()` calls, so the species-column equality each `Birds` query applies
// before any date filtering shows up first in `record.filters`.
const SPECIES_ID_FILTER = {
	column: 'species_id',
	operator: 'eq',
	value: SPECIES_ID
};
const VISIT_DATE_FROM_FILTER = {
	column: 'encounters.session.visit_date',
	operator: 'gte',
	value: FROM_DATE
};
const VISIT_DATE_TO_FILTER = {
	column: 'encounters.session.visit_date',
	operator: 'lte',
	value: TO_DATE
};

function makeClient({
	queryRows,
	rpcRows
}: {
	queryRows?: unknown;
	rpcRows?: unknown;
} = {}) {
	const query = makeQueryChain(queryRows ?? []);
	const { rpc, calls: rpcCalls } = makeRpcCallRecorder(rpcRows ?? []);
	const client = {
		from: vi.fn(() => query.chain),
		rpc
	};
	mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
	return { client, queryRecord: query.record, rpcCalls };
}

const STATS_CACHE_TABLE = 'SimpleStatsCacheBySpecies';

// Every `SimpleStatsCacheBySpecies` read applies the same three equality
// filters before any `time_period` range narrowing: the group, the temporal
// grain, and the species — matched by *name* through the `!inner` `Species`
// embed, since the cache itself keys on a `species_id` FK.
function cacheReadFilters(temporalUnit: string) {
	return [
		{ column: 'group_id', operator: 'eq', value: GROUP_ID },
		{ column: 'temporal_unit', operator: 'eq', value: temporalUnit },
		{ column: 'Species.species_name', operator: 'eq', value: SPECIES_NAME }
	];
}

function timePeriodFilter(operator: 'gte' | 'lte', value: string) {
	return { column: 'time_period', operator, value };
}

function birdRow(encounterDates: string[]) {
	return {
		id: 1,
		ring_no: 'AR-TEST',
		last_encountered_timestamp: '2023-09-14 09:00:00',
		ringing_group_ids: [GROUP_ID],
		proven_age: 3,
		encounters: encounterDates.map((visit_date, index) => ({
			id: index + 1,
			capture_time: '09:00:00',
			min_hatch_year: 2020,
			max_hatch_year: 2020,
			age_code: 4,
			is_juv: false,
			record_type: 'N',
			sex: 'U',
			weight: 18,
			wing_length: 55,
			session: { id: index + 1, visit_date }
		}))
	};
}

describe('sp-data actions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('fetchPageOfBirds', () => {
		it('with no date range issues a plain (non-inner) query with no visit_date filter', async () => {
			const { queryRecord } = makeClient({
				queryRows: [birdRow(['2023-05-12'])]
			});

			const result = await fetchPageOfBirds(SPECIES_ID, viewedGroup);

			expect(queryRecord.select).not.toContain('!inner');
			expect(queryRecord.filters).toEqual([SPECIES_ID_FILTER]);
			expect(result).toHaveLength(1);
			expect(result[0].ring_no).toBe('AR-TEST');
		});

		it('with a date range inner-joins encounters + sessions and forwards both bounds as visit_date filters', async () => {
			const { queryRecord } = makeClient({
				queryRows: [birdRow(['2023-05-12'])]
			});

			await fetchPageOfBirds(SPECIES_ID, viewedGroup, 0, FROM_DATE, TO_DATE);

			expect(queryRecord.select).toContain('Encounters!inner');
			expect(queryRecord.select).toContain('Sessions!inner');
			expect(queryRecord.filters).toEqual([
				SPECIES_ID_FILTER,
				VISIT_DATE_FROM_FILTER,
				VISIT_DATE_TO_FILTER
			]);
		});

		it('with only from_date applies just the lower-bound filter', async () => {
			const { queryRecord } = makeClient({
				queryRows: [birdRow(['2023-05-12'])]
			});

			await fetchPageOfBirds(SPECIES_ID, viewedGroup, 0, FROM_DATE);

			expect(queryRecord.select).toContain('Encounters!inner');
			expect(queryRecord.filters).toEqual([
				SPECIES_ID_FILTER,
				VISIT_DATE_FROM_FILTER
			]);
		});
	});

	describe('fetchNotableRetraps', () => {
		it('without a date range omits from_date/to_date from the RPC args', async () => {
			const { rpcCalls } = makeClient({ rpcRows: [] });

			await fetchNotableRetraps(SPECIES_NAME, viewedGroup);

			expect(rpcCalls[0].name).toBe('notable_retraps');
			expect(rpcCalls[0].args).not.toHaveProperty('from_date');
			expect(rpcCalls[0].args).not.toHaveProperty('to_date');
		});

		it('forwards from_date/to_date to the notable_retraps RPC when supplied', async () => {
			const { rpcCalls } = makeClient({ rpcRows: [] });

			await fetchNotableRetraps(SPECIES_NAME, viewedGroup, FROM_DATE, TO_DATE);

			expect(rpcCalls[0].args).toMatchObject({
				species_filter: SPECIES_NAME,
				ringing_group_filter: GROUP_ID,
				from_date: FROM_DATE,
				to_date: TO_DATE
			});
		});
	});

	describe('fetchGraphableEncounterData', () => {
		it('without a date range issues a plain query with no visit_date filter', async () => {
			const { queryRecord } = makeClient({
				queryRows: [{ encounters: [{ sex: 'U' }] }]
			});

			await fetchGraphableEncounterData(SPECIES_ID, viewedGroup);

			expect(queryRecord.select).not.toContain('!inner');
			expect(queryRecord.filters).toEqual([SPECIES_ID_FILTER]);
		});

		it('with a date range inner-joins the session and forwards both visit_date bounds', async () => {
			const { queryRecord } = makeClient({
				queryRows: [{ encounters: [{ sex: 'U' }] }]
			});

			await fetchGraphableEncounterData(
				SPECIES_ID,
				viewedGroup,
				FROM_DATE,
				TO_DATE
			);

			expect(queryRecord.select).toContain('Encounters!inner');
			expect(queryRecord.select).toContain('Sessions!inner');
			expect(queryRecord.filters).toEqual([
				SPECIES_ID_FILTER,
				VISIT_DATE_FROM_FILTER,
				VISIT_DATE_TO_FILTER
			]);
		});
	});

	describe('getSpeciesStatsHistory', () => {
		it('reads SimpleStatsCacheBySpecies, projecting the biometric columns alongside the counts', async () => {
			const { client, queryRecord } = makeClient();

			await getSpeciesStatsHistory(SPECIES_NAME, viewedGroup);

			expect(client.from).toHaveBeenCalledWith(STATS_CACHE_TABLE);
			// One read, not two: the cache row carries both the counts and the
			// wing/weight columns biometrics_stats used to supply separately.
			expect(queryRecord.select).toContain('bird_count');
			expect(queryRecord.select).toContain('median_wing');
			expect(queryRecord.select).toContain('Species!inner(species_name)');
		});

		it('filters by group, the monthly grain and the species name, with no time_period range when none is supplied', async () => {
			const { queryRecord } = makeClient();

			await getSpeciesStatsHistory(SPECIES_NAME, viewedGroup);

			expect(queryRecord.filters).toEqual(cacheReadFilters('month'));
		});

		it('forwards from_date/to_date as time_period gte/lte filters', async () => {
			const { queryRecord } = makeClient();

			await getSpeciesStatsHistory(
				SPECIES_NAME,
				viewedGroup,
				FROM_DATE,
				TO_DATE
			);

			expect(queryRecord.filters).toEqual([
				...cacheReadFilters('month'),
				timePeriodFilter('gte', FROM_DATE),
				timePeriodFilter('lte', TO_DATE)
			]);
		});

		it('with interval "year" filters temporal_unit "year"', async () => {
			const { queryRecord } = makeClient();

			await getSpeciesStatsHistory(
				SPECIES_NAME,
				viewedGroup,
				undefined,
				undefined,
				'year'
			);

			expect(queryRecord.filters).toEqual(cacheReadFilters('year'));
		});

		it('with interval "month" passed explicitly matches the default', async () => {
			const { queryRecord } = makeClient();

			await getSpeciesStatsHistory(
				SPECIES_NAME,
				viewedGroup,
				undefined,
				undefined,
				'month'
			);

			expect(queryRecord.filters).toEqual(cacheReadFilters('month'));
		});

		it('returns an empty array without erroring when the table read returns no rows', async () => {
			makeClient({ queryRows: [] });

			const result = await getSpeciesStatsHistory(SPECIES_NAME, viewedGroup);

			expect(result).toEqual([]);
		});

		it("maps a cache row's biometric columns straight onto the result, re-attaching species_name and dropping the Species embed", async () => {
			makeClient({
				queryRows: [
					{
						time_period: '2023-01-01',
						bird_count: 5,
						min_weight: 99,
						max_weight: 100,
						Species: { species_name: SPECIES_NAME }
					}
				]
			});

			const result = await getSpeciesStatsHistory(SPECIES_NAME, viewedGroup);

			// There is only one source now, so nothing is merged: the row's own
			// columns are the result, with species_name re-attached from the
			// argument (the cache stores species_id) and the embed — present
			// purely to filter on the name — dropped.
			expect(result).toEqual([
				{
					species_name: SPECIES_NAME,
					time_period: '2023-01-01',
					bird_count: 5,
					min_weight: 99,
					max_weight: 100
				}
			]);
		});

		it('passes a cache row with null biometric columns through as null', async () => {
			// The cache's biometric columns are deliberately nullable — an empty
			// MAX/AVG/MIN/PERCENTILE_CONT cell genuinely has no value — so a
			// species/period with no biometric-eligible encounters arrives as
			// nulls on the row itself rather than being synthesised from a
			// missing sibling row.
			makeClient({
				queryRows: [
					{
						time_period: '2023-03-01',
						bird_count: 2,
						min_weight: null,
						max_weight: null,
						avg_weight: null,
						median_weight: null,
						min_wing: null,
						max_wing: null,
						avg_wing: null,
						median_wing: null
					}
				]
			});

			const result = await getSpeciesStatsHistory(SPECIES_NAME, viewedGroup);

			expect(result).toEqual([
				{
					species_name: SPECIES_NAME,
					time_period: '2023-03-01',
					bird_count: 2,
					min_weight: null,
					max_weight: null,
					avg_weight: null,
					median_weight: null,
					min_wing: null,
					max_wing: null,
					avg_wing: null,
					median_wing: null
				}
			]);
		});
	});

	describe('getSpeciesDemographicsStats', () => {
		it('forwards from_date/to_date to demographics_stats alongside the monthly timeInterval', async () => {
			const { rpcCalls } = makeClient({ rpcRows: [] });

			await getSpeciesDemographicsStats(
				SPECIES_NAME,
				viewedGroup,
				FROM_DATE,
				TO_DATE
			);

			expect(rpcCalls[0].name).toBe('demographics_stats');
			expect(rpcCalls[0].args).toMatchObject({
				species_name_filter: SPECIES_NAME,
				ringing_group_filter: GROUP_ID,
				group_by_time_period: 'month',
				from_date: FROM_DATE,
				to_date: TO_DATE
			});
		});

		it('omits from_date/to_date when no range is supplied', async () => {
			const { rpcCalls } = makeClient({ rpcRows: [] });

			await getSpeciesDemographicsStats(SPECIES_NAME, viewedGroup);

			expect(rpcCalls[0].args).not.toHaveProperty('from_date');
			expect(rpcCalls[0].args).not.toHaveProperty('to_date');
		});

		it('with interval "year" calls demographics_stats with group_by_time_period: "year"', async () => {
			const { rpcCalls } = makeClient({ rpcRows: [] });

			await getSpeciesDemographicsStats(
				SPECIES_NAME,
				viewedGroup,
				undefined,
				undefined,
				'year'
			);

			expect(rpcCalls[0].args).toMatchObject({
				group_by_time_period: 'year'
			});
		});

		it('with interval "month" passed explicitly matches the default', async () => {
			const { rpcCalls } = makeClient({ rpcRows: [] });

			await getSpeciesDemographicsStats(
				SPECIES_NAME,
				viewedGroup,
				undefined,
				undefined,
				'month'
			);

			expect(rpcCalls[0].args).toMatchObject({
				group_by_time_period: 'month'
			});
		});
	});

	describe('getSpeciesArrivalsStats', () => {
		it('forwards from_date/to_date to arrivals_stats alongside the monthly timeInterval', async () => {
			const { rpcCalls } = makeClient({ rpcRows: [] });

			await getSpeciesArrivalsStats(
				SPECIES_NAME,
				viewedGroup,
				FROM_DATE,
				TO_DATE
			);

			expect(rpcCalls[0].name).toBe('arrivals_stats');
			expect(rpcCalls[0].args).toMatchObject({
				species_name_filter: SPECIES_NAME,
				ringing_group_filter: GROUP_ID,
				group_by_time_period: 'month',
				from_date: FROM_DATE,
				to_date: TO_DATE
			});
		});

		it('omits from_date/to_date when no range is supplied', async () => {
			const { rpcCalls } = makeClient({ rpcRows: [] });

			await getSpeciesArrivalsStats(SPECIES_NAME, viewedGroup);

			expect(rpcCalls[0].args).not.toHaveProperty('from_date');
			expect(rpcCalls[0].args).not.toHaveProperty('to_date');
		});

		it('with interval "year" calls arrivals_stats with group_by_time_period: "year"', async () => {
			const { rpcCalls } = makeClient({ rpcRows: [] });

			await getSpeciesArrivalsStats(
				SPECIES_NAME,
				viewedGroup,
				undefined,
				undefined,
				'year'
			);

			expect(rpcCalls[0].args).toMatchObject({
				group_by_time_period: 'year'
			});
		});

		it('with interval "month" passed explicitly matches the default', async () => {
			const { rpcCalls } = makeClient({ rpcRows: [] });

			await getSpeciesArrivalsStats(
				SPECIES_NAME,
				viewedGroup,
				undefined,
				undefined,
				'month'
			);

			expect(rpcCalls[0].args).toMatchObject({
				group_by_time_period: 'month'
			});
		});
	});

	describe('getGroupEffortHistory', () => {
		function effortRow(
			time_period: string,
			total_effort: string
		): CoreStatsResult {
			return {
				time_period,
				total_effort
			} as CoreStatsResult;
		}

		it('converts core_stats rows into [time_period, hours] pairs in the same order', async () => {
			mockFetchCoreStatsByMonth.mockResolvedValue([
				effortRow('2023-01', '05:30:00'),
				effortRow('2023-02', '02:00:00')
			]);

			const result = await getGroupEffortHistory(viewedGroup);

			expect(mockFetchCoreStatsByMonth).toHaveBeenCalledWith(viewedGroup);
			expect(result).toEqual([
				['2023-01', 5.5],
				['2023-02', 2]
			]);
		});

		it('returns 0 hours for a month whose total_effort is "00:00:00"', async () => {
			mockFetchCoreStatsByMonth.mockResolvedValue([
				effortRow('2023-01', '00:00:00')
			]);

			const result = await getGroupEffortHistory(viewedGroup);

			expect(result).toEqual([['2023-01', 0]]);
		});

		it('converts an interval spanning whole days to its total hour count', async () => {
			mockFetchCoreStatsByMonth.mockResolvedValue([
				effortRow('2023-01', '2 days 03:00:00')
			]);

			const result = await getGroupEffortHistory(viewedGroup);

			expect(result).toEqual([['2023-01', 51]]);
		});
	});

	// The actual pruning of out-of-range encounters from the embedded array is a
	// PostgREST guarantee of the `!inner` + nested `visit_date` filter, not
	// something the action code does — the "inner-joins … forwards both bounds"
	// tests above assert exactly that construction, which is what makes a bird's
	// earlier in-range encounter appear while a later out-of-range one is dropped.

	describe('fetchSpeciesPeriodTotals', () => {
		// One `'day'`-grain row per calendar month of 2023, so a month filter has
		// something to keep and something to drop either side of it.
		const dayRowsAcrossMonths = [
			{ time_period: '2023-02-14', bird_count: 1 },
			{ time_period: '2023-03-08', bird_count: 2 },
			{ time_period: '2023-03-22', bird_count: 3 },
			{ time_period: '2023-04-02', bird_count: 4 }
		];

		it('with timeInterval "year" reads SimpleStatsCacheBySpecies filtered to the species and temporal_unit "year"', async () => {
			const { client, queryRecord } = makeClient();

			await fetchSpeciesPeriodTotals(SPECIES_NAME, viewedGroup, 'year');

			expect(client.from).toHaveBeenCalledWith(STATS_CACHE_TABLE);
			expect(queryRecord.filters).toEqual(cacheReadFilters('year'));
		});

		it('with timeInterval "month" filters temporal_unit "month"', async () => {
			const { queryRecord } = makeClient();

			await fetchSpeciesPeriodTotals(SPECIES_NAME, viewedGroup, 'month');

			expect(queryRecord.filters).toEqual(cacheReadFilters('month'));
		});

		it('forwards from_date/to_date as time_period range filters', async () => {
			const { queryRecord } = makeClient();

			await fetchSpeciesPeriodTotals(
				SPECIES_NAME,
				viewedGroup,
				'month',
				FROM_DATE,
				TO_DATE
			);

			expect(queryRecord.filters).toEqual([
				...cacheReadFilters('month'),
				timePeriodFilter('gte', FROM_DATE),
				timePeriodFilter('lte', TO_DATE)
			]);
		});

		it('omits the time_period range filters when no range is supplied', async () => {
			const { queryRecord } = makeClient();

			await fetchSpeciesPeriodTotals(SPECIES_NAME, viewedGroup, 'month');

			expect(queryRecord.filters).not.toContainEqual(
				expect.objectContaining({ column: 'time_period' })
			);
		});

		it('with timeInterval "day" and a monthFilter alongside a date range, narrows the date-ranged rows to that calendar month client-side', async () => {
			const { queryRecord } = makeClient({ queryRows: dayRowsAcrossMonths });

			const result = await fetchSpeciesPeriodTotals(
				SPECIES_NAME,
				viewedGroup,
				'day',
				FROM_DATE,
				TO_DATE,
				3
			);

			// The month itself can't be a query filter — `time_period` is a plain
			// `date` with no separate month column — so only the range reaches
			// PostgREST and the month is applied to the rows it returns.
			expect(queryRecord.filters).toEqual([
				...cacheReadFilters('day'),
				timePeriodFilter('gte', FROM_DATE),
				timePeriodFilter('lte', TO_DATE)
			]);
			expect(result.map((row) => row.time_period)).toEqual([
				'2023-03-08',
				'2023-03-22'
			]);
		});

		it('with a monthFilter but no date range (the squashed-month route), narrows every historical "day" row to that calendar month', async () => {
			const { queryRecord } = makeClient({ queryRows: dayRowsAcrossMonths });

			const result = await fetchSpeciesPeriodTotals(
				SPECIES_NAME,
				viewedGroup,
				'day',
				undefined,
				undefined,
				4
			);

			expect(queryRecord.filters).toEqual(cacheReadFilters('day'));
			expect(result.map((row) => row.time_period)).toEqual(['2023-04-02']);
		});

		it('omits the month narrowing when no monthFilter is supplied', async () => {
			makeClient({ queryRows: dayRowsAcrossMonths });

			const result = await fetchSpeciesPeriodTotals(
				SPECIES_NAME,
				viewedGroup,
				'day'
			);

			expect(result.map((row) => row.time_period)).toEqual(
				dayRowsAcrossMonths.map((row) => row.time_period)
			);
		});

		it('with timeInterval "year" and a monthFilter reads the "month" grain, relabelling each kept row to its year start', async () => {
			// A year's totals scoped to one calendar month *is* that (year, month)
			// cell, so the month grain answers the question the RPC's
			// year + month_filter combination used to — but its rows have to come
			// back year-grained, since that's the shape the squashed-month route's
			// "Year totals" tab reads.
			const { queryRecord } = makeClient({
				queryRows: [
					{ time_period: '2022-03-01', bird_count: 7 },
					{ time_period: '2022-04-01', bird_count: 8 },
					{ time_period: '2023-03-01', bird_count: 9 }
				]
			});

			const result = await fetchSpeciesPeriodTotals(
				SPECIES_NAME,
				viewedGroup,
				'year',
				undefined,
				undefined,
				3
			);

			expect(queryRecord.filters).toEqual(cacheReadFilters('month'));
			expect(result).toEqual([
				{
					species_name: SPECIES_NAME,
					time_period: '2022-01-01',
					bird_count: 7
				},
				{
					species_name: SPECIES_NAME,
					time_period: '2023-01-01',
					bird_count: 9
				}
			]);
		});
	});

	// Thin `TabConfig.dataFetcher` wrappers around `fetchSpeciesPeriodTotals`
	// (#1065) — each just needs to confirm it delegates with the right
	// `timeInterval`/args; `fetchSpeciesPeriodTotals`'s own describe block above
	// already covers the underlying cache-read behaviour in full.
	describe('fetchYearTotalsTabData', () => {
		it('delegates to fetchSpeciesPeriodTotals with timeInterval "year"', async () => {
			const { queryRecord } = makeClient();
			const params: SpeciesTotalsTabParams = { speciesName: SPECIES_NAME };

			await fetchYearTotalsTabData(params, viewedGroup);

			expect(queryRecord.filters).toEqual(cacheReadFilters('year'));
		});
	});

	describe('fetchMonthTotalsTabData', () => {
		it('delegates to fetchSpeciesPeriodTotals with timeInterval "month" and the given date range', async () => {
			const { queryRecord } = makeClient();
			const params: SpeciesTotalsTabParams = {
				speciesName: SPECIES_NAME,
				year: 2026,
				fromDate: FROM_DATE,
				toDate: TO_DATE
			};

			await fetchMonthTotalsTabData(params, viewedGroup);

			expect(queryRecord.filters).toEqual([
				...cacheReadFilters('month'),
				timePeriodFilter('gte', FROM_DATE),
				timePeriodFilter('lte', TO_DATE)
			]);
		});
	});

	describe('fetchSessionTotalsTabData', () => {
		it('delegates to fetchSpeciesPeriodTotals with timeInterval "day" and the given date range/monthFilter', async () => {
			const { queryRecord } = makeClient({
				queryRows: [{ time_period: '2023-03-08', bird_count: 2 }]
			});
			const params: SpeciesTotalsTabParams = {
				speciesName: SPECIES_NAME,
				fromDate: FROM_DATE,
				toDate: TO_DATE,
				monthFilter: 3
			};

			const result = await fetchSessionTotalsTabData(params, viewedGroup);

			expect(queryRecord.filters).toEqual([
				...cacheReadFilters('day'),
				timePeriodFilter('gte', FROM_DATE),
				timePeriodFilter('lte', TO_DATE)
			]);
			expect(result.map((row) => row.time_period)).toEqual(['2023-03-08']);
		});
	});

	describe('fetchSpeciesCombinedMonthTotals', () => {
		it("reads SimpleStatsCacheBySpecies filtered to the species and temporal_unit 'month-squashed', with no time_period range", async () => {
			const { client, queryRecord } = makeClient();

			await fetchSpeciesCombinedMonthTotals(SPECIES_NAME, viewedGroup);

			expect(client.from).toHaveBeenCalledWith(STATS_CACHE_TABLE);
			expect(queryRecord.filters).toEqual(cacheReadFilters('month-squashed'));
		});

		it('returns the rows mapped back to the CoreStatsResult shape', async () => {
			makeClient({
				queryRows: [
					{
						time_period: '2000-01-01',
						bird_count: 4,
						Species: { species_name: SPECIES_NAME }
					}
				]
			});

			const result = await fetchSpeciesCombinedMonthTotals(
				SPECIES_NAME,
				viewedGroup
			);

			expect(result).toEqual([
				{
					species_name: SPECIES_NAME,
					time_period: '2000-01-01',
					bird_count: 4
				}
			]);
		});
	});
});
