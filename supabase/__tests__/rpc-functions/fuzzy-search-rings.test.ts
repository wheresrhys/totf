/**
 * Integration tests for the `fuzzy_search_rings` Postgres RPC function.
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

describe('fuzzy_search_rings', () => {
	let alphaClient: SupabaseClient;

	beforeAll(async () => {
		({ alphaClient } = await resolveAlphaBetaGammaClients());
	});

	it('exact match returns ring with closeness_score 0 and correct species', async () => {
		const { data, error } = await alphaClient.rpc('fuzzy_search_rings', {
			q: 'ARRETRAP'
		});
		expect(error).toBeNull();
		expect(data).toEqual([
			{ ring_no: 'ARRETRAP', closeness_score: 0, species_name: 'Robin' }
		]);
	});

	it('off-by-one match returns ARRETRAP with closeness_score 1', async () => {
		const { data, error } = await alphaClient.rpc('fuzzy_search_rings', {
			q: 'ARRETR'
		});
		expect(error).toBeNull();
		// ARRETR is 2 chars shorter → levenshtein=2, score = 2 - 0.5*(8-6) = 1
		const match = data!.find((r) => r.ring_no === 'ARRETRAP');
		expect(match).toBeDefined();
		expect(match!.closeness_score).toBe(1);
	});

	it('no match returns empty array', async () => {
		const { data, error } = await alphaClient.rpc('fuzzy_search_rings', {
			q: 'ZZZZZZZZZ'
		});
		expect(error).toBeNull();
		expect(data).toHaveLength(0);
	});
});
