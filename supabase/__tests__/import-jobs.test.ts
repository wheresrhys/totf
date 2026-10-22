/**
 * Integration tests for ImportJobs RLS, plus the per-temporal-unit
 * stats-cache-refresh-status columns the table actually carries (#1154).
 *
 * ImportJobs is group-scoped on the plain `ringing_group_id = jwt` pattern, with no
 * GroupDataSharing clause: a sharing grant exposes a group's bird data, not the
 * operational record of how that data got loaded. See
 * supabase/schema/schemas/public/tables/"ImportJobs".sql.
 *
 * Both groups are created fresh per run (db-test-helpers' `createIsolatedGroup` with
 * a random suffix) rather than reusing the e2e seed groups, so a concurrent worktree
 * can never see or count these rows — and so the cross-group check is against a
 * group that definitively has no sharing grant either way. One job row, opened once
 * in the file-level `beforeAll`, serves both describe blocks: every test here is
 * read-only against it.
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
import { createIsolatedGroup, psql, psqlScalar } from './db-test-helpers';
import { randomTestSuffix } from './test-isolation';

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

describe('ImportJobs RLS', () => {
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

describe('the per-temporal-unit stats-cache refresh-status columns', () => {
	it('opens all five temporal units at in_progress on createImportJob', async () => {
		const { data, error } = await importingGroupClient
			.from('ImportJobs')
			.select(
				'day_stats_refresh_status, month_stats_refresh_status, year_stats_refresh_status, month_squashed_stats_refresh_status, all_time_stats_refresh_status'
			)
			.eq('id', importJobId)
			.single();

		expect(error).toBeNull();
		// Whole-row assertion rather than five key checks, so a sixth column
		// appearing (or one of these quietly defaulting to something else) fails.
		expect(data).toEqual({
			day_stats_refresh_status: 'in_progress',
			month_stats_refresh_status: 'in_progress',
			year_stats_refresh_status: 'in_progress',
			month_squashed_stats_refresh_status: 'in_progress',
			all_time_stats_refresh_status: 'in_progress'
		});
	});

	it('no longer carries the three stats-type columns they replaced', () => {
		// Read off the catalog rather than by querying the columns: a dropped
		// column is a schema fact, and PostgREST would answer a select for one
		// with a generic 400 that an unrelated typo would produce too.
		const survivingStatsTypeColumns = psqlScalar(
			`SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ImportJobs' AND column_name IN ('core_stats_refresh_status', 'biometrics_stats_refresh_status', 'demographics_stats_refresh_status');`
		);

		expect(survivingStatsTypeColumns).toBe('0');
	});
});
