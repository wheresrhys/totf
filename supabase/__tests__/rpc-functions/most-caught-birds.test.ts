/**
 * Integration tests for the `most_caught_birds` Postgres RPC function.
 *
 * Requires local Supabase running and e2e seed data loaded:
 *   npm run db:start:local
 *   npm run db:seed:e2e
 *
 * Run with: npm run test:integration
 */

import { describe, it, beforeAll, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveAlphaBetaGammaClients } from './helpers/group-clients';
import {
	ALPHA_TOTAL_BIRDS,
	ARRETRAP_ENCOUNTERS,
	ARRETRAP_DATES
} from './helpers/alpha-seed-constants';

describe('most_caught_birds', () => {
	let alphaId: number;
	let alphaClient: SupabaseClient;

	beforeAll(async () => {
		({ alphaId, alphaClient } = await resolveAlphaBetaGammaClients());
	});

	describe('significance_threshold parameter', () => {
		it('default threshold=3 returns only ARRETRAP (only bird with ≥3 encounters)', async () => {
			const { data, error } = await alphaClient.rpc('most_caught_birds', {
				ringing_group_filter: alphaId
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			expect(data![0]).toMatchObject({
				species_name: 'Robin',
				ring_no: 'ARRETRAP',
				encounter_count: ARRETRAP_ENCOUNTERS,
				encounter_dates: ARRETRAP_DATES
			});
		});

		it('threshold=1 returns all 46 birds with at least 1 encounter', async () => {
			const { data, error } = await alphaClient.rpc('most_caught_birds', {
				ringing_group_filter: alphaId,
				significance_threshold: 1
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(ALPHA_TOTAL_BIRDS);
			expect(data![0].ring_no).toBe('ARRETRAP');
		});

		it('threshold=10 returns no birds (max encounters is 9 for ARRETRAP)', async () => {
			const { data, error } = await alphaClient.rpc('most_caught_birds', {
				ringing_group_filter: alphaId,
				significance_threshold: 10
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});
	});

	it('species_filter=Robin returns only ARRETRAP (only Robin with ≥3 encounters)', async () => {
		const { data, error } = await alphaClient.rpc('most_caught_birds', {
			ringing_group_filter: alphaId,
			species_filter: 'Robin'
		});
		expect(error).toBeNull();
		expect(data).toHaveLength(1);
		expect(data![0].ring_no).toBe('ARRETRAP');
	});

	it('year_filter=2022 returns ARRETRAP with exactly 4 encounters in 2022', async () => {
		const { data, error } = await alphaClient.rpc('most_caught_birds', {
			ringing_group_filter: alphaId,
			year_filter: 2022
		});
		expect(error).toBeNull();
		expect(data).toHaveLength(1);
		expect(data![0]).toMatchObject({
			ring_no: 'ARRETRAP',
			encounter_count: 4,
			encounter_dates: ['2022-04-30', '2022-06-15', '2022-08-10', '2022-10-20']
		});
	});

	it('max_per_species=1 returns at most 1 row per species (ARRETRAP is only result)', async () => {
		const { data, error } = await alphaClient.rpc('most_caught_birds', {
			ringing_group_filter: alphaId,
			max_per_species: 1
		});
		expect(error).toBeNull();
		expect(data).toHaveLength(1);
		expect(data![0].ring_no).toBe('ARRETRAP');
	});
});
