import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Database } from '@/types/supabase.types';
import { refreshSimpleStatsCache } from '../stats-cache-refresh';

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

const RPC_RESULT_BY_NAME: Record<string, string> = {
	stats_cache_basic_session_metrics: 'basic',
	stats_cache_biometrics_metrics: 'biometrics',
	stats_cache_bird_age_metrics: 'birdAge',
	stats_cache_encounter_age_metrics: 'encounterAge'
};

/**
 * A minimal fake Supabase client whose `.rpc()` resolves per-RPC-name from
 * `responses`, and records every call for assertions.
 */
function makeMockSupabaseClient({
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
	const responsesByKey: Record<string, unknown[]> = {
		basic,
		biometrics,
		birdAge,
		encounterAge
	};

	const rpc = vi.fn((name: string) => ({
		then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
			const resultKey = RPC_RESULT_BY_NAME[name];
			const data = resultKey !== undefined ? responsesByKey[resultKey] : null;
			return Promise.resolve({ data: data ?? null, error: null }).then(resolve);
		}
	}));

	// The only table this module touches through PostgREST directly rather than
	// through an RPC is "FailedStatsCacheRefreshes" (#1167).
	const insertResult = {
		then: (resolve: (v: { data: null; error: null }) => unknown) =>
			Promise.resolve({ data: null, error: null }).then(resolve)
	};
	// Signatures declared via vi.fn's type parameter rather than as named
	// implementation params, so the recorded calls stay typed for assertions
	// without either fake needing to read its own arguments.
	const insert = vi.fn<
		(rows: Array<Record<string, unknown>>) => typeof insertResult
	>(() => insertResult);
	const from = vi.fn<(table: string) => { insert: typeof insert }>(() => ({
		insert
	}));

	return { rpc, from, insert };
}

function failedRefreshRows(client: ReturnType<typeof makeMockSupabaseClient>) {
	return client.insert.mock.calls[0]?.[0];
}

function metricRpcCallArgs(
	client: ReturnType<typeof makeMockSupabaseClient>,
	rpcName: string
) {
	const call = vi
		.mocked(client.rpc)
		.mock.calls.find(([name]) => name === rpcName);
	return call?.[1];
}

function upsertCallArgs(client: ReturnType<typeof makeMockSupabaseClient>) {
	const call = vi
		.mocked(client.rpc)
		.mock.calls.find(([name]) => name === 'upsert_simple_stats_cache_rows');
	return call?.[1] as
		| {
				p_group_id: number;
				p_temporal_unit: string;
				p_group_by_species: boolean;
				p_rows: unknown[];
		  }
		| undefined;
}

const GROUP_ID = 99;

describe('refreshSimpleStatsCache', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('day/month/year temporal units', () => {
		it('calls all four metric RPCs with a from_date/to_date window spanning the touched periods', async () => {
			const client = makeMockSupabaseClient({
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
			const client = makeMockSupabaseClient({
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

			const written = upsertCallArgs(client)?.p_rows as Array<{
				time_period: string;
			}>;
			expect(written.map((row) => row.time_period).sort()).toEqual(
				touchedPeriods
			);
		});
	});

	describe('month-squashed/all-time temporal units', () => {
		it('calls all four metric RPCs with no date filter, ignoring any periods argument', async () => {
			const client = makeMockSupabaseClient({
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

		it("writes the all-time temporal unit's null time_period through as a real NULL", async () => {
			const client = makeMockSupabaseClient({
				basic: [basicRow({ time_period: null })],
				biometrics: [biometricsRow({ time_period: null })],
				birdAge: [birdAgeRow({ time_period: null })],
				encounterAge: [encounterAgeRow({ time_period: null })]
			});

			await refreshSimpleStatsCache(client as never, {
				groupId: GROUP_ID,
				temporalUnit: 'all-time'
			});

			const written = upsertCallArgs(client)?.p_rows as Array<{
				time_period: string | null;
			}>;
			expect(written).toHaveLength(1);
			expect(written[0].time_period).toBeNull();
		});
	});

	describe('merging', () => {
		it("merges all four RPCs' columns into one row per species/period cell", async () => {
			const client = makeMockSupabaseClient({
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

			const written = upsertCallArgs(client)?.p_rows as Array<
				Record<string, unknown>
			>;
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
			const client = makeMockSupabaseClient({
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

			const written = upsertCallArgs(client)?.p_rows as Array<{
				species_id: number;
			}>;
			// The complete cell (species 1) is still written...
			expect(written).toHaveLength(1);
			expect(written[0].species_id).toBe(1);
			// ...and the anomaly was logged with enough context to act on,
			// rather than silently fabricating a value for species 2.
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					groupId: GROUP_ID,
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
			return makeMockSupabaseClient({
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
			const client = makeMockSupabaseClient({
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

			expect(client.from).not.toHaveBeenCalled();
			expect(client.insert).not.toHaveBeenCalled();
		});
	});

	describe('writing', () => {
		it('passes the temporal unit and group_by_species to upsert_simple_stats_cache_rows as scalar parameters, with only cell columns in p_rows', async () => {
			const client = makeMockSupabaseClient({
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

			const args = upsertCallArgs(client);
			expect(args?.p_group_id).toBe(GROUP_ID);
			expect(args?.p_temporal_unit).toBe('month');
			expect(args?.p_group_by_species).toBe(true);
			const row = args?.p_rows[0] as Record<string, unknown>;
			expect(row).not.toHaveProperty('group_id');
			expect(row).not.toHaveProperty('temporal_unit');
		});

		it('performs exactly one upsert RPC call per temporal unit invocation, not one per metric RPC', async () => {
			const client = makeMockSupabaseClient({
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

			const upsertCalls = vi
				.mocked(client.rpc)
				.mock.calls.filter(
					([name]) => name === 'upsert_simple_stats_cache_rows'
				);
			expect(upsertCalls).toHaveLength(1);
		});
	});
});
