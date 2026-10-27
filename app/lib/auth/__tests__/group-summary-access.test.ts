import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getGroupCookie } from '../../../actions/group-cookie';
import { getAuthenticatedSupabaseClient } from '../group-auth';
import { resolveGroupPublicAreasForRequest } from '../../group-slug';
import type { CoreStatsResult } from '@/app/models/db';
import type { ViewedGroup } from '@/app/lib/group-slug';
import { makeQueryChain } from '@/app/__tests__/helpers/query-chain';
import { buildCoreStatsRow } from '@/app/__tests__/helpers/core-stats-fixtures';

const { mockPublicSupabaseFrom, mockPublicSupabaseRpc } = vi.hoisted(() => ({
	mockPublicSupabaseFrom: vi.fn(),
	mockPublicSupabaseRpc: vi.fn()
}));

vi.mock('../group-auth', () => ({
	getAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/app/lib/group-slug', () => ({
	resolveGroupPublicAreasForRequest: vi.fn()
}));

// Only `supabase` (the unauthenticated client the 'public' branch reads
// through) is replaced; `fetchAllPaginatedRows`/`catchSupabaseErrors` stay
// real, so the paginated read under test runs its genuine page loop against
// the query-chain mock below.
vi.mock('@/lib/supabase', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/lib/supabase')>();
	return {
		...actual,
		supabase: { from: mockPublicSupabaseFrom, rpc: mockPublicSupabaseRpc }
	};
});

import {
	fetchAuthorisedCoreStats,
	type CoreStatsRpcParams
} from '../group-summary-access';

/**
 * A `SimpleStatsCache`/`SimpleStatsCacheBySpecies` row as PostgREST returns
 * it: every `core_stats_result` column except `species_name` (a column on
 * neither table), plus the embedded `Species` row a by-species read asks for.
 * `speciesName` populates that embed; omit it for an all-species-combined row.
 */
function buildCacheRow({
	speciesName,
	...overrides
}: Partial<CoreStatsResult> & { speciesName?: string } = {}) {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to drop the column the cache tables don't have
	const { species_name, ...cacheColumns } = buildCoreStatsRow(overrides);
	return {
		...cacheColumns,
		...(speciesName ? { Species: { species_name: speciesName } } : {})
	};
}

let tableRead: ReturnType<typeof makeQueryChain>;
let tableName: string | undefined;

/**
 * A Supabase client whose `.from()` returns a chainable query mock resolving
 * to `rows` — the shape every access branch now reads through.
 */
function makeTableReadingClient(rows: unknown[]) {
	tableRead = makeQueryChain(rows);
	return {
		from: vi.fn((requestedTable: string) => {
			tableName = requestedTable;
			return tableRead.chain;
		})
	};
}

function mockAuthenticatedTableRead(rows: unknown[]) {
	vi.mocked(getAuthenticatedSupabaseClient).mockResolvedValue(
		makeTableReadingClient(rows) as never
	);
}

function mockPublicTableRead(rows: unknown[]) {
	const client = makeTableReadingClient(rows);
	mockPublicSupabaseFrom.mockImplementation(client.from);
}

/** A client that only answers `.rpc()` — the non-cache-alignable fallback. */
function makeRpcClient(rows: CoreStatsResult[] | null) {
	return {
		rpc: vi.fn().mockReturnValue({
			then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
				Promise.resolve({ data: rows, error: null }).then(resolve)
		})
	};
}

const filters = () => tableRead.record.filters;
const selectedColumns = () => tableRead.record.select ?? '';
const filterFor = (column: string, operator: string) =>
	filters().find((f) => f.column === column && f.operator === operator)?.value;

const VIEWED_GROUP_ID = 10;
const VIEWER_GROUP_ID = 99;
const viewedGroup: ViewedGroup = { id: VIEWED_GROUP_ID, slug: 'alpha' };

/**
 * The own-group branch, which is the shortest path to "what query did this
 * param shape produce" — it reads the cache through the authenticated client
 * without consulting `public_areas` at all.
 */
async function readOwnGroupStats(
	rpcParams: CoreStatsRpcParams,
	rows: unknown[] = [buildCacheRow()]
) {
	vi.mocked(getGroupCookie).mockResolvedValue(VIEWED_GROUP_ID);
	mockAuthenticatedTableRead(rows);
	return fetchAuthorisedCoreStats(viewedGroup, rpcParams);
}

