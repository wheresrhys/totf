import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchAuthorisedCoreStats } from '@/app/lib/auth/group-summary-access';
import type { BiometricsStatsResult } from '@/app/models/db';
import { fetchSpeciesData } from '../spp-data';
import {
	ALPHA_BIOMETRICS_BY_SPECIES,
	GAMMA_BIOMETRICS_BY_SPECIES
} from '@/app/__tests__/helpers/biometrics-stats-fixtures';
import { buildCoreStatsRow } from '@/app/__tests__/helpers/core-stats-fixtures';
import { makeRpcCallRecorder } from '@/app/__tests__/helpers/rpc-recorder';
import { makeQueryChain } from '@/app/__tests__/helpers/query-chain';
import type { ViewedGroup } from '@/app/lib/group-slug';

// The shared `BiometricsStatsResult` fixtures (app/__tests__/helpers) rather
// than per-test literals. Both branches' row builders below reshape Alpha's
// first row into the shape that branch's own source returns — the cache
// table's embedded-species-name shape, and the arbitrary-window fallback RPC's
// species_id-keyed one — so the 8 metric columns are defined once. Alpha's
// first row is the Blue Tit that every bare
// buildCoreStatsRow({ species_name: 'Blue Tit' }) call below deliberately
// matches (buildCoreStatsRow's own default `species_name` is `null`), so the
// two builders line up on species_name and mergeSpeciesBiometrics actually
// joins them; Gamma's is genuinely empty — that group has no
// biometric-eligible encounters at all — which is the no-biometrics-anywhere
// edge case (#883), and an empty result is shape-agnostic enough to stand in
// for either source's.
const capturedBiometricsRows = ALPHA_BIOMETRICS_BY_SPECIES;
const emptyBiometricsRows = GAMMA_BIOMETRICS_BY_SPECIES;

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/app/lib/auth/group-summary-access', async (importOriginal) => {
	// `resolveStatsCacheQueryPlan` stays real — which window shape routes to the
	// cache and which falls back to the live RPC is precisely what these tests
	// are asserting, and faking it would assert nothing.
	const actual =
		await importOriginal<
			typeof import('@/app/lib/auth/group-summary-access')
		>();
	return { ...actual, fetchAuthorisedCoreStats: vi.fn() };
});

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

const GROUP_ID = 1;
const viewedGroup: ViewedGroup = { id: GROUP_ID, slug: 'alpha' };
// A whole calendar year and a whole calendar month: both exactly one cache
// cell, so both read SimpleStatsCacheBySpecies.
const YEAR_FROM_DATE = '2026-01-01';
const YEAR_TO_DATE = '2026-12-31';
const MONTH_FROM_DATE = '2026-02-01';
const MONTH_TO_DATE = '2026-02-28';
// The /species list page's "CES only" range — the canonical arbitrary window,
// aligned to no cache cell, so the live stats_cache_biometrics_metrics RPC
// answers it.
const CES_FROM_DATE = '2026-04-25';
const CES_TO_DATE = '2026-09-05';
const BLUE_TIT_SPECIES_ID = 42;

/**
 * A `SimpleStatsCacheBySpecies` row as PostgREST returns it for the biometrics
 * read: the 8 wing/weight columns plus `encounter_count`, with the species
 * name arriving through the embedded `Species` select rather than as a column
 * of its own. Built from the shared fixture row so the values are real.
 */
function buildBiometricsCacheRow({
	speciesName = 'Blue Tit',
	...overrides
}: Partial<BiometricsStatsResult> & { speciesName?: string } = {}) {
	const {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to drop the two columns the cache table doesn't return as columns
		species_name,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- ditto
		time_period,
		...biometricColumns
	} = { ...capturedBiometricsRows[0], ...overrides };
	return { ...biometricColumns, Species: { species_name: speciesName } };
}

