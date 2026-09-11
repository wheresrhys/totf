/**
 * Integration tests for the `find_discrepencies` Postgres RPC function.
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

describe('find_discrepencies', () => {
	let alphaId: number;
	let betaId: number;
	let alphaClient: SupabaseClient;
	let betaClient: SupabaseClient;

	beforeAll(async () => {
		({ alphaId, betaId, alphaClient, betaClient } =
			await resolveAlphaBetaGammaClients());
	});

	it('alpha group returns 5 discrepancy rows across 3 birds', async () => {
		const { data, error } = await alphaClient.rpc('find_discrepencies', {
			ringing_group_filter: alphaId
		});
		expect(error).toBeNull();
		const rows = data!
			.map((r) => ({
				ring_no: r.ring_no,
				type: r.discrepency_type,
				last_encounter_date: r.last_encounter_date
			}))
			.sort(
				(a, b) =>
					a.ring_no.localeCompare(b.ring_no) || a.type.localeCompare(b.type)
			);
		expect(rows).toEqual([
			{ ring_no: 'ABTITMIS', type: 'age', last_encounter_date: '2022-06-15' },
			{ ring_no: 'ABTITMIS', type: 'sex', last_encounter_date: '2022-06-15' },
			{
				ring_no: 'AKINGF001',
				type: 'age',
				last_encounter_date: '2023-07-08'
			},
			{ ring_no: 'ARRETRAP', type: 'age', last_encounter_date: '2024-05-10' },
			{
				ring_no: 'ARRETRAP',
				type: 'wing_length',
				last_encounter_date: '2024-05-10'
			}
		]);
	});

	it('beta group returns empty (clean data, no discrepancies)', async () => {
		const { data, error } = await betaClient.rpc('find_discrepencies', {
			ringing_group_filter: betaId
		});
		expect(error).toBeNull();
		expect(data).toHaveLength(0);
	});
});
