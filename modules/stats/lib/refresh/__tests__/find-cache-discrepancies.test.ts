import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Database } from '@/types/supabase.types';
import { findSimpleStatsCacheDiscrepancies } from '../find-cache-discrepancies';
import { readStatsCacheRows } from '../../stats-cache';

// `readStatsCacheRows` is this function's one non-RPC collaborator, and it has
// its own test suite (`lib/__tests__/stats-cache.test.ts`) — mocked here as a
// black box so these tests assert what scope the comparator asks the cache
// for, rather than re-exercising PostgREST chain building.
vi.mock('../../stats-cache', () => ({
	readStatsCacheRows: vi.fn(async () => [] as Record<string, unknown>[])
}));

// Every DB call logs a `console.log` on success; silenced so the ordinary
// success path across this file stays quiet.
let defaultConsoleLogSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(readStatsCacheRows).mockResolvedValue([]);
	defaultConsoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
	defaultConsoleLogSpy.mockRestore();
});

type BasicRow =
	Database['public']['CompositeTypes']['stats_cache_basic_session_metrics_result'];
type BiometricsRow =
	Database['public']['CompositeTypes']['stats_cache_biometrics_metrics_result'];
type BirdAgeRow =
	Database['public']['CompositeTypes']['stats_cache_bird_age_metrics_result'];
type EncounterAgeRow =
	Database['public']['CompositeTypes']['stats_cache_encounter_age_metrics_result'];

const GROUP_ID = 99;
const PERIOD = '2026-03-01';

/** The sentinel `time_period` the cache tables store for the all-time grain, in
 * place of the NULL the metric RPCs emit. Spelled out rather than imported, so
 * a change to it has to be made deliberately in two places. */
const ALL_TIME_SENTINEL_DATE = '0001-01-01';

/** The four metric RPCs one comparison calls. */
const SIMPLE_METRIC_RPC_NAMES = [
	'stats_cache_basic_session_metrics',
	'stats_cache_biometrics_metrics',
	'stats_cache_bird_age_metrics',
	'stats_cache_encounter_age_metrics'
] as const;

// Fixture builders: flat overrides merged over a sensible default, one per
// metric RPC's own composite return type.
function basicRow(overrides: Partial<BasicRow> = {}): BasicRow {
	return {
		species_id: 1,
		time_period: PERIOD,
		species_count: 1,
		bird_count: 1,
		encounter_count: 1,
		new_bird_count: 0,
		session_count: 1,
		avg_encounters_per_session: 1,
		max_per_session: 1,
		max_new_per_session: 0,
		...overrides
	};
}

function biometricsRow(overrides: Partial<BiometricsRow> = {}): BiometricsRow {
	return {
		species_id: 1,
		time_period: PERIOD,
		max_weight: 20,
		avg_weight: 20,
		min_weight: 20,
		median_weight: 20,
		max_wing: 80,
		avg_wing: 80,
		min_wing: 80,
		median_wing: 80,
		...overrides
	};
}

function birdAgeRow(overrides: Partial<BirdAgeRow> = {}): BirdAgeRow {
	return {
		species_id: 1,
		time_period: PERIOD,
		pullus_bird_count: 0,
		juv_bird_count: 0,
		postjuv_bird_count: 0,
		adult_bird_count: 1,
		unknown_age_bird_count: 0,
		new_young_bird_count: 0,
		...overrides
	};
}

function encounterAgeRow(
	overrides: Partial<EncounterAgeRow> = {}
): EncounterAgeRow {
	return {
		species_id: 1,
		time_period: PERIOD,
		pullus_enc_count: 0,
		juv_enc_count: 0,
		postjuv_enc_count: 0,
		adult_enc_count: 1,
		unknown_age_enc_count: 0,
		postjuv_juv_enc_count: 0,
		new_postjuv_juv_enc_count: 0,
		new_postjuv_enc_count: 0,
		...overrides
	};
}