/**
 * A `stats_cache_biometrics_metrics` row as the arbitrary-window fallback's
 * RPC returns it: the same 8 wing/weight columns, keyed on `species_id`
 * instead of `species_name` and with no `encounter_count` column at all.
 * Built from the same shared fixture row as the cache-table builder above, so
 * a column added to the shared 8 surfaces on both branches at once.
 */
function buildBiometricsMetricsRpcRow({
	speciesId = BLUE_TIT_SPECIES_ID,
	...overrides
}: Partial<BiometricsStatsResult> & { speciesId?: number | null } = {}) {
	const {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to drop the two columns stats_cache_biometrics_metrics_result doesn't have
		species_name,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- ditto
		encounter_count,
		...biometricColumns
	} = { ...capturedBiometricsRows[0], ...overrides };
	return { ...biometricColumns, species_id: speciesId, time_period: null };
}

/** A `Species(id, species_name)` row, as the id→name map read returns it. */
function buildSpeciesNameRow(
	id = BLUE_TIT_SPECIES_ID,
	species_name = 'Blue Tit'
) {
	return { id, species_name };
}

let tableReads: Map<string, ReturnType<typeof makeQueryChain>>;
let readTableNames: string[];

/**
 * The authenticated client every biometrics path goes through: `.from()`
 * serves both the cache-aligned branch's `SimpleStatsCacheBySpecies` read and
 * the fallback's `Species` id→name read (dispatched by table name, so each
 * gets its own recorded chain), and `.rpc()` serves the fallback's
 * `stats_cache_biometrics_metrics` call. A test sets up whichever reads its
 * window shape should reach, and asserts the others were left alone.
 */
function mockAuthenticatedClient({
	cacheRows = [],
	rpcRows = [],
	speciesRows = [buildSpeciesNameRow()]
}: {
	cacheRows?: unknown[];
	rpcRows?: unknown[];
	speciesRows?: unknown[];
} = {}) {
	const rowsByTable: Record<string, unknown[]> = {
		SimpleStatsCacheBySpecies: cacheRows,
		Species: speciesRows
	};
	tableReads = new Map();
	readTableNames = [];
	const { rpc, calls: rpcCalls } = makeRpcCallRecorder(rpcRows);
	mockGetAuthenticatedSupabaseClient.mockResolvedValue({
		from: vi.fn((requestedTable: string) => {
			readTableNames.push(requestedTable);
			const read = makeQueryChain(rowsByTable[requestedTable] ?? []);
			tableReads.set(requestedTable, read);
			return read.chain;
		}),
		rpc
	});
	return { rpcCalls };
}

function mockCoreStats(
	rows = [buildCoreStatsRow({ species_name: 'Blue Tit' })],
	accessLevel: 'own' | 'shared' | 'public' | 'blocked' = 'own'
) {
	vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({ accessLevel, rows });
}

const readOf = (table: string) => tableReads.get(table);
const cacheFilters = () =>
	readOf('SimpleStatsCacheBySpecies')?.record.filters ?? [];
const cacheFilterFor = (column: string, operator: string) =>
	cacheFilters().find((f) => f.column === column && f.operator === operator)
		?.value;
const selectedCacheColumns = () =>
	readOf('SimpleStatsCacheBySpecies')?.record.select ?? '';
const speciesIdsRequested = () =>
	readOf('Species')?.record.filters.find(
		(f) => f.column === 'id' && f.operator === 'in'
	)?.value;