describe('summary read-path access model', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		tableName = undefined;
	});

	describe('own group, logged in', () => {
		it('sees its own summary data via an authenticated cache-table read', async () => {
			const result = await readOwnGroupStats({}, [
				buildCacheRow({ encounter_count: 5 })
			]);

			expect(result.accessLevel).toBe('own');
			expect(result.rows).toHaveLength(1);
			expect(result.rows[0].encounter_count).toBe(5);
			expect(tableName).toBe('SimpleStatsCache');
			expect(filterFor('group_id', 'eq')).toBe(VIEWED_GROUP_ID);
			expect(resolveGroupPublicAreasForRequest).not.toHaveBeenCalled();
		});

		it("sees its own genuinely empty summary as 'own', never falls through to blocked", async () => {
			const result = await readOwnGroupStats({}, []);

			expect(result).toEqual({ accessLevel: 'own', rows: [] });
			expect(resolveGroupPublicAreasForRequest).not.toHaveBeenCalled();
		});
	});

	describe('different group, logged in, no sharing grant', () => {
		beforeEach(() => {
			vi.mocked(getGroupCookie).mockResolvedValue(VIEWER_GROUP_ID);
			// RLS admits no rows at all for an unauthorised cross-group read of
			// the cache tables — no COALESCEd-zeros row to see through any more.
			mockAuthenticatedTableRead([]);
		});

		it('target not public: blocked (RLS returns zero rows), not a 500', async () => {
			vi.mocked(resolveGroupPublicAreasForRequest).mockResolvedValue([]);

			const result = await fetchAuthorisedCoreStats(viewedGroup);

			expect(result).toEqual({ accessLevel: 'blocked', rows: [] });
		});

		it("target public: sees the target's public summary via the unauthenticated table read", async () => {
			vi.mocked(resolveGroupPublicAreasForRequest).mockResolvedValue([
				'summary'
			]);
			mockPublicTableRead([buildCacheRow({ encounter_count: 42 })]);

			const result = await fetchAuthorisedCoreStats(viewedGroup);

			expect(result.accessLevel).toBe('public');
			expect(result.rows[0].encounter_count).toBe(42);
			expect(mockPublicSupabaseFrom).toHaveBeenCalledWith('SimpleStatsCache');
			expect(filterFor('group_id', 'eq')).toBe(VIEWED_GROUP_ID);
			// No SECURITY DEFINER wrapper is involved any more — the table's
			// own `public_areas` policy branch plus `anon`'s GRANT SELECT is
			// the whole mechanism (#1202).
			expect(mockPublicSupabaseRpc).not.toHaveBeenCalled();
		});
	});

	describe('different group, logged in, existing sharing grant', () => {
		beforeEach(() => {
			vi.mocked(getGroupCookie).mockResolvedValue(VIEWER_GROUP_ID);
		});

		it("target not public: sees data via the authenticated path (RLS's GroupDataSharing branch)", async () => {
			mockAuthenticatedTableRead([buildCacheRow({ encounter_count: 17 })]);
			vi.mocked(resolveGroupPublicAreasForRequest).mockResolvedValue([]);

			const result = await fetchAuthorisedCoreStats(viewedGroup);

			expect(result.accessLevel).toBe('shared');
			expect(result.rows[0].encounter_count).toBe(17);
			expect(mockPublicSupabaseFrom).not.toHaveBeenCalled();
		});

		it('target also public: still gets the same data via the public path, the authenticated client never even called', async () => {
			vi.mocked(resolveGroupPublicAreasForRequest).mockResolvedValue([
				'summary'
			]);
			mockPublicTableRead([buildCacheRow({ encounter_count: 17 })]);

			const result = await fetchAuthorisedCoreStats(viewedGroup);

			// accessLevel is 'public' rather than 'shared' here — a deliberate
			// labelling tradeoff (see fetchAuthorisedCoreStats's own comment):
			// both branches run the same query against the same rows, so the
			// sharing grant is never exercised (and never needs to be) once
			// the target is public.
			expect(result.accessLevel).toBe('public');
			expect(getAuthenticatedSupabaseClient).not.toHaveBeenCalled();
		});
	});

	describe('no cookie (anonymous)', () => {
		beforeEach(() => {
			vi.mocked(getGroupCookie).mockResolvedValue(null);
			// Left un-mocked (would reject if called, like the real "no session
			// cookie" case) deliberately: with the public-before-authenticated
			// order, an anonymous viewer never reaches the authenticated
			// attempt at all — see the two assertions below.
		});

		it('target public: sees data without the authenticated client ever being attempted', async () => {
			vi.mocked(resolveGroupPublicAreasForRequest).mockResolvedValue([
				'summary'
			]);
			mockPublicTableRead([buildCacheRow({ encounter_count: 3 })]);

			const result = await fetchAuthorisedCoreStats(viewedGroup);

			expect(result.accessLevel).toBe('public');
			expect(result.rows[0].encounter_count).toBe(3);
			expect(getAuthenticatedSupabaseClient).not.toHaveBeenCalled();
		});

		it('target not public: gated gracefully without ever attempting the authenticated client', async () => {
			vi.mocked(resolveGroupPublicAreasForRequest).mockResolvedValue([]);

			await expect(fetchAuthorisedCoreStats(viewedGroup)).resolves.toEqual({
				accessLevel: 'blocked',
				rows: []
			});
			expect(getAuthenticatedSupabaseClient).not.toHaveBeenCalled();
		});
	});

	describe('distinguishing an RLS-filtered-empty read from a genuinely empty one', () => {
		it('target group has zero sessions and is public: empty state via the public read, not mistaken for blocked', async () => {
			vi.mocked(getGroupCookie).mockResolvedValue(null);
			vi.mocked(resolveGroupPublicAreasForRequest).mockResolvedValue([
				'summary'
			]);
			mockPublicTableRead([]);

			const result = await fetchAuthorisedCoreStats(viewedGroup);

			// The public branch grants on `public_areas`, never on whether any
			// rows came back — so an opted-in group with no data at all still
			// renders its own (empty) summary.
			expect(result).toEqual({ accessLevel: 'public', rows: [] });
		});

		it("a 'shared' read that RLS filters down to zero rows resolves to 'blocked'", async () => {
			vi.mocked(getGroupCookie).mockResolvedValue(VIEWER_GROUP_ID);
			vi.mocked(resolveGroupPublicAreasForRequest).mockResolvedValue([]);
			mockAuthenticatedTableRead([]);

			const result = await fetchAuthorisedCoreStats(viewedGroup);

			expect(result).toEqual({ accessLevel: 'blocked', rows: [] });
		});
	});

	describe('translating RPC params into cache-table filters', () => {
		it('no window at all reads the all-time grain, with no time_period filter', async () => {
			await readOwnGroupStats({});

			expect(filterFor('temporal_unit', 'eq')).toBe('all-time');
			expect(filters().filter((f) => f.column === 'time_period')).toHaveLength(
				0
			);
		});

		it('a whole calendar year reads that one year-grain cell', async () => {
			await readOwnGroupStats({
				from_date: '2026-01-01',
				to_date: '2026-12-31'
			});

			expect(filterFor('temporal_unit', 'eq')).toBe('year');
			expect(filterFor('time_period', 'eq')).toBe('2026-01-01');
		});

		it('a whole calendar month reads that one month-grain cell', async () => {
			await readOwnGroupStats({
				from_date: '2026-02-01',
				to_date: '2026-02-28'
			});

			expect(filterFor('temporal_unit', 'eq')).toBe('month');
			expect(filterFor('time_period', 'eq')).toBe('2026-02-01');
		});

		it("a bare month_filter reads that squashed month's sentinel-year cell", async () => {
			await readOwnGroupStats({ month_filter: 3 });

			expect(filterFor('temporal_unit', 'eq')).toBe('month-squashed');
			expect(filterFor('time_period', 'eq')).toBe('2000-03-01');
		});

		it('grouping by time period over a range reads that grain, bounded by the range', async () => {
			await readOwnGroupStats({
				group_by_species: false,
				group_by_time_period: 'month',
				from_date: '2026-01-01',
				to_date: '2026-12-31'
			});

			expect(filterFor('temporal_unit', 'eq')).toBe('month');
			expect(filterFor('time_period', 'gte')).toBe('2026-01-01');
			expect(filterFor('time_period', 'lte')).toBe('2026-12-31');
		});

		it("grouping by 'month-squashed' reads every squashed cell, unbounded", async () => {
			await readOwnGroupStats({
				group_by_species: false,
				group_by_time_period: 'month-squashed'
			});

			expect(filterFor('temporal_unit', 'eq')).toBe('month-squashed');
			expect(filters().filter((f) => f.column === 'time_period')).toHaveLength(
				0
			);
		});

		it('year totals for one calendar month read the month grain and relabel each row to its year', async () => {
			const { rows } = await readOwnGroupStats(
				{
					group_by_species: false,
					group_by_time_period: 'year',
					month_filter: 6
				},
				[
					buildCacheRow({ time_period: '2025-06-01', encounter_count: 11 }),
					buildCacheRow({ time_period: '2025-07-01', encounter_count: 22 }),
					buildCacheRow({ time_period: '2026-06-01', encounter_count: 33 })
				]
			);

			expect(filterFor('temporal_unit', 'eq')).toBe('month');
			expect(rows.map((row) => [row.time_period, row.encounter_count])).toEqual(
				[
					['2025-01-01', 11],
					['2026-01-01', 33]
				]
			);
		});

		it('day totals for one calendar month keep the day grain and its real dates', async () => {
			const { rows } = await readOwnGroupStats(
				{
					group_by_species: false,
					group_by_time_period: 'day',
					month_filter: 6
				},
				[
					buildCacheRow({ time_period: '2025-06-04' }),
					buildCacheRow({ time_period: '2025-07-04' })
				]
			);

			expect(filterFor('temporal_unit', 'eq')).toBe('day');
			expect(rows.map((row) => row.time_period)).toEqual(['2025-06-04']);
		});

		it('an arbitrary (non-cell-aligned) window falls back to the core_stats RPC', async () => {
			vi.mocked(getGroupCookie).mockResolvedValue(VIEWED_GROUP_ID);
			const rpcRows = [buildCoreStatsRow({ encounter_count: 7 })];
			const client = makeRpcClient(rpcRows);
			vi.mocked(getAuthenticatedSupabaseClient).mockResolvedValue(
				client as never
			);

			// The /species list page's "CES only" range — no cache cell spans
			// it, and its distinct-count columns can't be rebuilt from finer
			// cells.
			const result = await fetchAuthorisedCoreStats(viewedGroup, {
				group_by_species: true,
				from_date: '2026-04-25',
				to_date: '2026-09-05'
			});

			expect(result).toEqual({ accessLevel: 'own', rows: rpcRows });
			expect(client.rpc).toHaveBeenCalledWith(
				'core_stats',
				expect.objectContaining({ ringing_group_filter: VIEWED_GROUP_ID })
			);
		});

		it('an arbitrary window on a public target falls back to the public_core_stats RPC', async () => {
			vi.mocked(getGroupCookie).mockResolvedValue(null);
			vi.mocked(resolveGroupPublicAreasForRequest).mockResolvedValue([
				'summary'
			]);
			mockPublicSupabaseRpc.mockReturnValue({
				then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
					Promise.resolve({ data: [], error: null }).then(resolve)
			});

			const result = await fetchAuthorisedCoreStats(viewedGroup, {
				from_date: '2026-04-25',
				to_date: '2026-09-05'
			});

			expect(result.accessLevel).toBe('public');
			expect(mockPublicSupabaseRpc).toHaveBeenCalledWith(
				'public_core_stats',
				expect.objectContaining({ ringing_group_filter: VIEWED_GROUP_ID })
			);
			expect(mockPublicSupabaseFrom).not.toHaveBeenCalled();
		});
	});

	describe('reshaping cache rows into core-stats rows', () => {
		it('group_by_species: true reads SimpleStatsCacheBySpecies and resolves species_name from the Species join', async () => {
			const { rows } = await readOwnGroupStats({ group_by_species: true }, [
				buildCacheRow({ speciesName: 'Robin' }),
				buildCacheRow({ speciesName: 'Wren' })
			]);

			expect(tableName).toBe('SimpleStatsCacheBySpecies');
			expect(selectedColumns()).toContain('Species(species_name)');
			expect(rows.map((row) => row.species_name)).toEqual(['Robin', 'Wren']);
			// The embed itself never reaches the caller — `SpeciesStatsRow`
			// (app/lib/species-stats.ts) keys on the flattened name.
			expect(rows[0]).not.toHaveProperty('Species');
		});

		it('group_by_species: false reads SimpleStatsCache, never attempts the join, and leaves species_name null', async () => {
			const { rows } = await readOwnGroupStats({ group_by_species: false });

			expect(tableName).toBe('SimpleStatsCache');
			expect(selectedColumns()).not.toContain('Species');
			expect(rows[0].species_name).toBeNull();
		});
	});
});
