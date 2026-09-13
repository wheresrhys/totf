import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	fetchPageOfBirds,
	fetchNotableRetraps,
	fetchGraphableEncounterData,
	getSpeciesStatsHistory,
	getSpeciesPopulationStats,
	fetchSpeciesPeriodTotals,
	getGroupEffortHistory
} from '../sp-data';
import type { CoreStatsResult } from '@/app/models/db';

const { mockGetAuthenticatedSupabaseClient, mockFetchGroupEffortHistory } =
	vi.hoisted(() => ({
		mockGetAuthenticatedSupabaseClient: vi.fn(),
		mockFetchGroupEffortHistory: vi.fn()
	}));

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

// getGroupEffortHistory delegates the RPC call + caching to
// fetchGroupEffortHistory (lib/underlying-stats.ts) — that function's own
// RPC-args/caching behaviour is covered by lib/__tests__/underlying-stats.test.ts,
// so here it's mocked directly and these tests only assert the
// interval->hours conversion + [time_period, hours] pair shaping.
vi.mock('@/app/lib/underlying-stats', () => ({
	fetchGroupEffortHistory: mockFetchGroupEffortHistory
}));

const SPECIES_ID = 1;
const SPECIES_NAME = 'Robin';
const GROUP_ID = 7;
const FROM_DATE = '2023-01-01';
const TO_DATE = '2023-12-31';

type FilterCall = { column: string; operator: string; value: unknown };

/**
 * A chainable `from().select()...` query mock that records the `select` string
 * and every `.filter()` call, and resolves (thenable) to the supplied rows.
 */
function makeQueryChain(rows: unknown) {
	const record: { select?: string; filters: FilterCall[] } = { filters: [] };
	const chain: Record<string, unknown> = {
		select: vi.fn((s: string) => {
			record.select = s;
			return chain;
		}),
		eq: vi.fn(() => chain),
		contains: vi.fn(() => chain),
		order: vi.fn(() => chain),
		range: vi.fn(() => chain),
		filter: vi.fn((column: string, operator: string, value: unknown) => {
			record.filters.push({ column, operator, value });
			return chain;
		}),
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data: rows, error: null }).then(resolve)
	};
	return { chain, record };
}

function makeClient({
	queryRows,
	rpcRows
}: {
	queryRows?: unknown;
	rpcRows?: unknown;
} = {}) {
	const query = makeQueryChain(queryRows ?? []);
	const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
	const client = {
		from: vi.fn(() => query.chain),
		rpc: vi.fn((name: string, args: Record<string, unknown>) => {
			rpcCalls.push({ name, args });
			return {
				then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
					Promise.resolve({ data: rpcRows ?? [], error: null }).then(resolve)
			};
		})
	};
	mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
	return { client, queryRecord: query.record, rpcCalls };
}

