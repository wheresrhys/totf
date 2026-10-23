import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Database } from '@/types/supabase.types';
import {
	refreshComplexStatsCache,
	refreshSimpleStatsCache
} from '../stats-cache-refresh';

type BasicRow =
	Database['public']['CompositeTypes']['stats_cache_basic_session_metrics_result'];
type BiometricsRow =
	Database['public']['CompositeTypes']['stats_cache_biometrics_metrics_result'];
type BirdAgeRow =
	Database['public']['CompositeTypes']['stats_cache_bird_age_metrics_result'];
type EncounterAgeRow =
	Database['public']['CompositeTypes']['stats_cache_encounter_age_metrics_result'];
type NewAdultRow =
	Database['public']['CompositeTypes']['stats_cache_new_adult_metrics_result'];
type ReturningAgeRow =
	Database['public']['CompositeTypes']['stats_cache_returning_age_metrics_result'];

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

function newAdultRow(overrides: Partial<NewAdultRow> = {}): NewAdultRow {
	return {
		species_id: 1,
		time_period: '2026-03-01',
		new_adult_bird_count: 2,
		...overrides
	};
}

function returningAgeRow(
	overrides: Partial<ReturningAgeRow> = {}
): ReturningAgeRow {
	return {
		species_id: 1,
		time_period: '2026-03-01',
		returning_age_1_bird_count: 1,
		returning_age_2_bird_count: 0,
		returning_age_3_plus_bird_count: 0,
		returning_new_unknown_age_bird_count: 0,
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
 * `responsesByRpcName`, and records every call for assertions. Shared by both
 * refresh functions' suites — they differ only in which RPC names they stub.
 *
 * `.from(table)` serves both PostgREST writes either refresh function makes:
 * the `.upsert()` into the cache's own `*BySpecies` table (#1169) and the
 * `.insert()` of dead-lettered anomalies into `FailedStatsCacheRefreshes`
 * (#1167). `upsertError` lets a test make the cache write fail.
 */
function makeRpcMockClient(
	responsesByRpcName: Record<string, unknown[]>,
	{ upsertError }: { upsertError?: { message: string } } = {}
) {
	const rpc = vi.fn((name: string) => ({
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({
				data: responsesByRpcName[name] ?? null,
				error: null
			}).then(resolve)
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

function failedRefreshRows(client: MockSupabaseClient) {
	return client.insert.mock.calls[0]?.[0];
}

function makeSimpleMockSupabaseClient({
	basic = [],
	biometrics = [],
	birdAge = [],
	encounterAge = []
}: {
	basic?: BasicRow[];
	biometrics?: BiometricsRow[];
	birdAge?: BirdAgeRow[];
	encounterAge?: EncounterAgeRow[];
}) {
	return makeRpcMockClient({
		stats_cache_basic_session_metrics: basic,
		stats_cache_biometrics_metrics: biometrics,
		stats_cache_bird_age_metrics: birdAge,
		stats_cache_encounter_age_metrics: encounterAge
	});
}

function makeComplexMockSupabaseClient({
	newAdult = [],
	returningAge = []
}: {
	newAdult?: NewAdultRow[];
	returningAge?: ReturningAgeRow[];
}) {
	return makeRpcMockClient({
		stats_cache_new_adult_metrics: newAdult,
		stats_cache_returning_age_metrics: returningAge
	});
}

function metricRpcCallArgs(client: MockSupabaseClient, rpcName: string) {
	const call = vi
		.mocked(client.rpc)
		.mock.calls.find(([name]) => name === rpcName);
	return call?.[1];
}

/** The rows the one cache-table `.upsert()` was called with. */
function upsertedRows(client: MockSupabaseClient) {
	return client.upsert.mock.calls[0]?.[0] ?? [];
}

/** The `{ onConflict }` options object that `.upsert()` was called with. */
function upsertOptions(client: MockSupabaseClient) {
	return client.upsert.mock.calls[0]?.[1];
}

const GROUP_ID = 99;

/**
 * The conflict target both `*BySpecies` tables' sole unique constraint
 * provides. Spelled out here rather than imported from the module under test,
 * so a change to either the constraint or the constant has to be made
 * deliberately in two places.
 */
const BY_SPECIES_CONFLICT_TARGET =
	'group_id,temporal_unit,time_period,species_id';

/** The sentinel `time_period` the cache tables use for the all-time grain,
 * in place of the NULL the metric RPCs emit. */
const ALL_TIME_SENTINEL_DATE = '0001-01-01';

describe('refreshSimpleStatsCache', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('day/month/year temporal units', () => {
		it('calls all four metric RPCs with a from_date/to_date window spanning the touched periods', async () => {
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
			expect(metricRpcCallArgs(client, 'stats_cache_bird_age_metrics')).toEqual(
				expectedParams
			);
			expect(
				metricRpcCallArgs(client, 'stats_cache_encounter_age_metrics')
			).toEqual(expectedParams);
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

	describe('month-squashed/all-time temporal units', () => {
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
			// rather than silently fabricating a value for species 2.
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					groupId: GROUP_ID,
					cacheTable: 'SimpleStatsCache',
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

		it('writes a FailedStatsCacheRefreshes row for a cell missing from one metric RPC, with the missing RPC name in details', async () => {
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
					cache_table: 'SimpleStatsCache',
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
			// record — the write must not have replaced the log.
			expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
			expect(client.insert).toHaveBeenCalledTimes(1);
		});

		it('batches multiple anomalies from one refresh pass into one insert call', async () => {
			const client = clientWithAnomalies([2, 3]);

			await refreshSimpleStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'day',
				periods: ['2026-03-01']
			});

			expect(client.insert).toHaveBeenCalledTimes(1);
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

			expect(client.upsert).toHaveBeenCalledTimes(1);
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
});

describe('refreshComplexStatsCache', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	/** Asserts both metric RPCs got the same filter object. */
	function expectBothMetricRpcsCalledWith(
		client: MockSupabaseClient,
		expectedParams: Record<string, unknown>
	) {
		expect(metricRpcCallArgs(client, 'stats_cache_new_adult_metrics')).toEqual(
			expectedParams
		);
		expect(
			metricRpcCallArgs(client, 'stats_cache_returning_age_metrics')
		).toEqual(expectedParams);
	}

	describe('day temporal unit', () => {
		it('calls both metric RPCs with a from_date/to_date window spanning the touched periods', async () => {
			const client = makeComplexMockSupabaseClient({
				newAdult: [newAdultRow({ time_period: '2026-03-10' })],
				returningAge: [returningAgeRow({ time_period: '2026-03-10' })]
			});

			await refreshComplexStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'day',
				periods: ['2026-03-10', '2026-03-01', '2026-03-28']
			});

			expectBothMetricRpcsCalledWith(client, {
				ringing_group_filter: GROUP_ID,
				group_by_species: true,
				group_by_time_period: 'day',
				from_date: '2026-03-01',
				to_date: '2026-03-28'
			});
		});

		it('filters the merged result to just the periods actually touched before upserting', async () => {
			// The min..max window call returns an untouched gap period (03-15)
			// alongside the two actually-touched ones.
			const touchedPeriods = ['2026-03-01', '2026-03-28'];
			const client = makeComplexMockSupabaseClient({
				newAdult: [
					newAdultRow({ time_period: '2026-03-01' }),
					newAdultRow({ time_period: '2026-03-15' }),
					newAdultRow({ time_period: '2026-03-28' })
				],
				returningAge: [
					returningAgeRow({ time_period: '2026-03-01' }),
					returningAgeRow({ time_period: '2026-03-15' }),
					returningAgeRow({ time_period: '2026-03-28' })
				]
			});

			await refreshComplexStatsCache(client as never, {
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

	describe('month/year/month-squashed/all-time temporal units', () => {
		// Unlike SimpleStatsCache's period-local metrics, these lifetime-relative
		// columns can't be narrowed by affected dates above `day` — every one of
		// these four temporal units must full-replace the group's whole history,
		// so a `periods` argument is ignored rather than turned into a window.
		it.each([
			['month', { group_by_time_period: 'month' }],
			['year', { group_by_time_period: 'year' }],
			['month-squashed', { group_by_time_period: 'month-squashed' }],
			// all-time omits `group_by_time_period` entirely rather than setting it.
			['all-time', {}]
		] as const)(
			'calls both metric RPCs with no date filter for %s, regardless of any periods argument',
			async (temporalUnit, expectedPeriodGrouping) => {
				const client = makeComplexMockSupabaseClient({
					newAdult: [newAdultRow()],
					returningAge: [returningAgeRow()]
				});

				await refreshComplexStatsCache(client as never, {
					groupId: GROUP_ID,
					temporalUnit,
					periods: ['2026-03-01']
				});

				expectBothMetricRpcsCalledWith(client, {
					ringing_group_filter: GROUP_ID,
					group_by_species: true,
					...expectedPeriodGrouping
				});
			}
		);

		it("writes the all-time temporal unit's null time_period as the sentinel date", async () => {
			const client = makeComplexMockSupabaseClient({
				newAdult: [newAdultRow({ time_period: null })],
				returningAge: [returningAgeRow({ time_period: null })]
			});

			await refreshComplexStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'all-time'
			});

			expect(upsertedRows(client)).toEqual([
				expect.objectContaining({ time_period: ALL_TIME_SENTINEL_DATE })
			]);
		});
	});

	describe('merging', () => {
		it("merges both RPCs' columns into one row per species/time_period cell", async () => {
			const client = makeComplexMockSupabaseClient({
				newAdult: [newAdultRow({ new_adult_bird_count: 7 })],
				returningAge: [
					returningAgeRow({
						returning_age_1_bird_count: 3,
						returning_age_2_bird_count: 2,
						returning_age_3_plus_bird_count: 1,
						returning_new_unknown_age_bird_count: 4
					})
				]
			});

			await refreshComplexStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'day',
				periods: ['2026-03-01']
			});

			const written = upsertedRows(client);
			expect(written).toHaveLength(1);
			expect(written[0]).toEqual({
				group_id: GROUP_ID,
				temporal_unit: 'day',
				species_id: 1,
				time_period: '2026-03-01',
				new_adult_bird_count: 7,
				returning_age_1_bird_count: 3,
				returning_age_2_bird_count: 2,
				returning_age_3_plus_bird_count: 1,
				returning_new_unknown_age_bird_count: 4
			});
		});

		it("skips and logs a cell missing from one RPC's result, without dropping the complete cells", async () => {
			const consoleErrorSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined);

			// Species 1 is a complete cell across both RPCs; species 2 is missing
			// entirely from the returning-age RPC's result — an anomaly, since both
			// share the same spine.
			const client = makeComplexMockSupabaseClient({
				newAdult: [
					newAdultRow({ species_id: 1 }),
					newAdultRow({ species_id: 2 })
				],
				returningAge: [returningAgeRow({ species_id: 1 })]
			});

			await refreshComplexStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'day',
				periods: ['2026-03-01']
			});

			const written = upsertedRows(client);
			// The complete cell (species 1) is still written...
			expect(written).toHaveLength(1);
			expect(written[0].species_id).toBe(1);
			// ...and the anomaly was logged with enough context to act on, rather
			// than a value being fabricated for species 2.
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					groupId: GROUP_ID,
					cacheTable: 'ComplexStatsCache',
					temporalUnit: 'day',
					speciesId: 2,
					timePeriod: '2026-03-01',
					missingFromRpc: ['stats_cache_returning_age_metrics']
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
		 * Species 1 is a complete cell across both RPCs; each of
		 * `anomalousSpeciesIds` is present in the new-adult RPC but missing from
		 * the returning-age one, making it an anomaly — both share the same
		 * spine, so a cell should never be missing from just one.
		 */
		function clientWithAnomalies(anomalousSpeciesIds: number[]) {
			const allSpeciesIds = [1, ...anomalousSpeciesIds];
			return makeComplexMockSupabaseClient({
				newAdult: allSpeciesIds.map((species_id) =>
					newAdultRow({ species_id })
				),
				returningAge: [returningAgeRow({ species_id: 1 })]
			});
		}

		it("writes a FailedStatsCacheRefreshes row tagged with this cache's own cache_table", async () => {
			const client = clientWithAnomalies([2]);

			await refreshComplexStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'day',
				periods: ['2026-03-01']
			});

			expect(client.from).toHaveBeenCalledWith('FailedStatsCacheRefreshes');
			expect(failedRefreshRows(client)).toEqual([
				{
					group_id: GROUP_ID,
					// The one column separating these rows from
					// refreshSimpleStatsCache's in the same shared table.
					cache_table: 'ComplexStatsCache',
					temporal_unit: 'day',
					species_id: 2,
					time_period: '2026-03-01',
					reason: 'missing_from_metric_rpc',
					details: { missingFromRpc: ['stats_cache_returning_age_metrics'] }
				}
			]);
		});

		it('batches multiple anomalies from one refresh pass into one insert call', async () => {
			const client = clientWithAnomalies([2, 3]);

			await refreshComplexStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'day',
				periods: ['2026-03-01']
			});

			expect(client.insert).toHaveBeenCalledTimes(1);
			expect(failedRefreshRows(client)?.map((row) => row.species_id)).toEqual([
				2, 3
			]);
		});

		it('does not write a row when no anomaly occurs', async () => {
			const client = makeComplexMockSupabaseClient({
				newAdult: [newAdultRow()],
				returningAge: [returningAgeRow()]
			});

			await refreshComplexStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'day',
				periods: ['2026-03-01']
			});

			expect(client.from).not.toHaveBeenCalledWith('FailedStatsCacheRefreshes');
			expect(client.insert).not.toHaveBeenCalled();
		});
	});

	describe('writing to the cache', () => {
		it("upserts into ComplexStatsCacheBySpecies, naming that table's unique constraint as the conflict target", async () => {
			const client = makeComplexMockSupabaseClient({
				newAdult: [newAdultRow()],
				returningAge: [returningAgeRow()]
			});

			await refreshComplexStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'month'
			});

			expect(client.from).toHaveBeenCalledWith('ComplexStatsCacheBySpecies');
			expect(upsertOptions(client)).toEqual({
				onConflict: BY_SPECIES_CONFLICT_TARGET
			});
		});

		it('performs exactly one upsert per temporal unit invocation, not one per metric RPC', async () => {
			const client = makeComplexMockSupabaseClient({
				newAdult: [newAdultRow()],
				returningAge: [returningAgeRow()]
			});

			await refreshComplexStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'month'
			});

			expect(client.upsert).toHaveBeenCalledTimes(1);
		});
	});
});
