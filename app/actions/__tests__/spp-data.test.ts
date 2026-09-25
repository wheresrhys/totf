import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchAuthorisedCoreStats } from '@/app/lib/auth/group-summary-access';
import type { BiometricsStatsResult } from '@/app/models/db';
import { fetchSpeciesData } from '../spp-data';
import alphaBiometricsBySpecies from '@/test-fixtures/snapshots/biometrics_stats/alpha.by-species.json';
import gammaBiometricsBySpecies from '@/test-fixtures/snapshots/biometrics_stats/gamma.by-species.json';
import { buildCoreStatsRow } from '@/app/__tests__/helpers/core-stats-fixtures';

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

vi.mock('@/app/lib/auth/group-summary-access', () => ({
	fetchAuthorisedCoreStats: vi.fn()
}));

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

const GROUP_ID = 1;
const FROM_DATE = '2026-01-01';
const TO_DATE = '2026-12-31';

function buildBiometricsRow(
	overrides: Partial<BiometricsStatsResult> = {}
): BiometricsStatsResult {
	return {
		...capturedBiometricsRows[0],
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

describe('fetchSpeciesData — merges core_stats and biometrics_stats by species_name', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Usual', () => {
		it('merges biometrics_stats fields onto matching core_stats rows by species_name', async () => {
			vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({
				accessLevel: 'own',
				rows: [buildCoreStatsRow({ species_name: 'Blue Tit' })]
			});
			makeRpcClient([buildBiometricsRow({ max_weight: 20, max_wing: 70 })]);

			const [row] = await fetchSpeciesData(GROUP_ID, FROM_DATE, TO_DATE);

			expect(row.max_weight).toBe(20);
			expect(row.max_wing).toBe(70);
		});

		it('passes through non-biometric core_stats fields unchanged', async () => {
			vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({
				accessLevel: 'own',
				rows: [
					buildCoreStatsRow({
						species_name: 'Blue Tit',
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
		it('calls biometrics_stats with the same viewedGroupId/from_date/to_date/group_by_species params as core_stats', async () => {
			vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({
				accessLevel: 'own',
				rows: [buildCoreStatsRow({ species_name: 'Blue Tit' })]
			});
			const rpcCalls = makeRpcClient([]);

			await fetchSpeciesData(GROUP_ID, FROM_DATE, TO_DATE);

			expect(fetchAuthorisedCoreStats).toHaveBeenCalledWith(GROUP_ID, {
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

		it('does not call biometrics_stats when fetchAuthorisedCoreStats resolves accessLevel "blocked"', async () => {
			vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({
				accessLevel: 'blocked',
				rows: []
			});

			await fetchSpeciesData(GROUP_ID, FROM_DATE, TO_DATE);

			expect(mockGetAuthenticatedSupabaseClient).not.toHaveBeenCalled();
		});

		it('does not call biometrics_stats when fetchAuthorisedCoreStats resolves accessLevel "public"', async () => {
			vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({
				accessLevel: 'public',
				rows: [buildCoreStatsRow({ species_name: 'Blue Tit' })]
			});

			await fetchSpeciesData(GROUP_ID, FROM_DATE, TO_DATE);

			expect(mockGetAuthenticatedSupabaseClient).not.toHaveBeenCalled();
		});

		it('calls biometrics_stats when accessLevel is "shared"', async () => {
			vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({
				accessLevel: 'shared',
				rows: [buildCoreStatsRow({ species_name: 'Blue Tit' })]
			});
			makeRpcClient([]);

			await fetchSpeciesData(GROUP_ID, FROM_DATE, TO_DATE);

			expect(mockGetAuthenticatedSupabaseClient).toHaveBeenCalled();
		});
	});

	describe('Edge', () => {
		it('leaves the 8 biometric fields undefined for a species present in core_stats but absent from biometrics_stats', async () => {
			vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({
				accessLevel: 'own',
				rows: [buildCoreStatsRow({ species_name: 'Robin' })]
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

		it('leaves the 8 biometric fields undefined when biometrics_stats returns no rows at all for the group', async () => {
			vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({
				accessLevel: 'own',
				rows: [buildCoreStatsRow({ species_name: 'Blue Tit' })]
			});
			makeRpcClient(emptyBiometricsRows);

			const [row] = await fetchSpeciesData(GROUP_ID, FROM_DATE, TO_DATE);

			expect(row.species_name).toBe('Blue Tit');
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
			vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({
				accessLevel: 'own',
				rows: []
			});
			makeRpcClient([]);

			const result = await fetchSpeciesData(GROUP_ID, FROM_DATE, TO_DATE);

			expect(result).toEqual([]);
		});
	});
});
