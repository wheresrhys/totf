import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	fetchAuthorisedCoreStats,
	type AuthorisedStatsRow,
	type GroupSummaryAccessLevel
} from '@/app/lib/auth/group-summary-access';
import {
	BiometricStatNames,
	type BiometricStatName,
	type BiometricsMetricsRow,
	type StatsCacheBySpeciesResult
} from '@/modules/stats/browser';
import { fetchSpeciesData } from '../spp-data';
import { ALPHA_CORE_STATS_BY_SPECIES } from '@/app/__tests__/helpers/core-stats-fixtures';
import { ALPHA_BIOMETRICS_BY_SPECIES } from '@/app/__tests__/helpers/biometrics-stats-fixtures';
import { buildCoreStatsRow } from '@/app/__tests__/helpers/core-stats-fixtures';
import { makeRpcCallRecorder } from '@/app/__tests__/helpers/rpc-recorder';
import { makeQueryChain } from '@/app/__tests__/helpers/query-chain';
import type { ViewedGroup } from '@/app/lib/group-slug';

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

// `readStatsCacheRows` (`@/modules/stats`) is deliberately left real: it reads
// through this same mocked client, so the cache-aligned path's filters,
// `Species` embed, ordering and pagination are all exercised for real here
// rather than asserted as params handed to a mock.
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
// The /species list page's free-text date inputs' canonical arbitrary window,
// aligned to no cache cell, so the live stats_cache_biometrics_metrics RPC
// answers the biometric half and it has to be merged onto the counts half.
const ARBITRARY_WINDOW_FROM_DATE = '2026-04-25';
const ARBITRARY_WINDOW_TO_DATE = '2026-09-05';
// Two species whose id order and alphabetical name order deliberately
// disagree, so a merge that paired them by name — or by position — would
// produce a different answer than one keyed on species_id.
const WREN_SPECIES_ID = 7;
const WREN_SPECIES_NAME = 'Wren';
const BLUE_TIT_SPECIES_ID = 9;
const BLUE_TIT_SPECIES_NAME = 'Blue Tit';

const [ALPHA_FIRST_SPECIES_CACHE_ROW] = ALPHA_CORE_STATS_BY_SPECIES;

/**
 * The 8 wing/weight columns of Alpha's first `stats_cache_biometrics_metrics`
 * row — the real RPC result the arbitrary-window path merges in — picked off
 * by `BiometricStatNames` (`@/modules/stats`) rather than a local copy of the
 * column list, which is the same const production code now sources it from
 * (#1214).
 */
const ALPHA_BIOMETRIC_METRICS = Object.fromEntries(
	BiometricStatNames.map((name) => [name, ALPHA_BIOMETRICS_BY_SPECIES[0][name]])
) as Pick<StatsCacheBySpeciesResult, BiometricStatName>;

/**
 * A whole `SimpleStatsCacheBySpecies` row as PostgREST returns it for the
 * cache-aligned read: every column of the table, with `species_name` arriving
 * through the embedded `Species` select rather than as a column of its own.
 * Built from the snapshot fixture, so the values are real.
 */
function buildSpeciesCacheTableRow({
	speciesName = BLUE_TIT_SPECIES_NAME,
	...overrides
}: Partial<StatsCacheBySpeciesResult> & { speciesName?: string } = {}) {
	const {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to drop the one column the cache table doesn't return as a column
		species_name,
		...columns
	} = { ...ALPHA_FIRST_SPECIES_CACHE_ROW, ...overrides };
	return { ...columns, Species: { species_name: speciesName } };
}

/**
 * One counts row as the arbitrary-window *live recompute* resolves it: the
 * columns `stats_cache_basic_session_metrics` produces, plus every column it
 * doesn't, filled from `group-summary-access.ts`'
 * `UNAVAILABLE_COLUMN_PLACEHOLDERS` (#1417) — so a whole cache row's key set,
 * carrying the `species_id` the merge keys on (`AuthorisedStatsRow`). Defaults
 * to the Blue Tit.
 */
function buildCountsRow(
	overrides: Partial<AuthorisedStatsRow> = {}
): AuthorisedStatsRow {
	return {
		...buildCoreStatsRow(),
		species_id: BLUE_TIT_SPECIES_ID,
		species_name: BLUE_TIT_SPECIES_NAME,
		...overrides
	};
}

/**
 * One counts row as a *cache-aligned* read resolves it: a whole
 * `SimpleStatsCacheBySpecies` row, wing/weight columns included, because
 * `readStatsCacheRows` `select('*')`s. That is what makes the access-level
 * tests below meaningful — a `'public'`/`'blocked'` viewer's counts rows
 * genuinely carry biometric data they are not entitled to see.
 */
