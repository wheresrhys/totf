/**
 * DB integration tests for the `FailedStatsCacheRefreshes` table's own schema
 * (#1167) — column types/nullability and RLS. Unlike its two
 * "SimpleStatsCache"/"ComplexStatsCache" siblings this table has no uniqueness
 * to police, so there is no unique-index block to test: it is an append-only
 * log written through a plain PostgREST `.insert()` by
 * `lib/stats-cache-refresh.ts`. See
 * supabase/schema/schemas/public/tables/"FailedStatsCacheRefreshes".sql.
 *
 * Requires local Supabase running:
 *   npm run db:start:local
 *
 * Run with: npm run test:integration
 *
 * All rows created here use a run-unique suffix and/or a random future date so
 * concurrent worktree runs against the shared local Supabase instance never
 * collide (see CLAUDE.md's "DB integration tests" section and
 * supabase/__tests__/test-isolation.ts).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedSupabaseClientForGroup } from '../../app/lib/auth/group-auth';
import { createIsolatedGroup, psql } from './db-test-helpers';
import { randomTestSuffix, randomFutureDate } from './test-isolation';
import { createIsolatedSpecies } from './stats-cache-fixtures';

describe('FailedStatsCacheRefreshes', () => {
	const suffix = randomTestSuffix();
	let ownerGroupId: number;
	let otherGroupId: number;
	let speciesId: number;
	let ownerClient: SupabaseClient;
	let otherClient: SupabaseClient;

	beforeAll(async () => {
		ownerGroupId = createIsolatedGroup(`fscr-owner-${suffix}`);
		otherGroupId = createIsolatedGroup(`fscr-other-${suffix}`);
		speciesId = createIsolatedSpecies(
			`FailedStatsCacheRefreshesSpecies-${suffix}`
		);
		[ownerClient, otherClient] = await Promise.all([
			getAuthenticatedSupabaseClientForGroup(ownerGroupId),
			getAuthenticatedSupabaseClientForGroup(otherGroupId),
		]);
	});

	afterAll(() => {
		psql(
			`DELETE FROM "FailedStatsCacheRefreshes" WHERE group_id IN (${ownerGroupId}, ${otherGroupId});` +
				`DELETE FROM "Species" WHERE id = ${speciesId};` +
				`DELETE FROM "RingingGroups" WHERE id IN (${ownerGroupId}, ${otherGroupId});`
		);
	});

	/** One dead-letter row, in the shape `refreshSimpleStatsCache` writes. The
	 * `groupId` is a param because the RLS tests need to aim a row at a group
	 * other than the inserting client's own. */
	function buildFailedRefreshRow({
		groupId,
		speciesId: speciesIdOverride,
		timePeriod,
		details,
	}: {
		groupId: number;
		speciesId?: number | null;
		timePeriod?: string | null;
		details?: Record<string, unknown> | null;
	}) {
		return {
			group_id: groupId,
			cache_table: 'SimpleStatsCache',
			temporal_unit: 'day',
			species_id: speciesIdOverride === undefined ? speciesId : speciesIdOverride,
			time_period: timePeriod === undefined ? randomFutureDate() : timePeriod,
			reason: 'missing_from_metric_rpc',
			details:
				details === undefined
					? { missingFromRpc: ['stats_cache_biometrics_metrics'] }
					: details,
		};
	}

	describe('column types', () => {
		it('round-trips every column including nullable species_id/time_period/details', async () => {
			const timePeriod = randomFutureDate();
			const populated = await ownerClient
				.from('FailedStatsCacheRefreshes')
				.insert(buildFailedRefreshRow({ groupId: ownerGroupId, timePeriod }))
				.select('*')
				.single();
			expect(populated.error).toBeNull();
			expect(populated.data).toMatchObject({
				group_id: ownerGroupId,
				cache_table: 'SimpleStatsCache',
				temporal_unit: 'day',
				species_id: speciesId,
				time_period: timePeriod,
				reason: 'missing_from_metric_rpc',
				details: { missingFromRpc: ['stats_cache_biometrics_metrics'] },
			});
			// created_at is database-defaulted, so the writer never supplies it.
			expect(populated.data?.created_at).not.toBeNull();

			// The "all species, all time, no structured context" cell: all three
			// nullable columns come back as real NULLs rather than being rejected
			// or coerced.
			const sparse = await ownerClient
				.from('FailedStatsCacheRefreshes')
				.insert(
					buildFailedRefreshRow({
						groupId: ownerGroupId,
						speciesId: null,
						timePeriod: null,
						details: null,
					})
				)
				.select('species_id, time_period, details')
				.single();
			expect(sparse.error).toBeNull();
			expect(sparse.data?.species_id).toBeNull();
			expect(sparse.data?.time_period).toBeNull();
			expect(sparse.data?.details).toBeNull();
		});
	});

	describe('row level security', () => {
		it('allows a group to read/insert its own rows', async () => {
			const inserted = await ownerClient
				.from('FailedStatsCacheRefreshes')
				.insert(buildFailedRefreshRow({ groupId: ownerGroupId }))
				.select('id')
				.single();
			expect(inserted.error).toBeNull();

			const { data, error } = await ownerClient
				.from('FailedStatsCacheRefreshes')
				.select('id')
				.eq('id', inserted.data!.id);
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
		});

		it("blocks a read of another group's rows", async () => {
			const inserted = await ownerClient
				.from('FailedStatsCacheRefreshes')
				.insert(buildFailedRefreshRow({ groupId: ownerGroupId }))
				.select('id')
				.single();
			expect(inserted.error).toBeNull();

			const { data, error } = await otherClient
				.from('FailedStatsCacheRefreshes')
				.select('id')
				.eq('id', inserted.data!.id);
			expect(error).toBeNull();
			expect(data).toEqual([]);

			// ...and the other group cannot write a row attributed to the owner
			// either — the insert policy is own-group too.
			const blockedInsert = await otherClient
				.from('FailedStatsCacheRefreshes')
				.insert(buildFailedRefreshRow({ groupId: ownerGroupId }));
			expect(blockedInsert.error).not.toBeNull();
		});

		it('blocks an authenticated update', async () => {
			const inserted = await ownerClient
				.from('FailedStatsCacheRefreshes')
				.insert(buildFailedRefreshRow({ groupId: ownerGroupId }))
				.select('id')
				.single();
			expect(inserted.error).toBeNull();

			const { error } = await ownerClient
				.from('FailedStatsCacheRefreshes')
				.update({ reason: 'rewritten' })
				.eq('id', inserted.data!.id);
			expect(error?.code).toBe('42501'); // insufficient_privilege — no UPDATE grant
		});

		it('blocks an authenticated delete', async () => {
			const inserted = await ownerClient
				.from('FailedStatsCacheRefreshes')
				.insert(buildFailedRefreshRow({ groupId: ownerGroupId }))
				.select('id')
				.single();
			expect(inserted.error).toBeNull();

			const { error } = await ownerClient
				.from('FailedStatsCacheRefreshes')
				.delete()
				.eq('id', inserted.data!.id);
			expect(error?.code).toBe('42501'); // insufficient_privilege — no DELETE grant
		});
	});
});
