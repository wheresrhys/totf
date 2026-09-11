/**
 * Integration tests for the `long_absence_retraps` Postgres RPC function.
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

describe('long_absence_retraps', () => {
	let alphaId: number;
	let alphaClient: SupabaseClient;

	beforeAll(async () => {
		({ alphaId, alphaClient } = await resolveAlphaBetaGammaClients());
	});

	// Seed: AWREN001 (Wren) was ringed on 2021-06-20 and only recaught on
	// 2024-05-10 — a 1055-day gap, the sole ≥730-day retrap in the seed.
	it('returns the long-absence bird with correct previous_date and gap_days', async () => {
		const { data, error } = await alphaClient.rpc('long_absence_retraps', {
			session_date: '2024-05-10',
			ringing_group_filter: alphaId
		});
		expect(error).toBeNull();
		expect(data).toEqual([
			{
				ring_no: 'AWREN001',
				species_name: 'Wren',
				previous_date: '2021-06-20',
				gap_days: 1055
			}
		]);
	});

	it('excludes retraps with gaps under min_gap_days', async () => {
		// On 2024-05-10, ARRETRAP was last seen 2023-09-14 (239 days) — under the
		// 730-day default, so only the Wren (1055 days) qualifies.
		const { data, error } = await alphaClient.rpc('long_absence_retraps', {
			session_date: '2024-05-10',
			ringing_group_filter: alphaId
		});
		expect(error).toBeNull();
		expect(data!.map((r) => r.ring_no)).toEqual(['AWREN001']);
	});

	it('excludes birds ringed for the first time this session', async () => {
		// 2021-06-20 is the group's first session: every bird is newly ringed,
		// so none has a prior visit to compare against.
		const { data, error } = await alphaClient.rpc('long_absence_retraps', {
			session_date: '2021-06-20',
			ringing_group_filter: alphaId,
			min_gap_days: 1
		});
		expect(error).toBeNull();
		expect(data).toHaveLength(0);
	});

	it('honours a custom min_gap_days', async () => {
		// Lowering the threshold to 200 days lets ARRETRAP (239 days) through
		// alongside the Wren, ordered by gap_days DESC.
		const { data, error } = await alphaClient.rpc('long_absence_retraps', {
			session_date: '2024-05-10',
			ringing_group_filter: alphaId,
			min_gap_days: 200
		});
		expect(error).toBeNull();
		expect(
			data!.map((r) => ({ ring_no: r.ring_no, gap_days: r.gap_days }))
		).toEqual([
			{ ring_no: 'AWREN001', gap_days: 1055 },
			{ ring_no: 'ARRETRAP', gap_days: 239 }
		]);
	});

	it('returns empty for a date with no session', async () => {
		const { data, error } = await alphaClient.rpc('long_absence_retraps', {
			session_date: '2099-01-01',
			ringing_group_filter: alphaId
		});
		expect(error).toBeNull();
		expect(data).toHaveLength(0);
	});
});