function buildCachedCountsRow(
	overrides: Partial<AuthorisedStatsRow> = {}
): AuthorisedStatsRow {
	return {
		...ALPHA_FIRST_SPECIES_CACHE_ROW,
		species_id: BLUE_TIT_SPECIES_ID,
		species_name: BLUE_TIT_SPECIES_NAME,
		...overrides
	};
}

/**
 * A `stats_cache_biometrics_metrics` row as the arbitrary-window fallback's
 * RPC returns it: the 8 wing/weight columns keyed on `species_id`, with no
 * `encounter_count` column at all.
 */
function buildBiometricsMetricsRpcRow({
	speciesId = BLUE_TIT_SPECIES_ID,
	...overrides
}: Partial<Pick<StatsCacheBySpeciesResult, BiometricStatName>> & {
	speciesId?: number | null;
} = {}): BiometricsMetricsRow {
	return {
		...ALPHA_BIOMETRIC_METRICS,
		...overrides,
		species_id: speciesId,
		time_period: null
	};
}

let tableReads: Map<string, ReturnType<typeof makeQueryChain>>;
let readTableNames: string[];

/**
 * The authenticated client both biometric sources go through: `.from()` serves
 * the cache-aligned branch's `SimpleStatsCacheBySpecies` read, and `.rpc()`
 * the arbitrary-window branch's `stats_cache_biometrics_metrics` call. A test
 * sets up whichever its window shape should reach, and asserts the other was
 * left alone.
 */
function mockAuthenticatedClient({
	cacheRows = [],
	rpcRows = []
}: {
	cacheRows?: unknown[] | ((fromRow?: number, toRow?: number) => unknown);
	rpcRows?: unknown[];
} = {}) {
	tableReads = new Map();
	readTableNames = [];
	const { rpc, calls: rpcCalls } = makeRpcCallRecorder(rpcRows);
	mockGetAuthenticatedSupabaseClient.mockResolvedValue({
		from: vi.fn((requestedTable: string) => {
			readTableNames.push(requestedTable);
			const read = makeQueryChain(
				requestedTable === 'SimpleStatsCacheBySpecies' ? cacheRows : []
			);
			tableReads.set(requestedTable, read);
			return read.chain;
		}),
		rpc
	});
	return { rpcCalls };
}

function mockCoreStats(
	rows: AuthorisedStatsRow[] = [buildCountsRow()],
	accessLevel: GroupSummaryAccessLevel = 'own'
) {
	vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({ accessLevel, rows });
}

const cacheFilters = () =>
	tableReads.get('SimpleStatsCacheBySpecies')?.record.filters ?? [];
const cacheFilterFor = (column: string, operator: string) =>
	cacheFilters().find((f) => f.column === column && f.operator === operator)
		?.value;
const rowFor = (rows: StatsCacheBySpeciesResult[], speciesName: string) =>
	rows.find((row) => row.species_name === speciesName)!;

beforeEach(() => {
	vi.clearAllMocks();
});