/**
 * The merged cache row the four fixture builders above agree on, for one
 * `(species_id, time_period)` cell — i.e. what the comparator computes as the
 * live side, in the shape a cached row comes back in. `overrides` make it
 * diverge, which is the whole point of the matching tests.
 */
function cachedRowFor(
	{ species_id = 1, time_period = PERIOD as string | null } = {},
	overrides: Record<string, unknown> = {}
): Record<string, unknown> {
	return {
		id: 1,
		group_id: GROUP_ID,
		temporal_unit: 'day',
		species_id,
		time_period,
		species_count: 1,
		bird_count: 1,
		encounter_count: 1,
		new_bird_count: 0,
		session_count: 1,
		avg_encounters_per_session: 1,
		max_per_session: 1,
		max_new_per_session: 0,
		max_weight: 20,
		avg_weight: 20,
		min_weight: 20,
		median_weight: 20,
		max_wing: 80,
		avg_wing: 80,
		min_wing: 80,
		median_wing: 80,
		pullus_bird_count: 0,
		juv_bird_count: 0,
		postjuv_bird_count: 0,
		adult_bird_count: 1,
		unknown_age_bird_count: 0,
		new_young_bird_count: 0,
		pullus_enc_count: 0,
		juv_enc_count: 0,
		postjuv_enc_count: 0,
		adult_enc_count: 1,
		unknown_age_enc_count: 0,
		postjuv_juv_enc_count: 0,
		new_postjuv_juv_enc_count: 0,
		new_postjuv_enc_count: 0,
		...overrides
	};
}

type RpcParams = Record<string, unknown>;
type MockRpcResponse<Row> = Row[] | ((params: RpcParams) => Row[]);
type MockRpcError = { message: string };

/**
 * A minimal fake Supabase client whose `.rpc()` resolves per-RPC-name and
 * records every call, and whose `.from('Sessions').select().eq().order()`
 * chain serves `fetchGroupSessionDates`' day-unit preflight. The cached-side
 * read never touches this client — `readStatsCacheRows` is module-mocked above.
 */
function makeMockSupabaseClient({
	basic = [],
	biometrics = [],
	birdAge = [],
	encounterAge = [],
	sessionsVisitDates = [],
	rpcErrorsByName = {}
}: {
	basic?: MockRpcResponse<BasicRow>;
	biometrics?: MockRpcResponse<BiometricsRow>;
	birdAge?: MockRpcResponse<BirdAgeRow>;
	encounterAge?: MockRpcResponse<EncounterAgeRow>;
	sessionsVisitDates?: string[];
	rpcErrorsByName?: Record<string, MockRpcError>;
}) {
	const responsesByRpcName: Record<string, MockRpcResponse<unknown>> = {
		stats_cache_basic_session_metrics: basic,
		stats_cache_biometrics_metrics: biometrics,
		stats_cache_bird_age_metrics: birdAge,
		stats_cache_encounter_age_metrics: encounterAge
	};
	// Every `.range()` call any RPC made, in call order — `fetchMetricRows`
	// now always pages through `fetchAllPaginatedRows`, so a real PostgREST
	// Range slice (rather than ignoring the bounds and returning everything)
	// is what lets a >1000-row fixture exercise the real second-page call.
	const rangeCalls: Array<{ rpcName: string; fromRow: number; toRow: number }> =
		[];

	// Typed via `vi.fn`'s type parameter (the `insert`/`upsert` fakes
	// elsewhere in this file use the same pattern) so a call's 3rd
	// (`{ get: true }`) argument stays assertable even though the
	// implementation itself never reads it.
	const rpc = vi.fn<
		(
			name: string,
			params: RpcParams,
			options?: { get?: boolean }
		) => { range: (fromRow: number, toRow: number) => unknown }
	>((name, params) => {
		const response = responsesByRpcName[name];
		const error = rpcErrorsByName[name] ?? null;
		const fullRows = (): unknown[] =>
			(typeof response === 'function'
				? response(params)
				: response ?? []) as unknown[];
		return {
			range: (fromRow: number, toRow: number) => {
				rangeCalls.push({ rpcName: name, fromRow, toRow });
				return {
					then: (
						resolve: (v: {
							data: unknown;
							error: { message: string } | null;
						}) => unknown
					) =>
						Promise.resolve({
							data: error ? null : fullRows().slice(fromRow, toRow + 1),
							error
						}).then(resolve)
				};
			}
		};
	});

	const order = vi.fn(() => ({
		then: (
			resolve: (v: { data: unknown; error: null }) => unknown
		): Promise<unknown> =>
			Promise.resolve({
				data: sessionsVisitDates.map((visit_date) => ({ visit_date })),
				error: null
			}).then(resolve)
	}));
	const eq = vi.fn(() => ({ order }));
	const select = vi.fn(() => ({ eq }));
	const from = vi.fn(() => ({ select }));

	return { rpc, from, select, eq, order, rangeCalls };
}

