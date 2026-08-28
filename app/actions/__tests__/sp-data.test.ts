import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	fetchPageOfBirds,
	fetchNotableRetraps,
	fetchGraphableEncounterData,
	getSpeciesStatsHistory
} from '../sp-data';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/lib/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
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
		it('forwards from_date/to_date to aggregate_stats alongside the monthly grouping', async () => {
			const { rpcCalls } = makeClient({ rpcRows: [] });

			await getSpeciesStatsHistory(SPECIES_NAME, GROUP_ID, FROM_DATE, TO_DATE);

			expect(rpcCalls[0].name).toBe('aggregate_stats');
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
	});

	// The actual pruning of out-of-range encounters from the embedded array is a
	// PostgREST guarantee of the `!inner` + nested `visit_date` filter, not
	// something the action code does — the "inner-joins … forwards both bounds"
	// tests above assert exactly that construction, which is what makes a bird's
	// earlier in-range encounter appear while a later out-of-range one is dropped.
});