describe('fetchBiometricsStats', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('cache-aligned window', () => {
		it("reads SimpleStatsCacheBySpecies' biometric columns from the all-time grain when no window is given", async () => {
			mockCoreStats();
			mockAuthenticatedClient({ cacheRows: [buildBiometricsCacheRow()] });

			const [row] = await fetchSpeciesData(viewedGroup);

			expect(readTableNames).toEqual(['SimpleStatsCacheBySpecies']);
			expect(cacheFilterFor('group_id', 'eq')).toBe(GROUP_ID);
			expect(cacheFilterFor('temporal_unit', 'eq')).toBe('all-time');
			// All-time is one cell per species, so no time_period narrowing.
			expect(
				cacheFilters().filter((f) => f.column === 'time_period')
			).toHaveLength(0);
			expect(selectedCacheColumns()).toContain('median_wing');
			expect(selectedCacheColumns()).toContain('Species(species_name)');
			expect(row.median_wing).toBe(capturedBiometricsRows[0].median_wing);
		});

		it('reads the matching year-grain cell for a whole calendar year', async () => {
			mockCoreStats();
			mockAuthenticatedClient({ cacheRows: [buildBiometricsCacheRow()] });

			await fetchSpeciesData(viewedGroup, YEAR_FROM_DATE, YEAR_TO_DATE);

			expect(cacheFilterFor('temporal_unit', 'eq')).toBe('year');
			expect(cacheFilterFor('time_period', 'eq')).toBe(YEAR_FROM_DATE);
		});

		it('reads the matching month-grain cell for a whole calendar month', async () => {
			mockCoreStats();
			mockAuthenticatedClient({ cacheRows: [buildBiometricsCacheRow()] });

			await fetchSpeciesData(viewedGroup, MONTH_FROM_DATE, MONTH_TO_DATE);

			expect(cacheFilterFor('temporal_unit', 'eq')).toBe('month');
			expect(cacheFilterFor('time_period', 'eq')).toBe(MONTH_FROM_DATE);
		});

		it("reads the squashed-month grain's sentinel-year cell for a bare monthFilter", async () => {
			mockCoreStats();
			const { rpcCalls } = mockAuthenticatedClient({
				cacheRows: [buildBiometricsCacheRow()]
			});

			await fetchSpeciesData(viewedGroup, undefined, undefined, 3);

			expect(fetchAuthorisedCoreStats).toHaveBeenCalledWith(viewedGroup, {
				from_date: undefined,
				to_date: undefined,
				group_by_species: true,
				month_filter: 3
			});
			expect(cacheFilterFor('temporal_unit', 'eq')).toBe('month-squashed');
			expect(cacheFilterFor('time_period', 'eq')).toBe('2000-03-01');
			expect(rpcCalls).toEqual([]);
		});
	});

	describe('arbitrary window', () => {
		it('falls back to the live stats_cache_biometrics_metrics RPC for a window aligned to no cache cell', async () => {
			mockCoreStats();
			const { rpcCalls } = mockAuthenticatedClient({
				rpcRows: [
					buildBiometricsMetricsRpcRow({ max_weight: 20, max_wing: 70 })
				]
			});

			const [row] = await fetchSpeciesData(
				viewedGroup,
				CES_FROM_DATE,
				CES_TO_DATE
			);

			expect(rpcCalls).toEqual([
				{
					name: 'stats_cache_biometrics_metrics',
					args: {
						ringing_group_filter: GROUP_ID,
						from_date: CES_FROM_DATE,
						to_date: CES_TO_DATE,
						group_by_species: true
					}
				}
			]);
			// No `group_by_time_period`, and no cache-table read at all — only
			// the species id→name map's own `Species` read.
			expect(readTableNames).toEqual(['Species']);
			expect(row.max_weight).toBe(20);
			expect(row.max_wing).toBe(70);
		});

		it("attaches each row's species_name from the Species id→name map", async () => {
			mockCoreStats([
				buildCoreStatsRow({ species_name: 'Blue Tit' }),
				buildCoreStatsRow({ species_name: 'Wren' })
			]);
			mockAuthenticatedClient({
				rpcRows: [
					buildBiometricsMetricsRpcRow({ speciesId: 7, max_wing: 50 }),
					buildBiometricsMetricsRpcRow({ speciesId: 9, max_wing: 70 })
				],
				speciesRows: [
					buildSpeciesNameRow(9, 'Blue Tit'),
					buildSpeciesNameRow(7, 'Wren')
				]
			});

			const rows = await fetchSpeciesData(
				viewedGroup,
				CES_FROM_DATE,
				CES_TO_DATE
			);

			// Only the ids the RPC actually returned are looked up.
			expect(speciesIdsRequested()).toEqual([7, 9]);
			expect(
				rows.find(({ species_name }) => species_name === 'Blue Tit')?.max_wing
			).toBe(70);
			expect(
				rows.find(({ species_name }) => species_name === 'Wren')?.max_wing
			).toBe(50);
		});

		// The `encounter_count` column `stats_cache_biometrics_metrics_result`
		// lacks is backfilled as `null`, which no test here can observe:
		// `mergeSpeciesBiometrics` copies only the 8 metrics onto the
		// `/species` row and lets the core-stats row's own `encounter_count`
		// stand, and `fetchBiometricsStats` is deliberately not exported (every
		// export of a `'use server'` module becomes a callable endpoint). The
		// gap is instead guaranteed at compile time by the fallback's
		// `Promise<BiometricsStatsResult[]>` return type, which `npm run qa`'s
		// type-check step enforces — dropping the backfill fails the build.

		it('drops a row whose species_id resolves to no Species name, and logs it', async () => {
			mockCoreStats();
			mockAuthenticatedClient({
				rpcRows: [buildBiometricsMetricsRpcRow({ speciesId: 999 })],
				speciesRows: []
			});
			const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const [row] = await fetchSpeciesData(
				viewedGroup,
				CES_FROM_DATE,
				CES_TO_DATE
			);

			expect(row.species_name).toBe('Blue Tit');
			expect(row.max_weight).toBeUndefined();
			expect(logSpy).toHaveBeenCalledWith(
				expect.stringContaining('resolved to no Species name'),
				expect.objectContaining({ speciesId: 999 })
			);
			logSpy.mockRestore();
		});
	});

	describe('authorisation', () => {
		it('fetches no biometrics at all when fetchAuthorisedCoreStats resolves accessLevel "blocked"', async () => {
			mockCoreStats([], 'blocked');

			await fetchSpeciesData(viewedGroup, YEAR_FROM_DATE, YEAR_TO_DATE);

			expect(mockGetAuthenticatedSupabaseClient).not.toHaveBeenCalled();
		});

		it('fetches no biometrics at all when fetchAuthorisedCoreStats resolves accessLevel "public"', async () => {
			mockCoreStats(
				[buildCoreStatsRow({ species_name: 'Blue Tit' })],
				'public'
			);

			await fetchSpeciesData(viewedGroup, YEAR_FROM_DATE, YEAR_TO_DATE);

			expect(mockGetAuthenticatedSupabaseClient).not.toHaveBeenCalled();
		});

		it('fetches biometrics when accessLevel is "shared"', async () => {
			mockCoreStats(
				[buildCoreStatsRow({ species_name: 'Blue Tit' })],
				'shared'
			);
			mockAuthenticatedClient({ cacheRows: [buildBiometricsCacheRow()] });

			await fetchSpeciesData(viewedGroup, YEAR_FROM_DATE, YEAR_TO_DATE);

			expect(readTableNames).toEqual(['SimpleStatsCacheBySpecies']);
		});
	});

	describe('Edge', () => {
		it('returns no biometrics when the cache holds no matching rows', async () => {
			mockCoreStats();
			mockAuthenticatedClient({ cacheRows: [] });

			const [row] = await fetchSpeciesData(
				viewedGroup,
				YEAR_FROM_DATE,
				YEAR_TO_DATE
			);

			expect(row.species_name).toBe('Blue Tit');
			expect(row.max_weight).toBeUndefined();
			expect(row.median_wing).toBeUndefined();
		});

		it('returns no biometrics when the live RPC finds none for the group', async () => {
			mockCoreStats();
			mockAuthenticatedClient({ rpcRows: emptyBiometricsRows });

			const [row] = await fetchSpeciesData(
				viewedGroup,
				CES_FROM_DATE,
				CES_TO_DATE
			);

			expect(row.species_name).toBe('Blue Tit');
			expect(row.max_weight).toBeUndefined();
			expect(row.median_wing).toBeUndefined();
			// No ids to resolve, so the id→name map read is skipped entirely.
			expect(readTableNames).toEqual([]);
		});
	});
});

