import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BiometricsStatsResult, CoreStatsResult } from '@/app/models/db';
import { makeRpcCallRecorder } from '@/app/__tests__/helpers/rpc-recorder';
import { fetchSpeciesComparisonStats } from '../compare-species';
import alphaCoreBySpecies from '@/test-fixtures/snapshots/core_stats/alpha.by-species.json';
import alphaBiometricsBySpecies from '@/test-fixtures/snapshots/biometrics_stats/alpha.by-species.json';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

const GROUP_ID = 7;

// Real captured output for the exact group-wide, group_by_species calls this
// action makes. demographics_stats has no captured by-species snapshot, so its
// leg resolves a single hand-built row — enough to prove the result is keyed
// under the right property.
// The by-species capture is ungrouped by time, so its `time_period` is
// literally null — CoreStatsResult strips that column non-null (app/models/db.ts),
// so a direct assertion doesn't compile (#895).
// eslint-disable-next-line no-restricted-syntax -- see comment above
const coreStatsRows = alphaCoreBySpecies as unknown as CoreStatsResult[];
const biometricsRows = alphaBiometricsBySpecies as BiometricsStatsResult[];

function makeClient() {
	const recorder = makeRpcCallRecorder((name: string) => {
		if (name === 'core_stats') return coreStatsRows;
		return biometricsRows;
	});
	mockGetAuthenticatedSupabaseClient.mockResolvedValue({ rpc: recorder.rpc });
	return recorder;
}

describe('fetchSpeciesComparisonStats — fetches all three by-species datasets at once', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('calls each of the three RPCs grouped by species for the viewed group', async () => {
		const recorder = makeClient();

		await fetchSpeciesComparisonStats(GROUP_ID);

		expect(recorder.calls.map((call) => call.name)).toEqual([
			'core_stats',
			'biometrics_stats'
		]);
		recorder.calls.forEach((call) => {
			expect(call.args).toEqual({
				ringing_group_filter: GROUP_ID,
				group_by_species: true
			});
		});
	});

	it('returns each RPC result under its own key', async () => {
		makeClient();

		const stats = await fetchSpeciesComparisonStats(GROUP_ID);

		expect(stats).toEqual({
			coreStats: coreStatsRows,
			biometricsStats: biometricsRows
		});
	});
});