function makeStatsHistoryClient({
	aggregateRows,
	biometricsRows
}: {
	aggregateRows: unknown[];
	biometricsRows: unknown[];
}) {
	const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
	const client = {
		rpc: vi.fn((name: string, args: Record<string, unknown>) => {
			rpcCalls.push({ name, args });
			const data = name === 'core_stats' ? aggregateRows : biometricsRows;
			return {
				then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
					Promise.resolve({ data, error: null }).then(resolve)
			};
		})
	};
	mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
	return { rpcCalls };
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

			const result = await fetchPageOfBirds(SPECIES_ID, GROUP_ID);

			expect(queryRecord.select).not.toContain('!inner');
			expect(queryRecord.filters).toHaveLength(0);
			expect(result).toHaveLength(1);
			expect(result[0].ring_no).toBe('AR-TEST');
		});

		it('with a date range inner-joins encounters + sessions and forwards both bounds as visit_date filters', async () => {
			const { queryRecord } = makeClient({
				queryRows: [birdRow(['2023-05-12'])]
			});

			await fetchPageOfBirds(SPECIES_ID, GROUP_ID, 0, FROM_DATE, TO_DATE);

			expect(queryRecord.select).toContain('Encounters!inner');
			expect(queryRecord.select).toContain('Sessions!inner');
			expect(queryRecord.filters).toEqual([
				{
					column: 'encounters.session.visit_date',
					operator: 'gte',
					value: FROM_DATE
				},
				{
					column: 'encounters.session.visit_date',
					operator: 'lte',
					value: TO_DATE
				}
			]);
		});

		it('with only from_date applies just the lower-bound filter', async () => {
			const { queryRecord } = makeClient({
				queryRows: [birdRow(['2023-05-12'])]
			});

			await fetchPageOfBirds(SPECIES_ID, GROUP_ID, 0, FROM_DATE);

			expect(queryRecord.select).toContain('Encounters!inner');
			expect(queryRecord.filters).toEqual([
				{
					column: 'encounters.session.visit_date',
					operator: 'gte',
					value: FROM_DATE
				}
			]);
		});
	});

	describe('fetchNotableRetraps', () => {
		it('without a date range omits from_date/to_date from the RPC args', async () => {
			const { rpcCalls } = makeClient({ rpcRows: [] });

			await fetchNotableRetraps(SPECIES_NAME, GROUP_ID);

			expect(rpcCalls[0].name).toBe('notable_retraps');
			expect(rpcCalls[0].args).not.toHaveProperty('from_date');
			expect(rpcCalls[0].args).not.toHaveProperty('to_date');
		});

		it('forwards from_date/to_date to the notable_retraps RPC when supplied', async () => {
			const { rpcCalls } = makeClient({ rpcRows: [] });

			await fetchNotableRetraps(SPECIES_NAME, GROUP_ID, FROM_DATE, TO_DATE);

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

			await fetchGraphableEncounterData(SPECIES_ID, GROUP_ID);

			expect(queryRecord.select).not.toContain('!inner');
			expect(queryRecord.filters).toHaveLength(0);
		});

		it('with a date range inner-joins the session and forwards both visit_date bounds', async () => {
			const { queryRecord } = makeClient({
				queryRows: [{ encounters: [{ sex: 'U' }] }]
			});

			await fetchGraphableEncounterData(
				SPECIES_ID,
				GROUP_ID,
				FROM_DATE,
				TO_DATE
			);

			expect(queryRecord.select).toContain('Encounters!inner');
			expect(queryRecord.select).toContain('Sessions!inner');
			expect(queryRecord.filters).toEqual([
				{
					column: 'encounters.session.visit_date',
					operator: 'gte',
					value: FROM_DATE
				},
				{
					column: 'encounters.session.visit_date',
					operator: 'lte',
					value: TO_DATE
				}
			]);
		});
	});

	describe('getSpeciesStatsHistory', () => {
		it('forwards from_date/to_date to aggregate_stats alongside the monthly timeInterval', async () => {
			const { rpcCalls } = makeClient({ rpcRows: [] });

			await getSpeciesStatsHistory(SPECIES_NAME, GROUP_ID, FROM_DATE, TO_DATE);

			expect(rpcCalls[0].name).toBe('core_stats');
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

			await getSpeciesStatsHistory(SPECIES_NAME, GROUP_ID);

			expect(rpcCalls[0].args).not.toHaveProperty('from_date');
			expect(rpcCalls[0].args).not.toHaveProperty('to_date');
		});

		it('calls biometrics_stats with group_by_time_period: "month", matching the existing aggregate_stats call', async () => {
			const { rpcCalls } = makeStatsHistoryClient({
				aggregateRows: [],
				biometricsRows: []
			});

			await getSpeciesStatsHistory(SPECIES_NAME, GROUP_ID);

			const biometricsCall = rpcCalls.find(
				(call) => call.name === 'biometrics_stats'
			);
			expect(biometricsCall?.args).toMatchObject({
				group_by_time_period: 'month'
			});
		});

		it('merges biometrics_stats wing/weight fields onto each aggregate_stats row, keyed by time_period', async () => {
			makeStatsHistoryClient({
				aggregateRows: [
					{
						time_period: '2023-01',
						bird_count: 5,
						min_weight: 1,
						max_weight: 2
					},
					{
						time_period: '2023-02',
						bird_count: 3,
						min_weight: 1,
						max_weight: 2
					}
				],
				biometricsRows: [
					{ time_period: '2023-01', min_weight: 99, max_weight: 100 },
					{ time_period: '2023-02', min_weight: 88, max_weight: 90 }
				]
			});

			const result = await getSpeciesStatsHistory(SPECIES_NAME, GROUP_ID);

			expect(result).toEqual([
				expect.objectContaining({
					time_period: '2023-01',
					bird_count: 5,
					min_weight: 99,
					max_weight: 100
				}),
				expect.objectContaining({
					time_period: '2023-02',
					bird_count: 3,
					min_weight: 88,
					max_weight: 90
				})
			]);
		});

		it('returns an empty array without erroring when neither RPC returns rows', async () => {
			makeStatsHistoryClient({ aggregateRows: [], biometricsRows: [] });

			const result = await getSpeciesStatsHistory(SPECIES_NAME, GROUP_ID);

			expect(result).toEqual([]);
		});

		it('fills all 8 biometric fields with null when a time_period has no matching biometrics_stats row', async () => {
			makeStatsHistoryClient({
				aggregateRows: [{ time_period: '2023-03', bird_count: 2 }],
				biometricsRows: []
			});

			const result = await getSpeciesStatsHistory(SPECIES_NAME, GROUP_ID);

			// aggregate_stats no longer carries its own wing/weight columns (#827),
			// so a period with no matching biometrics_stats row gets all 8 fields
			// coalesced to null rather than being passed through unmerged.
			expect(result).toEqual([
				{
					time_period: '2023-03',
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

	describe('getSpeciesPopulationStats', () => {
		it('forwards from_date/to_date to population_stats alongside the monthly timeInterval', async () => {
			const { rpcCalls } = makeClient({ rpcRows: [] });

			await getSpeciesPopulationStats(
				SPECIES_NAME,
				GROUP_ID,
				FROM_DATE,
				TO_DATE
			);

			expect(rpcCalls[0].name).toBe('population_stats');
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

			await getSpeciesPopulationStats(SPECIES_NAME, GROUP_ID);

			expect(rpcCalls[0].args).not.toHaveProperty('from_date');
			expect(rpcCalls[0].args).not.toHaveProperty('to_date');
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

		it('converts aggregate_stats rows into [time_period, hours] pairs in the same order', async () => {
			mockFetchGroupEffortHistory.mockResolvedValue([
				effortRow('2023-01', '05:30:00'),
				effortRow('2023-02', '02:00:00')
			]);

			const result = await getGroupEffortHistory(GROUP_ID);

			expect(mockFetchGroupEffortHistory).toHaveBeenCalledWith(GROUP_ID);
			expect(result).toEqual([
				['2023-01', 5.5],
				['2023-02', 2]
			]);
		});

		it('converts a typical multi-hour interval to the correct fractional-hour number', async () => {
			mockFetchGroupEffortHistory.mockResolvedValue([
				effortRow('2023-01', '05:30:00')
			]);

			const result = await getGroupEffortHistory(GROUP_ID);

			expect(result).toEqual([['2023-01', 5.5]]);
		});

		it('returns 0 hours for a month whose total_effort is "00:00:00"', async () => {
			mockFetchGroupEffortHistory.mockResolvedValue([
				effortRow('2023-01', '00:00:00')
			]);

			const result = await getGroupEffortHistory(GROUP_ID);

			expect(result).toEqual([['2023-01', 0]]);
		});

		it('returns [] when fetchGroupEffortHistory resolves null', async () => {
			mockFetchGroupEffortHistory.mockResolvedValue(null);

			const result = await getGroupEffortHistory(GROUP_ID);

			expect(result).toEqual([]);
		});

		it('converts an interval spanning whole days to its total hour count', async () => {
			mockFetchGroupEffortHistory.mockResolvedValue([
				effortRow('2023-01', '2 days 03:00:00')
			]);

			const result = await getGroupEffortHistory(GROUP_ID);

			expect(result).toEqual([['2023-01', 51]]);
		});
	});

	// The actual pruning of out-of-range encounters from the embedded array is a
	// PostgREST guarantee of the `!inner` + nested `visit_date` filter, not
	// something the action code does — the "inner-joins … forwards both bounds"
	// tests above assert exactly that construction, which is what makes a bird's
	// earlier in-range encounter appear while a later out-of-range one is dropped.

	describe('fetchSpeciesPeriodTotals', () => {
		it('with timeInterval "year" calls aggregate_stats with species_name_filter and group_by_time_period "year"', async () => {
			const { rpcCalls } = makeClient({ rpcRows: [] });

			await fetchSpeciesPeriodTotals(SPECIES_NAME, GROUP_ID, 'year');

			expect(rpcCalls[0].name).toBe('core_stats');
			expect(rpcCalls[0].args).toMatchObject({
				species_name_filter: SPECIES_NAME,
				ringing_group_filter: GROUP_ID,
				group_by_time_period: 'year'
			});
		});

		it('with timeInterval "month" calls aggregate_stats with group_by_time_period "month"', async () => {
			const { rpcCalls } = makeClient({ rpcRows: [] });

			await fetchSpeciesPeriodTotals(SPECIES_NAME, GROUP_ID, 'month');

			expect(rpcCalls[0].args).toMatchObject({
				species_name_filter: SPECIES_NAME,
				ringing_group_filter: GROUP_ID,
				group_by_time_period: 'month'
			});
		});

		it('forwards from_date/to_date when supplied', async () => {
			const { rpcCalls } = makeClient({ rpcRows: [] });

			await fetchSpeciesPeriodTotals(
				SPECIES_NAME,
				GROUP_ID,
				'month',
				FROM_DATE,
				TO_DATE
			);

			expect(rpcCalls[0].args).toMatchObject({
				from_date: FROM_DATE,
				to_date: TO_DATE
			});
		});

		it('omits from_date/to_date when no range is supplied', async () => {
			const { rpcCalls } = makeClient({ rpcRows: [] });

			await fetchSpeciesPeriodTotals(SPECIES_NAME, GROUP_ID, 'month');

			expect(rpcCalls[0].args).not.toHaveProperty('from_date');
			expect(rpcCalls[0].args).not.toHaveProperty('to_date');
		});
	});
});
