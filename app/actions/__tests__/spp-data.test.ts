import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchAuthorisedAggregateStats } from '@/lib/group-summary-access';
import type {
	AggregateStatsResult,
	BiometricsStatsResult
} from '@/app/models/db';
import { fetchSpeciesData } from '../spp-data';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/lib/group-summary-access', () => ({
	fetchAuthorisedAggregateStats: vi.fn()
}));

vi.mock('@/lib/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

const GROUP_ID = 1;
const FROM_DATE = '2026-01-01';
const TO_DATE = '2026-12-31';

function buildAggregateRow(
	overrides: Partial<AggregateStatsResult> = {}
): AggregateStatsResult {
	return {
		species_name: 'Blue Tit',
		time_period: null,
		session_count: 4,
		total_effort: '18:00:00',
		effort_per_session: '02:00:00',
		effort_per_encounter: '02:34:17',
		avg_encounters_per_session: 1.75,
		max_per_session: 3,
		species_count: 1,
		bird_count: 6,
		encounter_count: 7,
		new_bird_count: 4,
		pullus_bird_count: 0,
		juv_bird_count: 0,
		postjuv_bird_count: 5,
		adult_bird_count: 0,
		unknown_age_bird_count: 1,
		pullus_enc_count: 0,
		juv_enc_count: 0,
		postjuv_enc_count: 6,
		adult_enc_count: 1,
		unknown_age_enc_count: 0,
		max_new_per_session: 3,
		max_weight: 13.1,
		avg_weight: 11.2,
		min_weight: 9.8,
		median_weight: 10.8,
		max_wing: 68,
		avg_wing: 66.6,
		min_wing: 65,
		median_wing: 67,
		...overrides
	} as unknown as AggregateStatsResult;
}

function buildBiometricsRow(
	overrides: Partial<BiometricsStatsResult> = {}
): BiometricsStatsResult {
	return {
		species_name: 'Blue Tit',
		time_period: null,
		max_weight: 20,
		avg_weight: 18,
		min_weight: 16,
		median_weight: 17,
		max_wing: 70,
		avg_wing: 69,
		min_wing: 68,
		median_wing: 68.5,
		...overrides
	};
}

// Mirrors the rpc() mock pattern used by app/actions/__tests__/sp-data.test.ts —
// records every rpc() call and resolves it to the given rows.
function makeRpcClient(rpcRows: unknown) {
	const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
	const client = {
		rpc: vi.fn((name: string, args: Record<string, unknown>) => {
			rpcCalls.push({ name, args });
			return {
				then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
					Promise.resolve({ data: rpcRows, error: null }).then(resolve)
			};
		})
	};
	mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
	return rpcCalls;
}

describe('fetchSpeciesData — merges aggregate_stats and biometrics_stats by species_name', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Usual', () => {
		it('merges biometrics_stats fields onto matching aggregate_stats rows by species_name', async () => {
			vi.mocked(fetchAuthorisedAggregateStats).mockResolvedValue({
				accessLevel: 'own',
				rows: [buildAggregateRow()]
			});
			makeRpcClient([buildBiometricsRow({ max_weight: 20, max_wing: 70 })]);

			const [row] = await fetchSpeciesData(GROUP_ID, FROM_DATE, TO_DATE);

			expect(row.max_weight).toBe(20);
			expect(row.max_wing).toBe(70);
		});

		it('passes through non-biometric aggregate_stats fields unchanged', async () => {
			vi.mocked(fetchAuthorisedAggregateStats).mockResolvedValue({
				accessLevel: 'own',
				rows: [
					buildAggregateRow({
						bird_count: 12,
						encounter_count: 15,
						session_count: 3,
						max_per_session: 4
					})
				]
			});
			makeRpcClient([buildBiometricsRow()]);

			const [row] = await fetchSpeciesData(GROUP_ID, FROM_DATE, TO_DATE);

			expect(row.bird_count).toBe(12);
			expect(row.encounter_count).toBe(15);
			expect(row.session_count).toBe(3);
			expect(row.max_per_session).toBe(4);
		});
	});

	describe('Structure', () => {
		it('calls biometrics_stats with the same viewedGroupId/from_date/to_date/group_by_species params as aggregate_stats', async () => {
			vi.mocked(fetchAuthorisedAggregateStats).mockResolvedValue({
				accessLevel: 'own',
				rows: [buildAggregateRow()]
			});
			const rpcCalls = makeRpcClient([]);

			await fetchSpeciesData(GROUP_ID, FROM_DATE, TO_DATE);

			expect(fetchAuthorisedAggregateStats).toHaveBeenCalledWith(GROUP_ID, {
				from_date: FROM_DATE,
				to_date: TO_DATE,
				group_by_species: true
			});
			expect(rpcCalls).toEqual([
				{
					name: 'biometrics_stats',
					args: {
						ringing_group_filter: GROUP_ID,
						from_date: FROM_DATE,
						to_date: TO_DATE,
						group_by_species: true
					}
				}
			]);
		});

		it('does not call biometrics_stats when fetchAuthorisedAggregateStats resolves accessLevel "blocked"', async () => {
			vi.mocked(fetchAuthorisedAggregateStats).mockResolvedValue({
				accessLevel: 'blocked',
				rows: []
			});

			await fetchSpeciesData(GROUP_ID, FROM_DATE, TO_DATE);

			expect(mockGetAuthenticatedSupabaseClient).not.toHaveBeenCalled();
		});

		it('does not call biometrics_stats when fetchAuthorisedAggregateStats resolves accessLevel "public"', async () => {
			vi.mocked(fetchAuthorisedAggregateStats).mockResolvedValue({
				accessLevel: 'public',
				rows: [buildAggregateRow()]
			});

			await fetchSpeciesData(GROUP_ID, FROM_DATE, TO_DATE);

			expect(mockGetAuthenticatedSupabaseClient).not.toHaveBeenCalled();
		});

		it('calls biometrics_stats when accessLevel is "shared"', async () => {
			vi.mocked(fetchAuthorisedAggregateStats).mockResolvedValue({
				accessLevel: 'shared',
				rows: [buildAggregateRow()]
			});
			makeRpcClient([]);

			await fetchSpeciesData(GROUP_ID, FROM_DATE, TO_DATE);

			expect(mockGetAuthenticatedSupabaseClient).toHaveBeenCalled();
		});
	});

	describe('Edge', () => {
		it('leaves the 8 biometric fields undefined for a species present in aggregate_stats but absent from biometrics_stats', async () => {
			vi.mocked(fetchAuthorisedAggregateStats).mockResolvedValue({
				accessLevel: 'own',
				rows: [buildAggregateRow({ species_name: 'Robin' })]
			});
			makeRpcClient([buildBiometricsRow({ species_name: 'Wren' })]);

			const [row] = await fetchSpeciesData(GROUP_ID, FROM_DATE, TO_DATE);

			expect(row.max_weight).toBeUndefined();
			expect(row.avg_weight).toBeUndefined();
			expect(row.min_weight).toBeUndefined();
			expect(row.median_weight).toBeUndefined();
			expect(row.max_wing).toBeUndefined();
			expect(row.avg_wing).toBeUndefined();
			expect(row.min_wing).toBeUndefined();
			expect(row.median_wing).toBeUndefined();
		});

		it('ignores a same-named biometric field still returned by aggregate_stats when biometrics_stats also returns a row for that species', async () => {
			vi.mocked(fetchAuthorisedAggregateStats).mockResolvedValue({
				accessLevel: 'own',
				rows: [buildAggregateRow({ species_name: 'Robin', max_weight: 999 })]
			});
			makeRpcClient([
				buildBiometricsRow({ species_name: 'Robin', max_weight: 20 })
			]);

			const [row] = await fetchSpeciesData(GROUP_ID, FROM_DATE, TO_DATE);

			expect(row.max_weight).toBe(20);
		});

		it('returns an empty array when aggregate_stats returns no rows', async () => {
			vi.mocked(fetchAuthorisedAggregateStats).mockResolvedValue({
				accessLevel: 'own',
				rows: []
			});
			makeRpcClient([]);

			const result = await fetchSpeciesData(GROUP_ID, FROM_DATE, TO_DATE);

			expect(result).toEqual([]);
		});
	});
});
