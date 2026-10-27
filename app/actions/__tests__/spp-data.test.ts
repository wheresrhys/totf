import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchAuthorisedCoreStats } from '@/app/lib/auth/group-summary-access';
import type { BiometricsStatsResult } from '@/app/models/db';
import { fetchSpeciesData } from '../spp-data';
import alphaBiometricsBySpecies from '@/test-fixtures/snapshots/biometrics_stats/alpha.by-species.json';
import gammaBiometricsBySpecies from '@/test-fixtures/snapshots/biometrics_stats/gamma.by-species.json';
import { buildCoreStatsRow } from '@/app/__tests__/helpers/core-stats-fixtures';
import { makeRpcCallRecorder } from '@/app/__tests__/helpers/rpc-recorder';
import { makeQueryChain } from '@/app/__tests__/helpers/query-chain';
import type { ViewedGroup } from '@/app/lib/group-slug';

// Real captured biometrics_stats output for the exact call fetchSpeciesData
// makes (group-wide, group_by_species). Alpha's first row is the Blue Tit that
// every bare buildCoreStatsRow({ species_name: 'Blue Tit' }) call below
// deliberately matches (buildCoreStatsRow's own default `species_name` is
// `null`), so the two builders line up on species_name and
// mergeSpeciesBiometrics actually joins them; Gamma's is genuinely empty —
// that group has no biometric-eligible encounters at all — which is the
// fixture-backed no-biometrics-anywhere edge case (#883).
const capturedBiometricsRows =
	alphaBiometricsBySpecies as BiometricsStatsResult[];
const emptyBiometricsRows = gammaBiometricsBySpecies as BiometricsStatsResult[];

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
// aligned to no cache cell, so the live biometrics_stats RPC answers it.
const CES_FROM_DATE = '2026-04-25';
const CES_TO_DATE = '2026-09-05';

/**
 * A `SimpleStatsCacheBySpecies` row as PostgREST returns it for the biometrics
 * read: the 8 wing/weight columns plus `encounter_count`, with the species
 * name arriving through the embedded `Species` select rather than as a column
 * of its own. Built from the captured RPC row so the values are real.
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

function buildBiometricsRpcRow(
	overrides: Partial<BiometricsStatsResult> = {}
): BiometricsStatsResult {
	return { ...capturedBiometricsRows[0], ...overrides };
}

let cacheRead: ReturnType<typeof makeQueryChain>;
let readTableName: string | undefined;

/**
 * The authenticated client both biometrics paths go through: `.from()` serves
 * the cache read, `.rpc()` the arbitrary-window fallback. A test sets up
 * whichever half its window shape should reach, and asserts the other was
 * left alone.
 */
function mockAuthenticatedClient({
	cacheRows = [],
	rpcRows = []
}: { cacheRows?: unknown[]; rpcRows?: unknown[] } = {}) {
	cacheRead = makeQueryChain(cacheRows);
	readTableName = undefined;
	const { rpc, calls: rpcCalls } = makeRpcCallRecorder(rpcRows);
	mockGetAuthenticatedSupabaseClient.mockResolvedValue({
		from: vi.fn((requestedTable: string) => {
			readTableName = requestedTable;
			return cacheRead.chain;
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

const cacheFilters = () => cacheRead.record.filters;
const cacheFilterFor = (column: string, operator: string) =>
	cacheFilters().find((f) => f.column === column && f.operator === operator)
		?.value;
const selectedCacheColumns = () => cacheRead.record.select ?? '';

describe('fetchBiometricsStats', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('cache-aligned window', () => {
		it("reads SimpleStatsCacheBySpecies' biometric columns from the all-time grain when no window is given", async () => {
			mockCoreStats();
			mockAuthenticatedClient({ cacheRows: [buildBiometricsCacheRow()] });

			const [row] = await fetchSpeciesData(viewedGroup);

			expect(readTableName).toBe('SimpleStatsCacheBySpecies');
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
		it('falls back to the live biometrics_stats RPC for a window aligned to no cache cell', async () => {
			mockCoreStats();
			const { rpcCalls } = mockAuthenticatedClient({
				rpcRows: [buildBiometricsRpcRow({ max_weight: 20, max_wing: 70 })]
			});

			const [row] = await fetchSpeciesData(
				viewedGroup,
				CES_FROM_DATE,
				CES_TO_DATE
			);

			expect(rpcCalls).toEqual([
				{
					name: 'biometrics_stats',
					args: {
						ringing_group_filter: GROUP_ID,
						from_date: CES_FROM_DATE,
						to_date: CES_TO_DATE,
						group_by_species: true
					}
				}
			]);
			expect(readTableName).toBeUndefined();
			expect(row.max_weight).toBe(20);
			expect(row.max_wing).toBe(70);
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

			expect(readTableName).toBe('SimpleStatsCacheBySpecies');
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
