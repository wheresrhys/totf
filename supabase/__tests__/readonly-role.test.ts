/**
 * Integration tests for the app_readonly role (read-only prod debugging mode).
 *
 * The role inherits authenticated's RLS policies via membership, but PostgREST
 * applies transaction_read_only=on when impersonating it, so all writes fail
 * with Postgres error 25006.
 *
 * Requires local Supabase running and e2e seed data loaded:
 *   npm run db:start:local
 *   npm run db:seed:e2e
 *
 * Run with: npm run test:integration
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { getAuthenticatedSupabaseClientForGroup } from '../../lib/group-auth';
import { supabase } from '../../lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

async function getGroupIdByName(name: string): Promise<number> {
	const { data, error } = await supabase
		.from('RingingGroups')
		.select('id')
		.eq('group_name', name)
		.single();
	if (error || !data) throw new Error(`Group "${name}" not found — run npm run db:seed:e2e first`);
	return data.id;
}

const READ_ONLY_TRANSACTION_ERROR_CODE = '25006';

describe('app_readonly role', () => {
	let alphaId: number;
	let authenticatedClient: SupabaseClient;
	let readonlyClient: SupabaseClient;

	beforeAll(async () => {
		alphaId = await getGroupIdByName('Alpha');
		authenticatedClient = await getAuthenticatedSupabaseClientForGroup(alphaId);
		process.env.SUPABASE_JWT_ROLE = 'app_readonly';
		readonlyClient = await getAuthenticatedSupabaseClientForGroup(alphaId);
	});

	afterAll(() => {
		delete process.env.SUPABASE_JWT_ROLE;
	});

	it('allows SELECT with the same RLS scope as authenticated', async () => {
		const [readonlyResult, authenticatedResult] = await Promise.all([
			readonlyClient.from('Sessions').select('id'),
			authenticatedClient.from('Sessions').select('id'),
		]);
		expect(readonlyResult.error).toBeNull();
		expect(authenticatedResult.data!.length).toBeGreaterThan(0);
		expect(readonlyResult.data).toHaveLength(authenticatedResult.data!.length);
	});

	it('allows read-only RPC calls', async () => {
		const { data, error } = await readonlyClient.rpc('aggregate_stats', {
			ringing_group_filter: alphaId,
		});
		expect(error).toBeNull();
		expect(data!.length).toBeGreaterThan(0);
	});

	it('rejects INSERT with a read-only transaction error', async () => {
		const { error } = await readonlyClient
			.from('Species')
			.insert({ species_name: 'Readonly Test Species' });
		expect(error?.code).toBe(READ_ONLY_TRANSACTION_ERROR_CODE);
	});

	it('rejects UPDATE with a read-only transaction error', async () => {
		const { error } = await readonlyClient
			.from('RingingGroups')
			.update({ group_name: 'Readonly Test Rename' })
			.eq('id', alphaId);
		expect(error?.code).toBe(READ_ONLY_TRANSACTION_ERROR_CODE);
	});

	it('rejects DELETE with a read-only transaction error', async () => {
		const { error } = await readonlyClient
			.from('Encounters')
			.delete()
			.eq('ringing_group_id', alphaId);
		expect(error?.code).toBe(READ_ONLY_TRANSACTION_ERROR_CODE);
	});
});
