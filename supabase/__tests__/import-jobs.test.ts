/**
 * Integration tests for ImportJobs RLS.
 *
 * ImportJobs is group-scoped on the plain `ringing_group_id = jwt` pattern, with no
 * GroupDataSharing clause: a sharing grant exposes a group's bird data, not the
 * operational record of how that data got loaded. See
 * supabase/schema/schemas/public/tables/"ImportJobs".sql.
 *
 * Both groups are created fresh per run (db-test-helpers' `createIsolatedGroup` with
 * a random suffix) rather than reusing the e2e seed groups, so a concurrent worktree
 * can never see or count these rows — and so the cross-group check is against a
 * group that definitively has no sharing grant either way.
 *
 * Requires local Supabase running:
 *   npm run db:start:local
 *
 * Run with: npm run test:integration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { getAuthenticatedSupabaseClientForGroup } from '../../app/lib/auth/group-auth';
import { ImportJobTracker } from '../../lib/demon-import';
import { createIsolatedGroup, psql } from './db-test-helpers';
import { randomTestSuffix } from './test-isolation';

describe('ImportJobs RLS', () => {
	let importingGroupId: number;
	let otherGroupId: number;
	let importingGroupClient: SupabaseClient;
	let otherGroupClient: SupabaseClient;
	let importJobId: number;

	beforeAll(async () => {
		const suffix = randomTestSuffix();
		importingGroupId = createIsolatedGroup(`IJ-TEST-OWNER-${suffix}`);
		otherGroupId = createIsolatedGroup(`IJ-TEST-OTHER-${suffix}`);
		importingGroupClient =
			await getAuthenticatedSupabaseClientForGroup(importingGroupId);
		otherGroupClient =
			await getAuthenticatedSupabaseClientForGroup(otherGroupId);

		importJobId = await new ImportJobTracker(
			importingGroupClient
		).createImportJob(importingGroupId);
	});

	afterAll(() => {
		// ImportJobs.ringing_group_id is ON DELETE CASCADE, so dropping the throwaway
		// groups takes their job rows with them.
		psql(
			`DELETE FROM "RingingGroups" WHERE id IN (${importingGroupId}, ${otherGroupId});`
		);
	});

	it('lets the importing group read back the job row it opened', async () => {
		const { data, error } = await importingGroupClient
			.from('ImportJobs')
			.select('ringing_group_id, status, started_at')
			.eq('id', importJobId)
			.single();

		expect(error).toBeNull();
		expect(data?.ringing_group_id).toBe(importingGroupId);
		expect(data?.status).toBe('in_progress');
		expect(data?.started_at).not.toBeNull();
	});

	it('hides one group’s job row from another group', async () => {
		const { data, error } = await otherGroupClient
			.from('ImportJobs')
			.select('id')
			.eq('id', importJobId);

		expect(error).toBeNull();
		expect(data).toEqual([]);
	});

	it('shows an anonymous client no ImportJobs rows at all', async () => {
		// `anon` does hold table-level SELECT (schema.sql grants it on every new
		// public table), so this is RLS filtering rather than a permissions error:
		// an anonymous request carries no ringing_group_id claim, so the policy
		// matches nothing and PostgREST returns an empty 200.
		const { data, error } = await supabase.from('ImportJobs').select('id');

		expect(error).toBeNull();
		expect(data).toEqual([]);
	});
});
