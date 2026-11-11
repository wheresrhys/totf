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

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

const GROUP_ID = 1;
const viewedGroup: ViewedGroup = { id: GROUP_ID, slug: 'alpha' };
// A whole calendar year and a whole calendar month: both exactly one cache
// cell, so both resolve to the cache-aligned path.
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
 * `fetchAuthorisedCoreStats`' own cache-table read is a `select('*')`
 * against that exact table for that exact window (#1421 — `spp-data.ts`
 * reuses these columns rather than re-reading them). That is also what makes
 * the access-level tests below meaningful — a `'public'`/`'blocked'`
 * viewer's counts rows genuinely carry biometric data they are not entitled
 * to see.
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

/**
 * The authenticated client the arbitrary-window branch's `.rpc()` call goes
 * through. Nothing in this module calls `.from()` any more — the
 * cache-aligned branch reuses the counts row it was already handed (#1421)
 * instead of issuing its own `SimpleStatsCacheBySpecies` read, and the
 * arbitrary-window merge keys on `species_id`, which the counts rows already
 * carry, so it needs no `Species` name lookup either.
 */
function mockAuthenticatedClient({
	rpcRows = []
}: { rpcRows?: unknown[] } = {}) {
	const { rpc, calls: rpcCalls } = makeRpcCallRecorder(rpcRows);
	mockGetAuthenticatedSupabaseClient.mockResolvedValue({ rpc });
	return { rpcCalls };
}

function mockCoreStats(
	rows: AuthorisedStatsRow[] = [buildCountsRow()],
	accessLevel: GroupSummaryAccessLevel = 'own'
) {
	vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({ accessLevel, rows });
}

const rowFor = (rows: StatsCacheBySpeciesResult[], speciesName: string) =>
	rows.find((row) => row.species_name === speciesName)!;

beforeEach(() => {
	vi.clearAllMocks();
});

describe('choosing a read path for the requested window', () => {
	it.each`
		label                       | fromDate           | toDate
		${'an all-time window'}     | ${undefined}       | ${undefined}
		${'a whole calendar year'}  | ${YEAR_FROM_DATE}  | ${YEAR_TO_DATE}
		${'a whole calendar month'} | ${MONTH_FROM_DATE} | ${MONTH_TO_DATE}
	`(
		'answers $label straight from the counts read, with no further Supabase call',
		async ({ fromDate, toDate }) => {
			mockCoreStats([buildCachedCountsRow({ max_weight: 20 })]);
			mockAuthenticatedClient();

			const [row] = await fetchSpeciesData(viewedGroup, fromDate, toDate);

			expect(row.max_weight).toBe(20);
			expect(mockGetAuthenticatedSupabaseClient).not.toHaveBeenCalled();
		}
	);

	it('answers a squashed-month window the same way, forwarding month_filter to the counts read', async () => {
		mockCoreStats([buildCachedCountsRow()]);
		mockAuthenticatedClient();

		await fetchSpeciesData(viewedGroup, undefined, undefined, 3);

		expect(fetchAuthorisedCoreStats).toHaveBeenCalledWith(viewedGroup, {
			from_date: undefined,
			to_date: undefined,
			group_by_species: true,
			month_filter: 3
		});
		expect(mockGetAuthenticatedSupabaseClient).not.toHaveBeenCalled();
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
	});
});

describe('the cache-aligned path reuses the counts read', () => {
	it('issues no second SimpleStatsCacheBySpecies read for a cache-aligned window', async () => {
		mockCoreStats([buildCachedCountsRow()]);
		mockAuthenticatedClient();

		await fetchSpeciesData(viewedGroup, YEAR_FROM_DATE, YEAR_TO_DATE);

		// The counts read (`fetchAuthorisedCoreStats`, mocked above) is the
		// *only* Supabase call a cache-aligned window makes — #1421 collapses
		// what used to be a second, byte-identical `SimpleStatsCacheBySpecies`
		// query here into nothing at all.
		expect(mockGetAuthenticatedSupabaseClient).not.toHaveBeenCalled();
	});

	it("returns the counts row's own biometric columns unchanged", async () => {
		mockCoreStats([
			buildCachedCountsRow({ bird_count: 12, max_weight: 20, max_wing: 70 })
		]);
		mockAuthenticatedClient();

		const [row] = await fetchSpeciesData(
			viewedGroup,
			YEAR_FROM_DATE,
			YEAR_TO_DATE
		);

		expect(row.bird_count).toBe(12);
		expect(row.max_weight).toBe(20);
		expect(row.max_wing).toBe(70);
		expect(row.median_wing).toBe(ALPHA_FIRST_SPECIES_CACHE_ROW.median_wing);
	});

	it('passes species_name through from the counts row unchanged', async () => {
		mockCoreStats([buildCachedCountsRow({ species_name: WREN_SPECIES_NAME })]);
		mockAuthenticatedClient();

		const [row] = await fetchSpeciesData(
			viewedGroup,
			YEAR_FROM_DATE,
			YEAR_TO_DATE
		);

		expect(row.species_name).toBe(WREN_SPECIES_NAME);
	});

	it('preserves a null biometric metric for a species with no measurable encounters', async () => {
		mockCoreStats([
			buildCachedCountsRow({ max_weight: null, median_wing: null })
		]);
		mockAuthenticatedClient();

		const [row] = await fetchSpeciesData(
			viewedGroup,
			YEAR_FROM_DATE,
			YEAR_TO_DATE
		);

		expect(row.max_weight).toBeNull();
		expect(row.median_wing).toBeNull();
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
	it("reuses the counts read for the viewer's own group, with no further Supabase call", async () => {
		mockCoreStats([buildCachedCountsRow()], 'own');
		mockAuthenticatedClient();

		const [row] = await fetchSpeciesData(
			viewedGroup,
			YEAR_FROM_DATE,
			YEAR_TO_DATE
		);

		expect(row.max_weight).toBe(ALPHA_FIRST_SPECIES_CACHE_ROW.max_weight);
		expect(mockGetAuthenticatedSupabaseClient).not.toHaveBeenCalled();
	});

	it('reuses the counts read for a group shared with the viewer, with no further Supabase call', async () => {
		mockCoreStats([buildCachedCountsRow()], 'shared');
		mockAuthenticatedClient();

		const [row] = await fetchSpeciesData(
			viewedGroup,
			YEAR_FROM_DATE,
			YEAR_TO_DATE
		);

		expect(row.max_weight).toBe(ALPHA_FIRST_SPECIES_CACHE_ROW.max_weight);
		expect(mockGetAuthenticatedSupabaseClient).not.toHaveBeenCalled();
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