describe('choosing a read path for the requested window', () => {
	it('reads the cache for an all-time window', async () => {
		mockCoreStats();
		const { rpcCalls } = mockAuthenticatedClient({
			cacheRows: [buildSpeciesCacheTableRow()]
		});

		await fetchSpeciesData(viewedGroup);

		expect(readTableNames).toEqual(['SimpleStatsCacheBySpecies']);
		expect(cacheFilterFor('group_id', 'eq')).toBe(GROUP_ID);
		expect(cacheFilterFor('temporal_unit', 'eq')).toBe('all-time');
		// All-time is one cell per species, so no time_period narrowing.
		expect(cacheFilters().filter((f) => f.column === 'time_period')).toEqual(
			[]
		);
		expect(rpcCalls).toEqual([]);
	});

	it('reads the cache for a whole calendar year', async () => {
		mockCoreStats();
		mockAuthenticatedClient({ cacheRows: [buildSpeciesCacheTableRow()] });

		await fetchSpeciesData(viewedGroup, YEAR_FROM_DATE, YEAR_TO_DATE);

		expect(cacheFilterFor('temporal_unit', 'eq')).toBe('year');
		expect(cacheFilterFor('time_period', 'eq')).toBe(YEAR_FROM_DATE);
	});

	it('reads the cache for a whole calendar month', async () => {
		mockCoreStats();
		mockAuthenticatedClient({ cacheRows: [buildSpeciesCacheTableRow()] });

		await fetchSpeciesData(viewedGroup, MONTH_FROM_DATE, MONTH_TO_DATE);

		expect(cacheFilterFor('temporal_unit', 'eq')).toBe('month');
		expect(cacheFilterFor('time_period', 'eq')).toBe(MONTH_FROM_DATE);
	});

	it('reads the cache for a squashed calendar month', async () => {
		mockCoreStats();
		const { rpcCalls } = mockAuthenticatedClient({
			cacheRows: [buildSpeciesCacheTableRow()]
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

	it('recomputes live for an arbitrary date range', async () => {
		mockCoreStats();
		const { rpcCalls } = mockAuthenticatedClient({
			rpcRows: [buildBiometricsMetricsRpcRow()]
		});

		await fetchSpeciesData(
			viewedGroup,
			ARBITRARY_WINDOW_FROM_DATE,
			ARBITRARY_WINDOW_TO_DATE
		);

		expect(rpcCalls).toEqual([
			{
				name: 'stats_cache_biometrics_metrics',
				args: {
					ringing_group_filter: GROUP_ID,
					from_date: ARBITRARY_WINDOW_FROM_DATE,
					to_date: ARBITRARY_WINDOW_TO_DATE,
					group_by_species: true
				}
			}
		]);
		// No `group_by_time_period`, and no table read of any kind — the
		// species_id-keyed merge needs no Species id→name lookup.
		expect(readTableNames).toEqual([]);
	});
});

describe('the cache read', () => {
	it('returns one whole row per species, counts and biometrics together', async () => {
		// A counts row the cache read's own row deliberately disagrees with, so
		// the assertion can only pass if the returned row is the whole cache
		// row rather than the counts row with biometrics merged onto it.
		mockCoreStats([buildCountsRow({ bird_count: 999 })]);
		mockAuthenticatedClient({
			cacheRows: [buildSpeciesCacheTableRow({ bird_count: 12, max_weight: 20 })]
		});

		const [row] = await fetchSpeciesData(
			viewedGroup,
			YEAR_FROM_DATE,
			YEAR_TO_DATE
		);

		expect(row.bird_count).toBe(12);
		expect(row.max_weight).toBe(20);
		expect(row.median_wing).toBe(ALPHA_FIRST_SPECIES_CACHE_ROW.median_wing);
	});

	it('resolves species_name from the embedded Species row', async () => {
		mockCoreStats();
		mockAuthenticatedClient({
			cacheRows: [buildSpeciesCacheTableRow({ speciesName: WREN_SPECIES_NAME })]
		});

		const [row] = await fetchSpeciesData(
			viewedGroup,
			YEAR_FROM_DATE,
			YEAR_TO_DATE
		);

		expect(row.species_name).toBe(WREN_SPECIES_NAME);
	});

	it('preserves a null biometric metric for a species with no measurable encounters', async () => {
		mockCoreStats();
		mockAuthenticatedClient({
			cacheRows: [
				buildSpeciesCacheTableRow({ max_weight: null, median_wing: null })
			]
		});

		const [row] = await fetchSpeciesData(
			viewedGroup,
			YEAR_FROM_DATE,
			YEAR_TO_DATE
		);

		expect(row.max_weight).toBeNull();
		expect(row.median_wing).toBeNull();
	});

	it("pages through every species rather than stopping at PostgREST's first page", async () => {
		// One row short of two full PostgREST pages, so the read must issue a
		// second request to pick up the final species.
		const TOTAL_SPECIES = 1001;
		mockCoreStats();
		mockAuthenticatedClient({
			cacheRows: (fromRow = 0, toRow = 0) =>
				Array.from(
					{
						length: Math.min(
							toRow - fromRow + 1,
							Math.max(TOTAL_SPECIES - fromRow, 0)
						)
					},
					(_unused, offset) =>
						buildSpeciesCacheTableRow({
							speciesName: `Species ${fromRow + offset}`
						})
				)
		});

		const rows = await fetchSpeciesData(
			viewedGroup,
			YEAR_FROM_DATE,
			YEAR_TO_DATE
		);

		expect(rows).toHaveLength(TOTAL_SPECIES);
	});
});

describe('merging the live recompute', () => {
	it("pairs each species' counts with its own biometric metrics", async () => {
		mockCoreStats([
			buildCountsRow({
				species_id: WREN_SPECIES_ID,
				species_name: WREN_SPECIES_NAME
			}),
			buildCountsRow({
				species_id: BLUE_TIT_SPECIES_ID,
				species_name: BLUE_TIT_SPECIES_NAME
			})
		]);
		// Returned in the opposite order to the counts rows, so a merge pairing
		// by position rather than by species_id would swap the two answers.
		mockAuthenticatedClient({
			rpcRows: [
				buildBiometricsMetricsRpcRow({
					speciesId: BLUE_TIT_SPECIES_ID,
					max_wing: 70
				}),
				buildBiometricsMetricsRpcRow({
					speciesId: WREN_SPECIES_ID,
					max_wing: 50
				})
			]
		});

		const rows = await fetchSpeciesData(
			viewedGroup,
			ARBITRARY_WINDOW_FROM_DATE,
			ARBITRARY_WINDOW_TO_DATE
		);

		expect(rowFor(rows, WREN_SPECIES_NAME).max_wing).toBe(50);
		expect(rowFor(rows, BLUE_TIT_SPECIES_NAME).max_wing).toBe(70);
	});

	// There was a test here asserting the 4 `new_young_bird_count`/
	// `new_postjuv_*`/`postjuv_juv_enc_count` placeholders this module used to
	// fill in itself. #1417 moved them onto `group-summary-access.ts`'
	// `UNAVAILABLE_COLUMN_PLACEHOLDERS`, which `fetchAuthorisedCoreStats` applies
	// before the counts rows ever reach here — and that function is mocked in
	// this file, so the assertions would only have been re-reading the mock's own
	// fixture. They live in
	// `app/lib/auth/__tests__/group-summary-access.test.ts` now, alongside the
	// const that fills them.

	it('keeps a species present in the counts result but absent from the biometrics result', async () => {
		mockCoreStats([
			buildCountsRow({
				species_id: WREN_SPECIES_ID,
				species_name: WREN_SPECIES_NAME
			}),
			buildCountsRow()
		]);
		mockAuthenticatedClient({ rpcRows: [buildBiometricsMetricsRpcRow()] });

		const rows = await fetchSpeciesData(
			viewedGroup,
			ARBITRARY_WINDOW_FROM_DATE,
			ARBITRARY_WINDOW_TO_DATE
		);

		const wrenRow = rowFor(rows, WREN_SPECIES_NAME);
		expect(wrenRow.bird_count).toBe(buildCountsRow().bird_count);
		// Blank, not the counts row's own stale wing/weight values.
		expect(wrenRow.max_weight).toBeNull();
		expect(wrenRow.median_wing).toBeNull();
	});

	it('logs and drops a biometrics row whose species_id matches no counts row', async () => {
		mockCoreStats();
		mockAuthenticatedClient({
			rpcRows: [
				buildBiometricsMetricsRpcRow(),
				buildBiometricsMetricsRpcRow({ speciesId: 999 })
			]
		});
		const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const rows = await fetchSpeciesData(
			viewedGroup,
			ARBITRARY_WINDOW_FROM_DATE,
			ARBITRARY_WINDOW_TO_DATE
		);

		expect(rows).toHaveLength(1);
		expect(rows[0].species_name).toBe(BLUE_TIT_SPECIES_NAME);
		expect(logSpy).toHaveBeenCalledWith(
			expect.stringContaining('matched no counts row'),
			expect.objectContaining({ speciesIds: [999] })
		);
		logSpy.mockRestore();
	});
});

describe('gating biometrics on access level', () => {
	it("fetches biometrics for the viewer's own group", async () => {
		mockCoreStats(undefined, 'own');
		mockAuthenticatedClient({ cacheRows: [buildSpeciesCacheTableRow()] });

		await fetchSpeciesData(viewedGroup, YEAR_FROM_DATE, YEAR_TO_DATE);

		expect(readTableNames).toEqual(['SimpleStatsCacheBySpecies']);
	});

	it('fetches biometrics for a group shared with the viewer', async () => {
		mockCoreStats(undefined, 'shared');
		mockAuthenticatedClient({ cacheRows: [buildSpeciesCacheTableRow()] });

		await fetchSpeciesData(viewedGroup, YEAR_FROM_DATE, YEAR_TO_DATE);

		expect(readTableNames).toEqual(['SimpleStatsCacheBySpecies']);
	});

	// The #1231 guarantee. The counts rows a 'public'/'blocked' viewer's read
	// resolves are whole cache rows, so they carry real wing/weight values at
	// runtime — these two assert they never reach the page.
	it.each(['public', 'blocked'] as const)(
		"leaves the biometric columns blank for a '%s' viewer",
		async (accessLevel) => {
			mockCoreStats([buildCachedCountsRow()], accessLevel);
			mockAuthenticatedClient();

			const [row] = await fetchSpeciesData(
				viewedGroup,
				YEAR_FROM_DATE,
				YEAR_TO_DATE
			);

			// The fixture precondition this test rests on.
			expect(ALPHA_FIRST_SPECIES_CACHE_ROW.max_weight).not.toBeNull();
			expect(row.species_name).toBe(BLUE_TIT_SPECIES_NAME);
			for (const biometricStatName of BiometricStatNames) {
				expect(row[biometricStatName]).toBeNull();
			}
			expect(mockGetAuthenticatedSupabaseClient).not.toHaveBeenCalled();
		}
	);
});