type MockSupabaseClient = ReturnType<typeof makeMockSupabaseClient>;

/** A client whose four metric RPCs all describe the same single complete cell. */
function completeCellClient(
	options: Parameters<typeof makeMockSupabaseClient>[0] = {}
) {
	return makeMockSupabaseClient({
		basic: [basicRow()],
		biometrics: [biometricsRow()],
		birdAge: [birdAgeRow()],
		encounterAge: [encounterAgeRow()],
		...options
	});
}

/** Every params object one metric RPC was called with, in call order. */
function metricRpcCallArgsList(client: MockSupabaseClient, rpcName: string) {
	return vi
		.mocked(client.rpc)
		.mock.calls.filter((call) => call[0] === rpcName)
		.map((call) => call[1]);
}

/** Every `rpc(...)` call's 3rd (options) argument, for one RPC name, in call order. */
function metricRpcCallOptionsList(client: MockSupabaseClient, rpcName: string) {
	return vi
		.mocked(client.rpc)
		.mock.calls.filter((call) => call[0] === rpcName)
		.map((call) => call[2]);
}

/** Every `.range(fromRow, toRow)` call one metric RPC's result chained, in call order. */
function metricRpcRangeCallsList(client: MockSupabaseClient, rpcName: string) {
	return client.rangeCalls
		.filter((call) => call.rpcName === rpcName)
		.map(({ fromRow, toRow }) => ({ fromRow, toRow }));
}

/** The scope the cached-side read was asked for. */
function cacheReadArgs(callIndex = 0) {
	return vi.mocked(readStatsCacheRows).mock.calls[callIndex]?.[0];
}

/** Runs a comparison against a day-unit scope, the common case these tests use. */
function findDiscrepancies(
	client: MockSupabaseClient,
	params: Partial<Parameters<typeof findSimpleStatsCacheDiscrepancies>[1]> = {}
) {
	return findSimpleStatsCacheDiscrepancies(client as never, {
		groupId: GROUP_ID,
		temporalUnit: 'day',
		groupBySpecies: true,
		periods: [PERIOD],
		...params
	});
}

