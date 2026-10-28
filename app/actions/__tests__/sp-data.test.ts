import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	fetchPageOfBirds,
	fetchNotableRetraps,
	fetchGraphableEncounterData,
	fetchSpeciesStatsCacheRows,
	getSpeciesStatsHistory,
	getSpeciesDemographicsStats,
	getSpeciesArrivalsStats,
	fetchSpeciesPeriodTotals,
	fetchSpeciesCombinedMonthTotals,
	fetchYearTotalsTabData,
	fetchMonthTotalsTabData,
	fetchSessionTotalsTabData,
	type SpeciesTotalsTabParams
} from '../sp-data';
import type { ViewedGroup } from '@/app/lib/group-slug';
import { makeQueryChain } from '@/app/__tests__/helpers/query-chain';
import { makeRpcCallRecorder } from '@/app/__tests__/helpers/rpc-recorder';

const { mockGetAuthenticatedSupabaseClient, mockReadStatsCacheRows } =
	vi.hoisted(() => ({
		mockGetAuthenticatedSupabaseClient: vi.fn(),
		mockReadStatsCacheRows: vi.fn()
	}));

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

// `fetchSpeciesStatsCacheRows` delegates the whole SimpleStatsCacheBySpecies
// query — table choice, the !inner Species embed, filtering, ordering,
// pagination and species_name flattening — to the generic
// readStatsCacheRows (#1233/#1235), whose own suite covers all of that. So
// these tests assert the params this file hands it and what each caller
// does with the rows it returns, not the query it issues.
vi.mock('@/modules/stats', () => ({
	readStatsCacheRows: mockReadStatsCacheRows
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

// Every species stats read asks the generic reader for the same thing — the
// by-species cache table, this group, this species (matched by *name*, which
// the reader resolves through its `!inner` `Species` embed) — varying only the
// temporal grain and the optional `time_period` range.
function cacheReadParams(
	temporalUnit: string,
	{ fromDate, toDate }: { fromDate?: string; toDate?: string } = {}
) {
	return {
		viewedGroup: { id: GROUP_ID, slug: 'alpha' },
		bySpecies: true,
		species: SPECIES_NAME,
		temporalUnit,
		fromDate,
		toDate
	};
}

// The rows the mocked generic reader hands back. It always resolves
// `species_name` onto a by-species row itself (readStatsCacheRows' own
// "species_name resolution on returned rows" tests), so every fixture here
// carries it rather than an un-flattened `Species` embed.
function mockCacheRows(rows: Record<string, unknown>[]) {
	mockReadStatsCacheRows.mockResolvedValue(
		rows.map((row) => ({ species_name: SPECIES_NAME, ...row }))
	);
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
		mockCacheRows([]);
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

	describe('fetchSpeciesStatsCacheRows', () => {
		it('asks the generic reader for the by-species table, this group and this species', async () => {
			await fetchSpeciesStatsCacheRows({
				speciesName: SPECIES_NAME,
				viewedGroup,
				temporalUnit: 'month'
			});

			expect(mockReadStatsCacheRows).toHaveBeenCalledWith(
				cacheReadParams('month')
			);
		});

		it('forwards fromDate/toDate to the generic reader as its time_period range', async () => {
			makeClient();

			await fetchSpeciesStatsCacheRows({
				speciesName: SPECIES_NAME,
				viewedGroup,
				temporalUnit: 'day',
				fromDate: FROM_DATE,
				toDate: TO_DATE
			});

			expect(mockReadStatsCacheRows).toHaveBeenCalledWith(
				cacheReadParams('day', { fromDate: FROM_DATE, toDate: TO_DATE })
			);
		});

		it("returns the reader's rows untouched, species_name and all — the reader resolves the embed, so there is nothing left to adapt", async () => {
			makeClient();
			mockCacheRows([{ time_period: '2023-01-01', bird_count: 5 }]);

			const result = await fetchSpeciesStatsCacheRows({
				speciesName: SPECIES_NAME,
				viewedGroup,
				temporalUnit: 'month'
			});

			expect(result).toEqual([
				{
					species_name: SPECIES_NAME,
					time_period: '2023-01-01',
					bird_count: 5
				}
			]);
			expect(result[0]).not.toHaveProperty('Species');
		});

		it('still returns the biometric columns when includeBiometrics is false, since the read no longer varies by column subset', async () => {
			makeClient();
			mockCacheRows([
				{ time_period: '2023-01-01', bird_count: 5, median_wing: 55 }
			]);

			const [row] = await fetchSpeciesStatsCacheRows({
				speciesName: SPECIES_NAME,
				viewedGroup,
				temporalUnit: 'month',
				includeBiometrics: false
			});

			// `includeBiometrics` used to pick a wider column subset; the generic
			// reader selects '*', so the flag is a no-op and the wing/weight
			// columns ride along either way.
			expect(mockReadStatsCacheRows).toHaveBeenCalledWith(
				cacheReadParams('month')
			);
			expect(row).toMatchObject({ median_wing: 55 });
		});
	});

	describe('getSpeciesStatsHistory', () => {
		it('reads the monthly grain by default, with no time_period range when none is supplied', async () => {
			makeClient();

			await getSpeciesStatsHistory(SPECIES_NAME, viewedGroup);

			expect(mockReadStatsCacheRows).toHaveBeenCalledWith(
				cacheReadParams('month')
			);
		});

		it("forwards from_date/to_date as the read's time_period range", async () => {
			makeClient();

			await getSpeciesStatsHistory(
				SPECIES_NAME,
				viewedGroup,
				FROM_DATE,
				TO_DATE
			);

			expect(mockReadStatsCacheRows).toHaveBeenCalledWith(
				cacheReadParams('month', { fromDate: FROM_DATE, toDate: TO_DATE })
			);
		});

		it('with interval "year" reads the "year" grain', async () => {
			makeClient();

			await getSpeciesStatsHistory(
				SPECIES_NAME,
				viewedGroup,
				undefined,
				undefined,
				'year'
			);

			expect(mockReadStatsCacheRows).toHaveBeenCalledWith(
				cacheReadParams('year')
			);
		});

		it('with interval "month" passed explicitly matches the default', async () => {
			makeClient();

			await getSpeciesStatsHistory(
				SPECIES_NAME,
				viewedGroup,
				undefined,
				undefined,
				'month'
			);

			expect(mockReadStatsCacheRows).toHaveBeenCalledWith(
				cacheReadParams('month')
			);
		});

		it('returns an empty array without erroring when the cache read returns no rows', async () => {
			makeClient();
			mockCacheRows([]);

			const result = await getSpeciesStatsHistory(SPECIES_NAME, viewedGroup);

			expect(result).toEqual([]);
		});

		it("maps a cache row's biometric columns straight onto the result alongside the counts", async () => {
			makeClient();
			mockCacheRows([
				{
					time_period: '2023-01-01',
					bird_count: 5,
					min_weight: 99,
					max_weight: 100
				}
			]);

			const result = await getSpeciesStatsHistory(SPECIES_NAME, viewedGroup);

			// There is only one source now, so nothing is merged: the row's own
			// columns are the result.
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
			makeClient();
			mockCacheRows([
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
			]);

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

		it('with timeInterval "year" reads the by-species cache at the "year" grain, filtered to the species', async () => {
			makeClient();

			await fetchSpeciesPeriodTotals(SPECIES_NAME, viewedGroup, 'year');

			expect(mockReadStatsCacheRows).toHaveBeenCalledWith(
				cacheReadParams('year')
			);
		});

		it('with timeInterval "month" reads the "month" grain', async () => {
			makeClient();

			await fetchSpeciesPeriodTotals(SPECIES_NAME, viewedGroup, 'month');

			expect(mockReadStatsCacheRows).toHaveBeenCalledWith(
				cacheReadParams('month')
			);
		});

		it("forwards from_date/to_date as the read's time_period range", async () => {
			makeClient();

			await fetchSpeciesPeriodTotals(
				SPECIES_NAME,
				viewedGroup,
				'month',
				FROM_DATE,
				TO_DATE
			);

			expect(mockReadStatsCacheRows).toHaveBeenCalledWith(
				cacheReadParams('month', { fromDate: FROM_DATE, toDate: TO_DATE })
			);
		});

		it('with timeInterval "day" and a monthFilter alongside a date range, narrows the date-ranged rows to that calendar month client-side', async () => {
			makeClient();
			mockCacheRows(dayRowsAcrossMonths);

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
			// the cache read and the month is applied to the rows it returns.
			expect(mockReadStatsCacheRows).toHaveBeenCalledWith(
				cacheReadParams('day', { fromDate: FROM_DATE, toDate: TO_DATE })
			);
			expect(result.map((row) => row.time_period)).toEqual([
				'2023-03-08',
				'2023-03-22'
			]);
		});

		it('with a monthFilter but no date range (the squashed-month route), narrows every historical "day" row to that calendar month', async () => {
			makeClient();
			mockCacheRows(dayRowsAcrossMonths);

			const result = await fetchSpeciesPeriodTotals(
				SPECIES_NAME,
				viewedGroup,
				'day',
				undefined,
				undefined,
				4
			);

			expect(mockReadStatsCacheRows).toHaveBeenCalledWith(
				cacheReadParams('day')
			);
			expect(result.map((row) => row.time_period)).toEqual(['2023-04-02']);
		});

		it('omits the month narrowing when no monthFilter is supplied', async () => {
			makeClient();
			mockCacheRows(dayRowsAcrossMonths);

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
			makeClient();
			mockCacheRows([
				{ time_period: '2022-03-01', bird_count: 7 },
				{ time_period: '2022-04-01', bird_count: 8 },
				{ time_period: '2023-03-01', bird_count: 9 }
			]);

			const result = await fetchSpeciesPeriodTotals(
				SPECIES_NAME,
				viewedGroup,
				'year',
				undefined,
				undefined,
				3
			);

			expect(mockReadStatsCacheRows).toHaveBeenCalledWith(
				cacheReadParams('month')
			);
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
			makeClient();
			const params: SpeciesTotalsTabParams = { speciesName: SPECIES_NAME };

			await fetchYearTotalsTabData(params, viewedGroup);

			expect(mockReadStatsCacheRows).toHaveBeenCalledWith(
				cacheReadParams('year')
			);
		});
	});

	describe('fetchMonthTotalsTabData', () => {
		it('delegates to fetchSpeciesPeriodTotals with timeInterval "month" and the given date range', async () => {
			makeClient();
			const params: SpeciesTotalsTabParams = {
				speciesName: SPECIES_NAME,
				year: 2026,
				fromDate: FROM_DATE,
				toDate: TO_DATE
			};

			await fetchMonthTotalsTabData(params, viewedGroup);

			expect(mockReadStatsCacheRows).toHaveBeenCalledWith(
				cacheReadParams('month', { fromDate: FROM_DATE, toDate: TO_DATE })
			);
		});
	});

	describe('fetchSessionTotalsTabData', () => {
		it('delegates to fetchSpeciesPeriodTotals with timeInterval "day" and the given date range/monthFilter', async () => {
			makeClient();
			mockCacheRows([{ time_period: '2023-03-08', bird_count: 2 }]);
			const params: SpeciesTotalsTabParams = {
				speciesName: SPECIES_NAME,
				fromDate: FROM_DATE,
				toDate: TO_DATE,
				monthFilter: 3
			};

			const result = await fetchSessionTotalsTabData(params, viewedGroup);

			expect(mockReadStatsCacheRows).toHaveBeenCalledWith(
				cacheReadParams('day', { fromDate: FROM_DATE, toDate: TO_DATE })
			);
			expect(result.map((row) => row.time_period)).toEqual(['2023-03-08']);
		});
	});

	describe('fetchSpeciesCombinedMonthTotals', () => {
		it("reads the by-species cache at the 'month-squashed' grain, filtered to the species, with no time_period range", async () => {
			makeClient();

			await fetchSpeciesCombinedMonthTotals(SPECIES_NAME, viewedGroup);

			expect(mockReadStatsCacheRows).toHaveBeenCalledWith(
				cacheReadParams('month-squashed')
			);
		});

		it('returns the rows in the CoreStatsResult shape', async () => {
			makeClient();
			mockCacheRows([{ time_period: '2000-01-01', bird_count: 4 }]);

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
