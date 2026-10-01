/**
 * Integration tests for Row Level Security across groups.
 *
 * Requires local Supabase running, e2e seed data, and GroupDataSharing configured:
 *   npm run db:start:local
 *   npm run db:seed:e2e
 *
 * Seed sharing: Alpha→Beta, Beta→Gamma (non-transitive).
 * Run with: npm run test:integration
 */

import { describe, it, beforeAll, expect } from 'vitest';
import { getAuthenticatedSupabaseClientForGroup } from '../../app/lib/auth/group-auth';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getGroupIdByName } from './rpc-functions/helpers/seed-lookups';

// Raw Sessions row count for Alpha — one row per visit date, since #1024 made a
// Session unique on (ringing_group_id, visit_date). It was 14 while a Session was
// (visit_date, location_id, session_type): the pre-existing 10 plus the 4 #902
// added (2 FULL_GROWN for Fieldfare/Redwing, 2 FIELD_OBSERVATION for the
// resighting-type Kingfisher/Wren additions). Two of those 14 shared a date with
// another row and collapsed into it, leaving 12 distinct Alpha visit dates.
const ALPHA_SESSION_COUNT = 12;

describe('Row Level Security — cross-group data sharing', () => {
	let alphaId: number;
	let betaId: number;
	let gammaId: number;
	let alphaClient: SupabaseClient;
	let betaClient: SupabaseClient;
	let gammaClient: SupabaseClient;

	beforeAll(async () => {
		[alphaId, betaId, gammaId] = await Promise.all([
			getGroupIdByName('Alpha'),
			getGroupIdByName('Beta'),
			getGroupIdByName('Gamma'),
		]);
		[alphaClient, betaClient, gammaClient] = await Promise.all([
			getAuthenticatedSupabaseClientForGroup(alphaId),
			getAuthenticatedSupabaseClientForGroup(betaId),
			getAuthenticatedSupabaseClientForGroup(gammaId),
		]);
	});

	describe('Sessions table visibility', () => {
		it('Beta can see Alpha sessions (Alpha→Beta sharing)', async () => {
			const { data, error } = await betaClient.from('Sessions').select('id').eq('ringing_group_id', alphaId);
			expect(error).toBeNull();
			expect(data).toHaveLength(ALPHA_SESSION_COUNT);
		});

		it('Gamma can see Beta sessions (Beta→Gamma sharing)', async () => {
			const { data, error } = await gammaClient.from('Sessions').select('id').eq('ringing_group_id', betaId);
			expect(error).toBeNull();
			// Beta has 1 session in seed data
			expect(data).toHaveLength(1);
		});

		it('Gamma cannot see Alpha sessions (sharing is non-transitive)', async () => {
			const { data, error } = await gammaClient.from('Sessions').select('id').eq('ringing_group_id', alphaId);
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});

		it('Alpha cannot see Beta sessions (sharing is one-directional)', async () => {
			const { data, error } = await alphaClient.from('Sessions').select('id').eq('ringing_group_id', betaId);
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});

		it('Gamma sees zero own sessions (Gamma has no data)', async () => {
			const { data, error } = await gammaClient.from('Sessions').select('id').eq('ringing_group_id', gammaId);
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});
	});
});