describe('findSimpleStatsCacheDiscrepancies', () => {
	describe('scoping which periods to compare', () => {
		it.each(['day', 'month', 'year', 'month-squashed'] as const)(
			'returns no discrepancies without calling any RPC when the %s temporal unit has no periods to check',
			async (temporalUnit) => {
				const client = completeCellClient();

				const discrepancies = await findDiscrepancies(client, {
					temporalUnit,
					periods: []
				});

				expect(discrepancies).toEqual([]);
				expect(client.rpc).not.toHaveBeenCalled();
				expect(readStatsCacheRows).not.toHaveBeenCalled();
			}
		);

		it('fetches the day unit’s session-date preflight only when temporalUnit is day and periods are given', async () => {
			const client = completeCellClient({ sessionsVisitDates: [PERIOD] });

			await findDiscrepancies(client);

			expect(client.from).toHaveBeenCalledWith('Sessions');
			expect(client.eq).toHaveBeenCalledWith('ringing_group_id', GROUP_ID);
			expect(client.order).toHaveBeenCalledWith('visit_date', {
				ascending: true
			});

			vi.clearAllMocks();
			const monthClient = completeCellClient();
			await findDiscrepancies(monthClient, {
				temporalUnit: 'month',
				periods: [PERIOD]
			});
			expect(monthClient.select).not.toHaveBeenCalled();
		});

		it('ignores periods entirely for the all-time temporal unit, comparing the whole group history', async () => {
			const client = makeMockSupabaseClient({
				basic: [basicRow({ time_period: null })],
				biometrics: [biometricsRow({ time_period: null })],
				birdAge: [birdAgeRow({ time_period: null })],
				encounterAge: [encounterAgeRow({ time_period: null })]
			});

			await findDiscrepancies(client, {
				temporalUnit: 'all-time',
				periods: [PERIOD]
			});

			const params = metricRpcCallArgsList(
				client,
				'stats_cache_basic_session_metrics'
			)[0] as RpcParams;
			expect(params).toEqual({
				ringing_group_filter: GROUP_ID,
				group_by_species: true
			});
		});
	});

	describe('fetching the live-computed rows', () => {
		it('calls all four metric RPCs with the filter params rpc-params builds for the given scope', async () => {
			const client = completeCellClient({ sessionsVisitDates: [PERIOD] });

			await findDiscrepancies(client);

			for (const rpcName of SIMPLE_METRIC_RPC_NAMES) {
				expect(metricRpcCallArgsList(client, rpcName)).toEqual([
					{
						ringing_group_filter: GROUP_ID,
						group_by_species: true,
						group_by_time_period: 'day',
						from_date: PERIOD,
						to_date: PERIOD
					}
				]);
			}
		});

		it('rethrows the first failure if any of the four metric RPCs fails, without reading the cache', async () => {
			const consoleErrorSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});
			const client = completeCellClient({
				sessionsVisitDates: [PERIOD],
				rpcErrorsByName: {
					stats_cache_biometrics_metrics: { message: 'statement timeout' }
				}
			});

			await expect(findDiscrepancies(client)).rejects.toThrow(
				'Failed to fetch data: statement timeout'
			);

			// Every RPC is still attempted — only the cache read is skipped.
			for (const rpcName of SIMPLE_METRIC_RPC_NAMES) {
				expect(metricRpcCallArgsList(client, rpcName)).toHaveLength(1);
			}
			expect(readStatsCacheRows).not.toHaveBeenCalled();

			consoleErrorSpy.mockRestore();
		});

		it('calls each metric RPC via GET and requests its first page via range(0, 999), so PostgREST Range-based pagination is honoured', async () => {
			const client = completeCellClient({ sessionsVisitDates: [PERIOD] });

			await findDiscrepancies(client);

			for (const rpcName of SIMPLE_METRIC_RPC_NAMES) {
				expect(metricRpcCallOptionsList(client, rpcName)).toEqual([
					{ get: true }
				]);
				expect(metricRpcRangeCallsList(client, rpcName)).toEqual([
					{ fromRow: 0, toRow: 999 }
				]);
			}
		});

		it("fetches a second page and concatenates it when a filter window's live result exceeds PostgREST's 1000-row cap", async () => {
			const totalSpecies = 1100;
			const speciesIds = Array.from(
				{ length: totalSpecies },
				(_, i) => i + 1
			);
			const client = makeMockSupabaseClient({
				basic: speciesIds.map((species_id) => basicRow({ species_id })),
				biometrics: speciesIds.map((species_id) =>
					biometricsRow({ species_id })
				),
				birdAge: speciesIds.map((species_id) => birdAgeRow({ species_id })),
				encounterAge: speciesIds.map((species_id) =>
					encounterAgeRow({ species_id })
				),
				sessionsVisitDates: [PERIOD]
			});

			const discrepancies = await findDiscrepancies(client);

			// The cache is empty, so every live cell is a presence-mismatch
			// discrepancy — including the species past the old single-page cap,
			// which a non-paginating fetch would have silently dropped.
			const discrepantSpeciesIds = discrepancies.map((d) => d.species_id);
			expect(discrepantSpeciesIds).toHaveLength(totalSpecies);
			expect(discrepantSpeciesIds).toContain(1);
			expect(discrepantSpeciesIds).toContain(totalSpecies);
			expect(
				metricRpcRangeCallsList(client, 'stats_cache_basic_session_metrics')
			).toEqual([
				{ fromRow: 0, toRow: 999 },
				{ fromRow: 1000, toRow: 1999 }
			]);
		});
	});

	describe('narrowing the live rows to the requested scope', () => {
		it('drops live cells for periods outside the requested set, for a narrowing temporal unit', async () => {
			// The day window returns an untouched gap period alongside the touched one.
			const gapPeriod = '2026-03-15';
			const client = makeMockSupabaseClient({
				basic: [basicRow(), basicRow({ time_period: gapPeriod })],
				biometrics: [
					biometricsRow(),
					biometricsRow({ time_period: gapPeriod })
				],
				birdAge: [birdAgeRow(), birdAgeRow({ time_period: gapPeriod })],
				encounterAge: [
					encounterAgeRow(),
					encounterAgeRow({ time_period: gapPeriod })
				],
				sessionsVisitDates: [PERIOD, gapPeriod]
			});

			const discrepancies = await findDiscrepancies(client);

			// The cache is empty, so every surviving live cell is a discrepancy —
			// the gap period's isn't among them.
			expect(discrepancies.map((d) => d.time_period)).toEqual([PERIOD]);
		});

		it('drops live cells for species outside speciesIds, when given', async () => {
			const client = makeMockSupabaseClient({
				basic: [basicRow({ species_id: 1 }), basicRow({ species_id: 2 })],
				biometrics: [
					biometricsRow({ species_id: 1 }),
					biometricsRow({ species_id: 2 })
				],
				birdAge: [birdAgeRow({ species_id: 1 }), birdAgeRow({ species_id: 2 })],
				encounterAge: [
					encounterAgeRow({ species_id: 1 }),
					encounterAgeRow({ species_id: 2 })
				],
				sessionsVisitDates: [PERIOD]
			});

			const discrepancies = await findDiscrepancies(client, {
				speciesIds: [2]
			});

			expect(discrepancies.map((d) => d.species_id)).toEqual([2]);
		});

		it('keeps every species when speciesIds is omitted', async () => {
			const client = makeMockSupabaseClient({
				basic: [basicRow({ species_id: 1 }), basicRow({ species_id: 2 })],
				biometrics: [
					biometricsRow({ species_id: 1 }),
					biometricsRow({ species_id: 2 })
				],
				birdAge: [birdAgeRow({ species_id: 1 }), birdAgeRow({ species_id: 2 })],
				encounterAge: [
					encounterAgeRow({ species_id: 1 }),
					encounterAgeRow({ species_id: 2 })
				],
				sessionsVisitDates: [PERIOD]
			});

			const discrepancies = await findDiscrepancies(client);

			expect(discrepancies.map((d) => d.species_id).sort()).toEqual([1, 2]);
		});
	});

	describe('fetching the cached rows', () => {
		it('reads SimpleStatsCacheBySpecies when groupBySpecies is true, SimpleStatsCache otherwise', async () => {
			// `readStatsCacheRows` picks the table off `bySpecies` — see its own doc.
			await findDiscrepancies(
				completeCellClient({ sessionsVisitDates: [PERIOD] }),
				{ groupBySpecies: true }
			);
			expect(cacheReadArgs()).toMatchObject({ bySpecies: true });

			vi.clearAllMocks();
			vi.mocked(readStatsCacheRows).mockResolvedValue([]);
			await findDiscrepancies(
				completeCellClient({ sessionsVisitDates: [PERIOD] }),
				{ groupBySpecies: false }
			);
			expect(cacheReadArgs()).toMatchObject({ bySpecies: false });
		});

		it('reads the cache over a fromDate/toDate window spanning the requested periods, for a narrowing temporal unit', async () => {
			const client = completeCellClient({
				sessionsVisitDates: ['2026-03-01', '2026-03-28']
			});

			await findDiscrepancies(client, {
				// Deliberately unsorted — the window is the min/max, not the first/last.
				periods: ['2026-03-28', '2026-03-01']
			});

			expect(cacheReadArgs()).toMatchObject({
				viewedGroup: { id: GROUP_ID },
				temporalUnit: 'day',
				fromDate: '2026-03-01',
				toDate: '2026-03-28'
			});
		});

		it('reads the whole cache table with no date filter for the all-time temporal unit', async () => {
			const client = makeMockSupabaseClient({
				basic: [basicRow({ time_period: null })],
				biometrics: [biometricsRow({ time_period: null })],
				birdAge: [birdAgeRow({ time_period: null })],
				encounterAge: [encounterAgeRow({ time_period: null })]
			});

			await findDiscrepancies(client, {
				temporalUnit: 'all-time',
				periods: [PERIOD]
			});

			const args = cacheReadArgs() as Record<string, unknown>;
			expect(args).not.toHaveProperty('fromDate');
			expect(args).not.toHaveProperty('toDate');
		});

		it('normalizes the cache’s all-time sentinel time_period back to null before matching it against the live rows’ key', async () => {
			const client = makeMockSupabaseClient({
				basic: [basicRow({ time_period: null })],
				biometrics: [biometricsRow({ time_period: null })],
				birdAge: [birdAgeRow({ time_period: null })],
				encounterAge: [encounterAgeRow({ time_period: null })]
			});
			vi.mocked(readStatsCacheRows).mockResolvedValue([
				cachedRowFor({ time_period: ALL_TIME_SENTINEL_DATE })
			]);

			const discrepancies = await findDiscrepancies(client, {
				temporalUnit: 'all-time'
			});

			// Without the sentinel reversal, `null` and `0001-01-01` would key
			// apart and produce two spurious presence mismatches.
			expect(discrepancies).toEqual([]);
		});
	});

	describe('matching live and cached rows by (species_id, time_period) and comparing them', () => {
		it('omits a cell from the result when its cached and live values are identical in every field', async () => {
			const client = completeCellClient({ sessionsVisitDates: [PERIOD] });
			vi.mocked(readStatsCacheRows).mockResolvedValue([cachedRowFor()]);

			expect(await findDiscrepancies(client)).toEqual([]);
		});

		it('lists every differing field in mismatchedFields when a cell’s cached and live values diverge', async () => {
			const client = completeCellClient({ sessionsVisitDates: [PERIOD] });
			vi.mocked(readStatsCacheRows).mockResolvedValue([
				cachedRowFor({}, { bird_count: 7, max_weight: 33 })
			]);

			const discrepancies = await findDiscrepancies(client);

			expect(discrepancies).toHaveLength(1);
			expect(discrepancies[0]).toMatchObject({
				species_id: 1,
				time_period: PERIOD,
				mismatchedFields: ['bird_count', 'max_weight']
			});
			expect(discrepancies[0].cachedRow).toMatchObject({ bird_count: 7 });
			expect(discrepancies[0].liveRow).toMatchObject({ bird_count: 1 });
		});

		it('reports a discrepancy with cachedRow null when a live cell has no matching cached row', async () => {
			const client = completeCellClient({ sessionsVisitDates: [PERIOD] });

			const discrepancies = await findDiscrepancies(client);

			expect(discrepancies).toHaveLength(1);
			expect(discrepancies[0]).toMatchObject({
				species_id: 1,
				time_period: PERIOD,
				cachedRow: null,
				mismatchedFields: []
			});
			expect(discrepancies[0].liveRow).toMatchObject({ bird_count: 1 });
		});

		it('reports a discrepancy with liveRow null when a cached cell has no matching live row', async () => {
			const client = completeCellClient({ sessionsVisitDates: [PERIOD] });
			vi.mocked(readStatsCacheRows).mockResolvedValue([
				cachedRowFor(),
				cachedRowFor({ species_id: 2 })
			]);

			const discrepancies = await findDiscrepancies(client);

			// Species 1 matches exactly; species 2 is cached but no longer computed.
			expect(discrepancies).toHaveLength(1);
			expect(discrepancies[0]).toMatchObject({
				species_id: 2,
				time_period: PERIOD,
				liveRow: null,
				mismatchedFields: []
			});
			expect(discrepancies[0].cachedRow).toMatchObject({ species_id: 2 });
		});

		describe('presence mismatches against an effectively-empty row', () => {
			/** Every metric field zeroed/nulled out, as a touched-but-otherwise-empty cell's four RPC rows would report it. */
			function allZeroRpcRows() {
				return {
					basic: [
						basicRow({
							species_count: 0,
							bird_count: 0,
							encounter_count: 0,
							new_bird_count: 0,
							session_count: 0,
							avg_encounters_per_session: 0,
							max_per_session: 0,
							max_new_per_session: 0
						})
					],
					biometrics: [
						biometricsRow({
							max_weight: null,
							avg_weight: null,
							min_weight: null,
							median_weight: null,
							max_wing: null,
							avg_wing: null,
							min_wing: null,
							median_wing: null
						})
					],
					birdAge: [
						birdAgeRow({
							pullus_bird_count: 0,
							juv_bird_count: 0,
							postjuv_bird_count: 0,
							adult_bird_count: 0,
							unknown_age_bird_count: 0,
							new_young_bird_count: 0
						})
					],
					encounterAge: [
						encounterAgeRow({
							pullus_enc_count: 0,
							juv_enc_count: 0,
							postjuv_enc_count: 0,
							adult_enc_count: 0,
							unknown_age_enc_count: 0,
							postjuv_juv_enc_count: 0,
							new_postjuv_juv_enc_count: 0,
							new_postjuv_enc_count: 0
						})
					]
				};
			}

			it('is not reported when a live-only cell has every metric at zero', async () => {
				const client = makeMockSupabaseClient({
					...allZeroRpcRows(),
					sessionsVisitDates: [PERIOD]
				});

				const discrepancies = await findDiscrepancies(client);

				expect(discrepancies).toEqual([]);
			});

			it('is not reported when a cached-only row has every metric at zero/null', async () => {
				const client = makeMockSupabaseClient({
					sessionsVisitDates: [PERIOD]
				});
				vi.mocked(readStatsCacheRows).mockResolvedValue([
					cachedRowFor(
						{},
						{
							species_count: 0,
							bird_count: 0,
							encounter_count: 0,
							new_bird_count: 0,
							session_count: 0,
							avg_encounters_per_session: 0,
							max_per_session: 0,
							max_new_per_session: 0,
							max_weight: null,
							avg_weight: null,
							min_weight: null,
							median_weight: null,
							max_wing: null,
							avg_wing: null,
							min_wing: null,
							median_wing: null,
							pullus_bird_count: 0,
							juv_bird_count: 0,
							postjuv_bird_count: 0,
							adult_bird_count: 0,
							unknown_age_bird_count: 0,
							new_young_bird_count: 0,
							pullus_enc_count: 0,
							juv_enc_count: 0,
							postjuv_enc_count: 0,
							adult_enc_count: 0,
							unknown_age_enc_count: 0,
							postjuv_juv_enc_count: 0,
							new_postjuv_juv_enc_count: 0,
							new_postjuv_enc_count: 0
						}
					)
				]);

				const discrepancies = await findDiscrepancies(client);

				expect(discrepancies).toEqual([]);
			});

			it('is still reported when a live-only cell has at least one metric non-zero', async () => {
				const rpcRows = allZeroRpcRows();
				const client = makeMockSupabaseClient({
					...rpcRows,
					basic: [basicRow({ species_count: 0, bird_count: 1 })],
					sessionsVisitDates: [PERIOD]
				});

				const discrepancies = await findDiscrepancies(client);

				expect(discrepancies).toHaveLength(1);
				expect(discrepancies[0]).toMatchObject({
					species_id: 1,
					time_period: PERIOD,
					cachedRow: null,
					mismatchedFields: []
				});
			});
		});
	});
});
