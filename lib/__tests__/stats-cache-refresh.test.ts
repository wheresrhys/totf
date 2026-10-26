import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Database } from '@/types/supabase.types';
import {
	refreshSimpleStatsCache,
	DEFAULT_STATS_CACHE_WRITE_CHUNK_SIZE
} from '../stats-cache-refresh';

type BasicRow =
	Database['public']['CompositeTypes']['stats_cache_basic_session_metrics_result'];
type BiometricsRow =
	Database['public']['CompositeTypes']['stats_cache_biometrics_metrics_result'];
type BirdAgeRow =
	Database['public']['CompositeTypes']['stats_cache_bird_age_metrics_result'];
type EncounterAgeRow =
	Database['public']['CompositeTypes']['stats_cache_encounter_age_metrics_result'];

// Fixture builders: flat overrides merged over a sensible default, one per
// metric RPC's own composite return type — not full-fat instances.
function basicRow(overrides: Partial<BasicRow> = {}): BasicRow {
	return {
		species_id: 1,
		time_period: '2026-03-01',
		species_count: 1,
		bird_count: 1,
		encounter_count: 1,
		new_bird_count: 0,
		session_count: 1,
		total_effort: '02:00:00',
		effort_per_session: '02:00:00',
		effort_per_encounter: '02:00:00',
		avg_encounters_per_session: 1,
		max_per_session: 1,
		max_new_per_session: 0,
		...overrides
	};
}