describe('fetchSpeciesData — merges the core-stats and biometrics rows by species_name', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Usual', () => {
		it('merges the biometric fields onto matching core-stats rows by species_name', async () => {
			mockCoreStats();
			mockAuthenticatedClient({
				cacheRows: [buildBiometricsCacheRow({ max_weight: 20, max_wing: 70 })]
			});

			const [row] = await fetchSpeciesData(
				viewedGroup,
				YEAR_FROM_DATE,
				YEAR_TO_DATE
			);

			expect(row.max_weight).toBe(20);
			expect(row.max_wing).toBe(70);
		});

		it('passes through non-biometric core-stats fields unchanged', async () => {
			mockCoreStats([
				buildCoreStatsRow({
					species_name: 'Blue Tit',
					bird_count: 12,
					encounter_count: 15,
					session_count: 3,
					max_per_session: 4
				})
			]);
			mockAuthenticatedClient({ cacheRows: [buildBiometricsCacheRow()] });

			const [row] = await fetchSpeciesData(
				viewedGroup,
				YEAR_FROM_DATE,
				YEAR_TO_DATE
			);

			expect(row.bird_count).toBe(12);
			expect(row.encounter_count).toBe(15);
			expect(row.session_count).toBe(3);
			expect(row.max_per_session).toBe(4);
		});

		it('requests the same window from both halves', async () => {
			mockCoreStats();
			mockAuthenticatedClient({ cacheRows: [buildBiometricsCacheRow()] });

			await fetchSpeciesData(viewedGroup, YEAR_FROM_DATE, YEAR_TO_DATE);

			expect(fetchAuthorisedCoreStats).toHaveBeenCalledWith(viewedGroup, {
				from_date: YEAR_FROM_DATE,
				to_date: YEAR_TO_DATE,
				group_by_species: true
			});
			expect(cacheFilterFor('temporal_unit', 'eq')).toBe('year');
			expect(cacheFilterFor('time_period', 'eq')).toBe(YEAR_FROM_DATE);
		});
	});

	describe('Edge', () => {
		it('leaves the 8 biometric fields undefined for a species with core stats but no biometrics row', async () => {
			mockCoreStats([buildCoreStatsRow({ species_name: 'Robin' })]);
			mockAuthenticatedClient({
				cacheRows: [buildBiometricsCacheRow({ speciesName: 'Wren' })]
			});

			const row = (
				await fetchSpeciesData(viewedGroup, YEAR_FROM_DATE, YEAR_TO_DATE)
			).find(({ species_name }) => species_name === 'Robin')!;

			expect(row.max_weight).toBeUndefined();
			expect(row.avg_weight).toBeUndefined();
			expect(row.min_weight).toBeUndefined();
			expect(row.median_weight).toBeUndefined();
			expect(row.max_wing).toBeUndefined();
			expect(row.avg_wing).toBeUndefined();
			expect(row.min_wing).toBeUndefined();
			expect(row.median_wing).toBeUndefined();
		});

		it('returns an empty array when core_stats returns no rows', async () => {
			mockCoreStats([]);
			mockAuthenticatedClient({ cacheRows: [] });

			const result = await fetchSpeciesData(
				viewedGroup,
				YEAR_FROM_DATE,
				YEAR_TO_DATE
			);

			expect(result).toEqual([]);
		});
	});
});