function biometricsRow(overrides: Partial<BiometricsRow> = {}): BiometricsRow {
	return {
		species_id: 1,
		time_period: '2026-03-01',
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
		time_period: '2026-03-01',
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
		time_period: '2026-03-01',
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

/** A PostgREST-ish thenable: what `.upsert()`/`.insert()` return. */
function resultThenable<Result>(result: Result) {
	return {
		then: (resolve: (value: Result) => unknown) =>
			Promise.resolve(result).then(resolve)
	};
}

/**
 * A minimal fake Supabase client whose `.rpc()` resolves per-RPC-name from
 * `responsesByRpcName`, and records every call for assertions.
 *
 * A response may be a flat array — the same rows for every call of that RPC
 * name — or a function of the params that call was given, which is what
 * `refreshSimpleStatsCache`'s month/year fan-out (#1176) needs: several calls
 * to the same RPC name, each expecting only its own exact-filtered period's
 * rows back. A flat-array response answers both of a refresh function's
 * passes identically — real `group_by_species: false` RPC calls collapse
 * every species into one null-keyed row, but this fake doesn't simulate that;
 * tests asserting on the non-species pass's own shape use a params-aware
 * function response instead.
 *
 * `.from(table)` serves every PostgREST write either refresh function makes:
 * the `.upsert()` into a cache table (`*BySpecies`, #1169, or the
 * all-species-combined sibling) and the `.insert()` of dead-lettered
 * anomalies into `FailedStatsCacheRefreshes` (#1167). `upsertError` lets a
 * test make the cache write fail.
 */
type RpcParams = Record<string, unknown>;
type MockRpcResponse<Row> = Row[] | ((params: RpcParams) => Row[]);

function makeRpcMockClient(
	responsesByRpcName: Record<string, MockRpcResponse<unknown>>,
	{ upsertError }: { upsertError?: { message: string } } = {}
) {
	const rpc = vi.fn((name: string, params: RpcParams) => ({
		then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
			const response = responsesByRpcName[name];
			return Promise.resolve({
				data:
					typeof response === 'function'
						? response(params)
						: (response ?? null),
				error: null
			}).then(resolve);
		}
	}));

	// Signatures declared via vi.fn's type parameter rather than as named
	// implementation params, so the recorded calls stay typed for assertions
	// without either fake needing to read its own arguments.
	const insert = vi.fn<
		(rows: Array<Record<string, unknown>>) => ReturnType<typeof resultThenable>
	>(() => resultThenable({ data: null, error: null }));
	const upsert = vi.fn<
		(
			rows: Array<Record<string, unknown>>,
			options: { onConflict: string }
		) => ReturnType<typeof resultThenable>
	>(() => resultThenable({ data: null, error: upsertError ?? null }));
	const from = vi.fn<
		(table: string) => { insert: typeof insert; upsert: typeof upsert }
	>(() => ({ insert, upsert }));

	return { rpc, from, insert, upsert };
}

type MockSupabaseClient = ReturnType<typeof makeRpcMockClient>;

/**
 * The rows one `FailedStatsCacheRefreshes` `.insert()` call was given — the
 * species-grouped pass's call (`callIndex: 0`) by default, since that pass
 * always runs first. Pass `callIndex: 1` for the non-species pass's call.
 */
function failedRefreshRows(client: MockSupabaseClient, callIndex = 0) {
	return client.insert.mock.calls[callIndex]?.[0];
}

function makeSimpleMockSupabaseClient({
	basic = [],
	biometrics = [],
	birdAge = [],
	encounterAge = []
}: {
	basic?: MockRpcResponse<BasicRow>;
	biometrics?: MockRpcResponse<BiometricsRow>;
	birdAge?: MockRpcResponse<BirdAgeRow>;
	encounterAge?: MockRpcResponse<EncounterAgeRow>;
}) {
	return makeRpcMockClient({
		stats_cache_basic_session_metrics: basic,
		stats_cache_biometrics_metrics: biometrics,
		stats_cache_bird_age_metrics: birdAge,
		stats_cache_encounter_age_metrics: encounterAge
	});
}

/**
 * Every params object one metric RPC was called with on the species-grouped
 * pass (`group_by_species: true`), in call order — a list because
 * `refreshSimpleStatsCache`'s month/year narrowing fans out to one
 * exact-filtered call per touched period (#1176), rather than the single
 * windowed call every other temporal unit still makes.
 *
 * `refreshSimpleStatsCache` runs two passes per invocation — this
 * one (species-grouped, writing `*BySpecies`) always first, then the
 * non-species-grouped one (writing the all-species-combined table) — so every
 * metric RPC is actually called twice as often as it used to be. Filtering to
 * `group_by_species: true` here keeps every test written before that split
 * asserting exactly what it always did: the species-grouped pass's calls.
 * Pass `groupBySpecies: false` to inspect the second pass's calls instead.
 */
function metricRpcCallArgsList(
	client: MockSupabaseClient,
	rpcName: string,
	{ groupBySpecies = true }: { groupBySpecies?: boolean } = {}
) {
	return vi
		.mocked(client.rpc)
		.mock.calls.filter(
			(call) =>
				call[0] === rpcName &&
				(call[1] as RpcParams).group_by_species === groupBySpecies
		)
		.map((call) => call[1]);
}

/**
 * The params object a metric RPC's first — usually only — call was given, on
 * the species-grouped pass by default. See `metricRpcCallArgsList`.
 */
function metricRpcCallArgs(
	client: MockSupabaseClient,
	rpcName: string,
	options?: { groupBySpecies?: boolean }
) {
	return metricRpcCallArgsList(client, rpcName, options)[0];
}

/**
 * The rows one cache-table `.upsert()` call was given — the species-grouped
 * pass's call (`callIndex: 0`, into the `*BySpecies` table) by default, since
 * that pass always runs first. Pass `callIndex: 1` for the non-species pass's
 * call (into the all-species-combined table).
 */
function upsertedRows(client: MockSupabaseClient, callIndex = 0) {
	return client.upsert.mock.calls[callIndex]?.[0] ?? [];
}

/** The `{ onConflict }` options object a `.upsert()` call was given — see `upsertedRows`. */
function upsertOptions(client: MockSupabaseClient, callIndex = 0) {
	return client.upsert.mock.calls[callIndex]?.[1];
}

const GROUP_ID = 99;

/** The four metric RPCs one `refreshSimpleStatsCache` pass calls. */
const SIMPLE_METRIC_RPC_NAMES = [
	'stats_cache_basic_session_metrics',
	'stats_cache_biometrics_metrics',
	'stats_cache_bird_age_metrics',
	'stats_cache_encounter_age_metrics'
] as const;

/**
 * The conflict target both `*BySpecies` tables' sole unique constraint
 * provides. Spelled out here rather than imported from the module under test,
 * so a change to either the constraint or the constant has to be made
 * deliberately in two places.
 */
const BY_SPECIES_CONFLICT_TARGET =
	'group_id,temporal_unit,time_period,species_id';

/**
 * The conflict target both all-species-combined tables' sole unique
 * constraint provides — one column fewer than `BY_SPECIES_CONFLICT_TARGET`,
 * since neither table has a `species_id` column.
 */
const ALL_SPECIES_CONFLICT_TARGET = 'group_id,temporal_unit,time_period';

/** The sentinel `time_period` the cache tables use for the all-time grain,
 * in place of the NULL the metric RPCs emit. */
const ALL_TIME_SENTINEL_DATE = '0001-01-01';

describe('refreshSimpleStatsCache', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('day/month/year/month-squashed temporal units', () => {
		describe('the date window a narrowing temporal unit is refreshed over', () => {
			it('spans the exact affected days for the day temporal unit', async () => {
				const client = makeSimpleMockSupabaseClient({
					basic: [basicRow({ time_period: '2026-03-10' })],
					biometrics: [biometricsRow({ time_period: '2026-03-10' })],
					birdAge: [birdAgeRow({ time_period: '2026-03-10' })],
					encounterAge: [encounterAgeRow({ time_period: '2026-03-10' })]
				});

				await refreshSimpleStatsCache(client as never, {
					groupId: GROUP_ID,
					temporalUnit: 'day',
					periods: ['2026-03-10', '2026-03-01', '2026-03-28']
				});

				const expectedParams = {
					ringing_group_filter: GROUP_ID,
					group_by_species: true,
					group_by_time_period: 'day',
					from_date: '2026-03-01',
					to_date: '2026-03-28'
				};
				expect(
					metricRpcCallArgs(client, 'stats_cache_basic_session_metrics')
				).toEqual(expectedParams);
				expect(
					metricRpcCallArgs(client, 'stats_cache_biometrics_metrics')
				).toEqual(expectedParams);
				expect(
					metricRpcCallArgs(client, 'stats_cache_bird_age_metrics')
				).toEqual(expectedParams);
				expect(
					metricRpcCallArgs(client, 'stats_cache_encounter_age_metrics')
				).toEqual(expectedParams);
			});

			it("leaves the non-narrowing temporal unit's unwindowed params untouched (all-time)", async () => {
				const client = makeSimpleMockSupabaseClient({});

				await refreshSimpleStatsCache(client as never, {
					groupId: GROUP_ID,
					temporalUnit: 'all-time',
					periods: ['2026-03-01']
				});

				const params = metricRpcCallArgs(
					client,
					'stats_cache_basic_session_metrics'
				) as Record<string, unknown>;
				expect(params).not.toHaveProperty('from_date');
				expect(params).not.toHaveProperty('to_date');
			});
		});

		describe('the exact-filter fan-out for month/year/month-squashed narrowing', () => {
			/**
			 * The inverse of the module's own `exactPeriodFilters`: the
			 * `YYYY-MM-01`/`YYYY-01-01`/`2000-MM-01` period string the
			 * `year_filter`/`month_filter` pair of one fanned-out call selects. A
			 * `month_filter` with no `year_filter` is the month-squashed case, whose
			 * cells carry the `2000` sentinel year.
			 */
			function periodSelectedBy(params: RpcParams): string {
				const month =
					params.month_filter === undefined
						? undefined
						: String(params.month_filter).padStart(2, '0');
				if (params.year_filter === undefined) {
					return `2000-${month}-01`;
				}
				const year = String(params.year_filter);
				return month === undefined ? `${year}-01-01` : `${year}-${month}-01`;
			}

			/**
			 * Answers each exact-filtered call with a single row for exactly the
			 * period that call asked for — what the real RPC does, and the thing
			 * a windowed call could not do.
			 */
			function rowForCalledPeriod<Row>(
				makeRow: (overrides: { time_period: string }) => Row
			) {
				return (params: RpcParams) => [
					makeRow({ time_period: periodSelectedBy(params) })
				];
			}

			function expectedParamsFor(
				temporalUnit: 'month' | 'year' | 'month-squashed',
				exactFilters: { year_filter?: number; month_filter?: number }
			) {
				return {
					ringing_group_filter: GROUP_ID,
					group_by_species: true,
					group_by_time_period: temporalUnit,
					...exactFilters
				};
			}

			it('calls each metric RPC once per distinct period, with year_filter set and no from_date/to_date, for the year temporal unit', async () => {
				const client = makeSimpleMockSupabaseClient({});

				await refreshSimpleStatsCache(client as never, {
					groupId: GROUP_ID,
					temporalUnit: 'year',
					periods: ['2025-01-01', '2026-01-01']
				});

				// An exhaustive `toEqual` per call, so the absence of from_date/
				// to_date (and of a month_filter, which a year period has no use
				// for) is asserted rather than merely not contradicted.
				for (const rpcName of SIMPLE_METRIC_RPC_NAMES) {
					expect(metricRpcCallArgsList(client, rpcName)).toEqual([
						expectedParamsFor('year', { year_filter: 2025 }),
						expectedParamsFor('year', { year_filter: 2026 })
					]);
				}
			});

			it('calls each metric RPC once per distinct period, with year_filter and month_filter set and no from_date/to_date, for the month temporal unit', async () => {
				const client = makeSimpleMockSupabaseClient({});

				await refreshSimpleStatsCache(client as never, {
					groupId: GROUP_ID,
					temporalUnit: 'month',
					periods: ['2026-02-01', '2026-03-01']
				});

				for (const rpcName of SIMPLE_METRIC_RPC_NAMES) {
					expect(metricRpcCallArgsList(client, rpcName)).toEqual([
						expectedParamsFor('month', { year_filter: 2026, month_filter: 2 }),
						expectedParamsFor('month', { year_filter: 2026, month_filter: 3 })
					]);
				}
			});

			it('fans out to exactly 2 calls per metric when periods holds 2 non-contiguous months, e.g. January and March', async () => {
				const client = makeSimpleMockSupabaseClient({});

				await refreshSimpleStatsCache(client as never, {
					groupId: GROUP_ID,
					temporalUnit: 'month',
					periods: ['2026-01-01', '2026-03-01']
				});

				// The case the old window + filterToTouchedPeriods pairing existed
				// to handle: the gap month is now never asked for in the first
				// place, rather than fetched and then discarded.
				for (const rpcName of SIMPLE_METRIC_RPC_NAMES) {
					expect(
						metricRpcCallArgsList(client, rpcName).map((params) =>
							periodSelectedBy(params as RpcParams)
						)
					).toEqual(['2026-01-01', '2026-03-01']);
				}
			});

			it("does not require a post-hoc filter — merges results from every period's fan-out with no gap rows to drop", async () => {
				const client = makeSimpleMockSupabaseClient({
					basic: rowForCalledPeriod(basicRow),
					biometrics: rowForCalledPeriod(biometricsRow),
					birdAge: rowForCalledPeriod(birdAgeRow),
					encounterAge: rowForCalledPeriod(encounterAgeRow)
				});

				await refreshSimpleStatsCache(client as never, {
					groupId: GROUP_ID,
					temporalUnit: 'month',
					periods: ['2026-01-01', '2026-03-01', '2026-11-01']
				});

				// Every fanned-out period's row survives to the write — the filter
				// that used to drop untouched gap periods has nothing to drop.
				expect(
					upsertedRows(client)
						.map((row) => row.time_period)
						.sort()
				).toEqual(['2026-01-01', '2026-03-01', '2026-11-01']);
			});

			it('fans out to one exact-filtered call per distinct touched calendar month, for the month-squashed temporal unit', async () => {
				const client = makeSimpleMockSupabaseClient({});

				await refreshSimpleStatsCache(client as never, {
					groupId: GROUP_ID,
					temporalUnit: 'month-squashed',
					periods: ['2000-03-01', '2000-07-01']
				});

				for (const rpcName of SIMPLE_METRIC_RPC_NAMES) {
					expect(metricRpcCallArgsList(client, rpcName)).toEqual([
						expectedParamsFor('month-squashed', { month_filter: 3 }),
						expectedParamsFor('month-squashed', { month_filter: 7 })
					]);
				}
			});

			it('sets month_filter but not year_filter for a month-squashed call', async () => {
				const client = makeSimpleMockSupabaseClient({});

				await refreshSimpleStatsCache(client as never, {
					groupId: GROUP_ID,
					temporalUnit: 'month-squashed',
					periods: ['2000-05-01']
				});

				// The defining difference from the `month` case: "every year's copy
				// of May" is month_filter alone, so a year_filter — including one
				// parsed out of the period string's `2000` sentinel — would wrongly
				// narrow the cell to a single year.
				expect(
					metricRpcCallArgs(client, 'stats_cache_basic_session_metrics')
				).toEqual({
					ringing_group_filter: GROUP_ID,
					group_by_species: true,
					group_by_time_period: 'month-squashed',
					month_filter: 5
				});
			});

			it('de-duplicates repeated calendar months across periods, same as month/year', async () => {
				const client = makeSimpleMockSupabaseClient({});

				await refreshSimpleStatsCache(client as never, {
					groupId: GROUP_ID,
					temporalUnit: 'month-squashed',
					periods: ['2000-03-01', '2000-07-01', '2000-03-01']
				});

				for (const rpcName of SIMPLE_METRIC_RPC_NAMES) {
					expect(
						metricRpcCallArgsList(client, rpcName).map((params) =>
							periodSelectedBy(params as RpcParams)
						)
					).toEqual(['2000-03-01', '2000-07-01']);
				}
			});

			it('still performs exactly one upsert per invocation, regardless of how many periods were fanned out over', async () => {
				const client = makeSimpleMockSupabaseClient({
					basic: rowForCalledPeriod(basicRow),
					biometrics: rowForCalledPeriod(biometricsRow),
					birdAge: rowForCalledPeriod(birdAgeRow),
					encounterAge: rowForCalledPeriod(encounterAgeRow)
				});

				await refreshSimpleStatsCache(client as never, {
					groupId: GROUP_ID,
					temporalUnit: 'month',
					periods: ['2026-01-01', '2026-03-01', '2026-11-01']
				});

				// 4 metric RPCs x 3 periods fetched x 2 passes (species-grouped +
				// non-species-grouped), still exactly one write per pass.
				expect(client.rpc).toHaveBeenCalledTimes(24);
				expect(client.upsert).toHaveBeenCalledTimes(2);
			});
		});

		it('filters the merged result to just the periods actually touched, dropping extra periods the window call returned', async () => {
			// The window call returns an untouched gap period (03-15) alongside
			// the two actually-touched ones.
			const touchedPeriods = ['2026-03-01', '2026-03-28'];
			const client = makeSimpleMockSupabaseClient({
				basic: [
					basicRow({ time_period: '2026-03-01' }),
					basicRow({ time_period: '2026-03-15' }),
					basicRow({ time_period: '2026-03-28' })
				],
				biometrics: [
					biometricsRow({ time_period: '2026-03-01' }),
					biometricsRow({ time_period: '2026-03-15' }),
					biometricsRow({ time_period: '2026-03-28' })
				],
				birdAge: [
					birdAgeRow({ time_period: '2026-03-01' }),
					birdAgeRow({ time_period: '2026-03-15' }),
					birdAgeRow({ time_period: '2026-03-28' })
				],
				encounterAge: [
					encounterAgeRow({ time_period: '2026-03-01' }),
					encounterAgeRow({ time_period: '2026-03-15' }),
					encounterAgeRow({ time_period: '2026-03-28' })
				]
			});

			await refreshSimpleStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'day',
				periods: touchedPeriods
			});

			expect(
				upsertedRows(client)
					.map((row) => row.time_period)
					.sort()
			).toEqual(touchedPeriods);
		});
	});

	// `month-squashed` used to belong here too; it narrows by month_filter as of
	// #1178, so it is covered by the exact-filter fan-out block above instead.
	describe('the all-time temporal unit', () => {
		it('calls all four metric RPCs with no date filter, ignoring any periods argument', async () => {
			const client = makeSimpleMockSupabaseClient({
				basic: [basicRow({ time_period: null })],
				biometrics: [biometricsRow({ time_period: null })],
				birdAge: [birdAgeRow({ time_period: null })],
				encounterAge: [encounterAgeRow({ time_period: null })]
			});

			await refreshSimpleStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'all-time',
				periods: ['2026-03-01']
			});

			const expectedParams = {
				ringing_group_filter: GROUP_ID,
				group_by_species: true
			};
			expect(
				metricRpcCallArgs(client, 'stats_cache_basic_session_metrics')
			).toEqual(expectedParams);
			expect(
				metricRpcCallArgs(client, 'stats_cache_biometrics_metrics')
			).toEqual(expectedParams);
			expect(metricRpcCallArgs(client, 'stats_cache_bird_age_metrics')).toEqual(
				expectedParams
			);
			expect(
				metricRpcCallArgs(client, 'stats_cache_encounter_age_metrics')
			).toEqual(expectedParams);
		});

		it("writes the all-time temporal unit's null time_period as the sentinel date", async () => {
			const client = makeSimpleMockSupabaseClient({
				basic: [basicRow({ time_period: null })],
				biometrics: [biometricsRow({ time_period: null })],
				birdAge: [birdAgeRow({ time_period: null })],
				encounterAge: [encounterAgeRow({ time_period: null })]
			});

			await refreshSimpleStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'all-time'
			});

			// The whole point of #1169's split: the cache column is NOT NULL, so
			// the metric RPCs' real NULL becomes the sentinel at the write.
			expect(upsertedRows(client)).toEqual([
				expect.objectContaining({ time_period: ALL_TIME_SENTINEL_DATE })
			]);
		});
	});

	describe('merging', () => {
		it("merges all four RPCs' columns into one row per species/period cell", async () => {
			const client = makeSimpleMockSupabaseClient({
				basic: [basicRow({ species_count: 3, bird_count: 5 })],
				biometrics: [biometricsRow({ max_weight: 25.5 })],
				birdAge: [birdAgeRow({ adult_bird_count: 4 })],
				encounterAge: [encounterAgeRow({ adult_enc_count: 6 })]
			});

			await refreshSimpleStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'day',
				periods: ['2026-03-01']
			});

			const written = upsertedRows(client);
			expect(written).toHaveLength(1);
			expect(written[0]).toMatchObject({
				species_id: 1,
				time_period: '2026-03-01',
				species_count: 3,
				bird_count: 5,
				max_weight: 25.5,
				adult_bird_count: 4,
				adult_enc_count: 6
			});
		});

		it("handles a cell missing from one RPC's result without dropping the row", async () => {
			const consoleErrorSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined);

			// Species 1 is a complete cell across all four RPCs; species 2 is
			// missing entirely from the biometrics RPC's result — an anomaly,
			// since all four share the same spine.
			const client = makeSimpleMockSupabaseClient({
				basic: [basicRow({ species_id: 1 }), basicRow({ species_id: 2 })],
				biometrics: [biometricsRow({ species_id: 1 })],
				birdAge: [birdAgeRow({ species_id: 1 }), birdAgeRow({ species_id: 2 })],
				encounterAge: [
					encounterAgeRow({ species_id: 1 }),
					encounterAgeRow({ species_id: 2 })
				]
			});

			await refreshSimpleStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'day',
				periods: ['2026-03-01']
			});

			const written = upsertedRows(client);
			// The complete cell (species 1) is still written...
			expect(written).toHaveLength(1);
			expect(written[0].species_id).toBe(1);
			// ...and the anomaly was logged with enough context to act on,
			// rather than silently fabricating a value for species 2. The
			// species-grouped pass (logged first) tags the anomaly with its own
			// 'SimpleStatsCacheBySpecies' cache_table (#1182).
			expect(consoleErrorSpy).toHaveBeenNthCalledWith(
				1,
				expect.any(String),
				expect.objectContaining({
					groupId: GROUP_ID,
					cacheTable: 'SimpleStatsCacheBySpecies',
					temporalUnit: 'day',
					speciesId: 2,
					timePeriod: '2026-03-01',
					missingFromRpc: ['stats_cache_biometrics_metrics']
				})
			);
		});
	});

	describe('anomaly recording', () => {
		let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			consoleErrorSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined);
		});

		afterEach(() => {
			consoleErrorSpy.mockRestore();
		});

		/**
		 * Species 1 is a complete cell across all four RPCs; each of
		 * `anomalousSpeciesIds` is present everywhere except the biometrics RPC,
		 * making it an anomaly — all four share the same spine, so a cell should
		 * never be missing from just one.
		 */
		function clientWithAnomalies(anomalousSpeciesIds: number[]) {
			const allSpeciesIds = [1, ...anomalousSpeciesIds];
			return makeSimpleMockSupabaseClient({
				basic: allSpeciesIds.map((species_id) => basicRow({ species_id })),
				biometrics: [biometricsRow({ species_id: 1 })],
				birdAge: allSpeciesIds.map((species_id) => birdAgeRow({ species_id })),
				encounterAge: allSpeciesIds.map((species_id) =>
					encounterAgeRow({ species_id })
				)
			});
		}

		it("writes a FailedStatsCacheRefreshes row for a cell missing from one metric RPC, tagged with this (species-grouped) pass's own 'SimpleStatsCacheBySpecies' cache_table, with the missing RPC name in details", async () => {
			const client = clientWithAnomalies([2]);

			await refreshSimpleStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'day',
				periods: ['2026-03-01']
			});

			expect(client.from).toHaveBeenCalledWith('FailedStatsCacheRefreshes');
			expect(failedRefreshRows(client)).toEqual([
				{
					group_id: GROUP_ID,
					cache_table: 'SimpleStatsCacheBySpecies',
					temporal_unit: 'day',
					species_id: 2,
					time_period: '2026-03-01',
					reason: 'missing_from_metric_rpc',
					details: { missingFromRpc: ['stats_cache_biometrics_metrics'] }
				}
			]);
		});

		it('still logs via console.error alongside the write', async () => {
			const client = clientWithAnomalies([2]);

			await refreshSimpleStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'day',
				periods: ['2026-03-01']
			});

			// The log line is for immediate visibility, the row is the durable
			// record — the write must not have replaced the log. Both counts are 2
			// (not 1): the same anomaly recurs on both the species-grouped and
			// non-species-grouped passes, against this flat-array mock.
			expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
			expect(client.insert).toHaveBeenCalledTimes(2);
		});

		it('batches multiple anomalies from one refresh pass into one insert call', async () => {
			const client = clientWithAnomalies([2, 3]);

			await refreshSimpleStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'day',
				periods: ['2026-03-01']
			});

			// One insert call per pass (2 total), each batching both anomalies —
			// never one insert call per anomaly.
			expect(client.insert).toHaveBeenCalledTimes(2);
			expect(failedRefreshRows(client)?.map((row) => row.species_id)).toEqual([
				2, 3
			]);
		});

		it('does not write a row when no anomaly occurs', async () => {
			const client = makeSimpleMockSupabaseClient({
				basic: [basicRow()],
				biometrics: [biometricsRow()],
				birdAge: [birdAgeRow()],
				encounterAge: [encounterAgeRow()]
			});

			await refreshSimpleStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'day',
				periods: ['2026-03-01']
			});

			expect(client.from).not.toHaveBeenCalledWith('FailedStatsCacheRefreshes');
			expect(client.insert).not.toHaveBeenCalled();
		});
	});

	describe('writing to the cache', () => {
		function completeCellClient() {
			return makeSimpleMockSupabaseClient({
				basic: [basicRow()],
				biometrics: [biometricsRow()],
				birdAge: [birdAgeRow()],
				encounterAge: [encounterAgeRow()]
			});
		}

		it("upserts into SimpleStatsCacheBySpecies, naming that table's unique constraint as the conflict target", async () => {
			const client = completeCellClient();

			await refreshSimpleStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'month',
				periods: ['2026-03-01']
			});

			expect(client.from).toHaveBeenCalledWith('SimpleStatsCacheBySpecies');
			expect(upsertOptions(client)).toEqual({
				onConflict: BY_SPECIES_CONFLICT_TARGET
			});
		});

		it("stamps each row with the pass's own group_id and temporal_unit, which the merged cells omit", async () => {
			const client = completeCellClient();

			await refreshSimpleStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'month',
				periods: ['2026-03-01']
			});

			expect(upsertedRows(client)).toEqual([
				expect.objectContaining({
					group_id: GROUP_ID,
					temporal_unit: 'month',
					species_id: 1,
					// A dated grain's own period is written through untouched — only
					// the all-time grain's NULL becomes the sentinel.
					time_period: '2026-03-01'
				})
			]);
		});

		it('performs exactly one upsert per temporal unit invocation, not one per metric RPC', async () => {
			const client = completeCellClient();

			await refreshSimpleStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'month',
				periods: ['2026-03-01']
			});

			// One upsert per pass (species-grouped + non-species-grouped), never
			// one per metric RPC.
			expect(client.upsert).toHaveBeenCalledTimes(2);
		});

		it('propagates a write failure rather than swallowing it', async () => {
			const client = makeRpcMockClient(
				{
					stats_cache_basic_session_metrics: [basicRow()],
					stats_cache_biometrics_metrics: [biometricsRow()],
					stats_cache_bird_age_metrics: [birdAgeRow()],
					stats_cache_encounter_age_metrics: [encounterAgeRow()]
				},
				{ upsertError: { message: 'duplicate key value' } }
			);

			await expect(
				refreshSimpleStatsCache(client as never, {
					groupId: GROUP_ID,
					temporalUnit: 'month',
					periods: ['2026-03-01']
				})
				// The message catchSupabaseErrors wraps a PostgREST error in.
			).rejects.toThrow('Failed to fetch data: duplicate key value');
		});
	});

	describe('chunking large writes', () => {
		/** A deterministic `YYYY-MM-DD` date, `dayOffset` days after 2026-01-01. */
		function dateAtOffset(dayOffset: number): string {
			return new Date(Date.UTC(2026, 0, 1 + dayOffset))
				.toISOString()
				.slice(0, 10);
		}

		it("splits the by-species write into chunk-size-capped upserts, and writes every touched day's row exactly once, when the day grain's touched-period count exceeds the chunk size", async () => {
			// day has no exact-filter fan-out ceiling the way month/year do (see
			// `buildSimpleMetricRpcParamsList`), so it's the temporal unit whose
			// row count is actually likely to exceed the chunk size.
			const dates = Array.from(
				{ length: DEFAULT_STATS_CACHE_WRITE_CHUNK_SIZE + 1 },
				(_, i) => dateAtOffset(i)
			);
			const client = makeSimpleMockSupabaseClient({
				basic: dates.map((time_period) => basicRow({ time_period })),
				biometrics: dates.map((time_period) => biometricsRow({ time_period })),
				birdAge: dates.map((time_period) => birdAgeRow({ time_period })),
				encounterAge: dates.map((time_period) =>
					encounterAgeRow({ time_period })
				)
			});

			await refreshSimpleStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'day',
				periods: dates
			});

			const bySpeciesUpsertCalls = client.upsert.mock.calls.filter(
				([, options]) => options.onConflict === BY_SPECIES_CONFLICT_TARGET
			);
			expect(bySpeciesUpsertCalls.map(([rows]) => rows.length)).toEqual([
				DEFAULT_STATS_CACHE_WRITE_CHUNK_SIZE,
				1
			]);

			const writtenPeriods = bySpeciesUpsertCalls
				.flatMap(([rows]) => rows.map((row) => row.time_period))
				.sort();
			expect(writtenPeriods).toEqual([...dates].sort());
		});
	});

	describe('the non-species-grouped pass', () => {
		it('calls each metric RPC a second time with group_by_species: false', async () => {
			const client = makeSimpleMockSupabaseClient({
				basic: [basicRow()],
				biometrics: [biometricsRow()],
				birdAge: [birdAgeRow()],
				encounterAge: [encounterAgeRow()]
			});

			await refreshSimpleStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'month',
				periods: ['2026-03-01']
			});

			const expectedParams = {
				ringing_group_filter: GROUP_ID,
				group_by_species: false,
				group_by_time_period: 'month',
				year_filter: 2026,
				month_filter: 3
			};
			for (const rpcName of SIMPLE_METRIC_RPC_NAMES) {
				expect(
					metricRpcCallArgs(client, rpcName, { groupBySpecies: false })
				).toEqual(expectedParams);
			}
		});

		it("upserts into SimpleStatsCache, naming that table's unique constraint as the conflict target, with no species_id key on the rows", async () => {
			const client = makeSimpleMockSupabaseClient({
				basic: [basicRow()],
				biometrics: [biometricsRow()],
				birdAge: [birdAgeRow()],
				encounterAge: [encounterAgeRow()]
			});

			await refreshSimpleStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'month',
				periods: ['2026-03-01']
			});

			expect(client.from).toHaveBeenCalledWith('SimpleStatsCache');
			expect(upsertOptions(client, 1)).toEqual({
				onConflict: ALL_SPECIES_CONFLICT_TARGET
			});
			for (const row of upsertedRows(client, 1)) {
				expect(row).not.toHaveProperty('species_id');
			}
		});

		it("dead-letters an anomaly from this pass under its own plain 'SimpleStatsCache' tag, distinct from the species-grouped pass's 'SimpleStatsCacheBySpecies' tag", async () => {
			const client = makeSimpleMockSupabaseClient({
				basic: [basicRow({ species_id: 1 }), basicRow({ species_id: 2 })],
				biometrics: [biometricsRow({ species_id: 1 })],
				birdAge: [birdAgeRow({ species_id: 1 }), birdAgeRow({ species_id: 2 })],
				encounterAge: [
					encounterAgeRow({ species_id: 1 }),
					encounterAgeRow({ species_id: 2 })
				]
			});

			await refreshSimpleStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'day',
				periods: ['2026-03-01']
			});

			expect(failedRefreshRows(client, 0)).toEqual([
				expect.objectContaining({ cache_table: 'SimpleStatsCacheBySpecies' })
			]);
			expect(failedRefreshRows(client, 1)).toEqual([
				expect.objectContaining({ cache_table: 'SimpleStatsCache' })
			]);
		});
	});

	describe('narrowing the species-grouped write by speciesIds', () => {
		function twoSpeciesClient(timePeriod: string | null = '2026-03-01') {
			return makeSimpleMockSupabaseClient({
				basic: [
					basicRow({ species_id: 1, time_period: timePeriod }),
					basicRow({ species_id: 2, time_period: timePeriod })
				],
				biometrics: [
					biometricsRow({ species_id: 1, time_period: timePeriod }),
					biometricsRow({ species_id: 2, time_period: timePeriod })
				],
				birdAge: [
					birdAgeRow({ species_id: 1, time_period: timePeriod }),
					birdAgeRow({ species_id: 2, time_period: timePeriod })
				],
				encounterAge: [
					encounterAgeRow({ species_id: 1, time_period: timePeriod }),
					encounterAgeRow({ species_id: 2, time_period: timePeriod })
				]
			});
		}

		it('writes only the species-grouped rows named in speciesIds, leaving the rest uncached this pass', async () => {
			const client = twoSpeciesClient();

			await refreshSimpleStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'day',
				periods: ['2026-03-01'],
				speciesIds: [1]
			});

			expect(upsertedRows(client).map((row) => row.species_id)).toEqual([1]);
		});

		it('writes every computed species-grouped row when speciesIds is omitted', async () => {
			const client = twoSpeciesClient();

			await refreshSimpleStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'day',
				periods: ['2026-03-01']
			});

			expect(
				upsertedRows(client)
					.map((row) => row.species_id)
					.sort()
			).toEqual([1, 2]);
		});

		it('never filters the non-species-grouped (all-species-combined) write, regardless of speciesIds', async () => {
			const client = twoSpeciesClient();

			await refreshSimpleStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'day',
				periods: ['2026-03-01'],
				speciesIds: [1]
			});

			expect(upsertedRows(client, 1)).toHaveLength(2);
		});

		it('narrows the species-grouped write even for the all-time temporal unit, which never narrows by date', async () => {
			const client = twoSpeciesClient(null);

			await refreshSimpleStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'all-time',
				speciesIds: [2]
			});

			expect(upsertedRows(client).map((row) => row.species_id)).toEqual([2]);
		});
	});
});
