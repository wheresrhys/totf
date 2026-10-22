/**
 * DB integration tests for the `ComplexStatsCache` table's own schema — its
 * four unique indexes, column types/nullability/CHECK and RLS — independent of
 * the (not-yet-written, see blocked-on-this ticket) refresh orchestrator that
 * populates it. The upsert RPC that orchestrator will call has its own tests in
 * upsert-complex-stats-cache-rows.test.ts. See
 * supabase/schema/schemas/public/tables/"ComplexStatsCache".sql.
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

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedSupabaseClientForGroup } from '../../app/lib/auth/group-auth';
import { createIsolatedGroup, psql } from './db-test-helpers';
import { randomTestSuffix, randomFutureDate } from './test-isolation';
import {
	DEFAULT_COMPLEX_METRICS,
	buildComplexStatsCacheRow,
	createIsolatedSpecies,
} from './stats-cache-fixtures';


describe('ComplexStatsCache', () => {
	const suffix = randomTestSuffix();
	let ownerGroupId: number;
	let otherGroupId: number;
	let speciesId: number;
	let ownerClient: SupabaseClient;
	let otherClient: SupabaseClient;

	beforeAll(async () => {
		ownerGroupId = createIsolatedGroup(`csc-owner-${suffix}`);
		otherGroupId = createIsolatedGroup(`csc-other-${suffix}`);
		speciesId = createIsolatedSpecies(`ComplexStatsCacheSpecies-${suffix}`);
		[ownerClient, otherClient] = await Promise.all([
			getAuthenticatedSupabaseClientForGroup(ownerGroupId),
			getAuthenticatedSupabaseClientForGroup(otherGroupId),
		]);
	});

	afterAll(() => {
		psql(
			`DELETE FROM "ComplexStatsCache" WHERE group_id IN (${ownerGroupId}, ${otherGroupId});` +
				`DELETE FROM "Species" WHERE id = ${speciesId};` +
				`DELETE FROM "RingingGroups" WHERE id IN (${ownerGroupId}, ${otherGroupId});`
		);
	});

	/** Each of the four null-patterns the table's four unique indexes police, as
	 * the pair of builder params that produces it. */
	const NULL_PATTERNS = {
		perSpeciesPerPeriod: { speciesId: () => speciesId, timePeriod: () => randomFutureDate() },
		allSpeciesPerPeriod: { speciesId: () => null, timePeriod: () => randomFutureDate() },
		perSpeciesAllTime: { speciesId: () => speciesId, timePeriod: () => null },
		allSpeciesAllTime: { speciesId: () => null, timePeriod: () => null },
	} as const;

	describe('the unique indexes', () => {
		// Per-test rather than per-block cleanup: the two all-time patterns key on
		// (group_id, temporal_unit[, species_id]) with no time_period to vary, so
		// rows left behind by one test would collide with the next one's.
		afterEach(() => {
			psql(`DELETE FROM "ComplexStatsCache" WHERE group_id IN (${ownerGroupId}, ${otherGroupId});`);
		});

		/** Inserts the same null-pattern twice for one group/grain and returns both
		 * results, so each index's own duplicate-rejection test is a one-liner. */
		async function insertTwice(pattern: keyof typeof NULL_PATTERNS) {
			const { speciesId: speciesIdFor, timePeriod: timePeriodFor } = NULL_PATTERNS[pattern];
			const row = buildComplexStatsCacheRow({
				groupId: ownerGroupId,
				speciesId: speciesIdFor(),
				temporalUnit: 'month',
				timePeriod: timePeriodFor(),
			});
			const first = await ownerClient.from('ComplexStatsCache').insert(row);
			const second = await ownerClient.from('ComplexStatsCache').insert(row);
			return { first, second };
		}

		it('rejects a duplicate per-species, dated row — the plain unique constraint', async () => {
			const { first, second } = await insertTwice('perSpeciesPerPeriod');
			expect(first.error).toBeNull();
			expect(second.error?.code).toBe('23505'); // unique_violation
		});

		it('rejects a duplicate all-species, dated row — the NULL species_id partial index', async () => {
			const { first, second } = await insertTwice('allSpeciesPerPeriod');
			expect(first.error).toBeNull();
			expect(second.error?.code).toBe('23505'); // unique_violation
		});

		it('rejects a duplicate per-species, all-time row — the NULL time_period partial index', async () => {
			const { first, second } = await insertTwice('perSpeciesAllTime');
			expect(first.error).toBeNull();
			expect(second.error?.code).toBe('23505'); // unique_violation
		});

		it('rejects a duplicate all-species, all-time row — the both-NULL partial index', async () => {
			const { first, second } = await insertTwice('allSpeciesAllTime');
			expect(first.error).toBeNull();
			expect(second.error?.code).toBe('23505'); // unique_violation
		});

		it('allows all four null-patterns to coexist for the same group/species/grain', async () => {
			const timePeriod = randomFutureDate();
			const { error } = await ownerClient.from('ComplexStatsCache').insert([
				buildComplexStatsCacheRow({ groupId: ownerGroupId, speciesId, temporalUnit: 'month', timePeriod }),
				buildComplexStatsCacheRow({ groupId: ownerGroupId, speciesId: null, temporalUnit: 'month', timePeriod }),
				buildComplexStatsCacheRow({ groupId: ownerGroupId, speciesId, temporalUnit: 'month', timePeriod: null }),
				buildComplexStatsCacheRow({ groupId: ownerGroupId, speciesId: null, temporalUnit: 'month', timePeriod: null }),
			]);
			expect(error).toBeNull();
		});

		it('allows the same species/grain/period for two different groups', async () => {
			const timePeriod = randomFutureDate();
			const ownerInsert = await ownerClient
				.from('ComplexStatsCache')
				.insert(buildComplexStatsCacheRow({ groupId: ownerGroupId, speciesId, temporalUnit: 'year', timePeriod }));
			expect(ownerInsert.error).toBeNull();

			const otherInsert = await otherClient
				.from('ComplexStatsCache')
				.insert(buildComplexStatsCacheRow({ groupId: otherGroupId, speciesId, temporalUnit: 'year', timePeriod }));
			expect(otherInsert.error).toBeNull();
		});
	});

	describe('column types', () => {
		afterAll(() => {
			psql(`DELETE FROM "ComplexStatsCache" WHERE group_id = ${ownerGroupId};`);
		});

		it('round-trips all five lifetime-relative demographics_stats_result columns with no narrowing', async () => {
			const timePeriod = randomFutureDate();
			const row = buildComplexStatsCacheRow({ groupId: ownerGroupId, speciesId, temporalUnit: 'day', timePeriod });

			const inserted = await ownerClient.from('ComplexStatsCache').insert(row).select('id').single();
			expect(inserted.error).toBeNull();

			const { data, error } = await ownerClient
				.from('ComplexStatsCache')
				.select('*')
				.eq('id', inserted.data!.id)
				.single();
			expect(error).toBeNull();
			for (const [column, value] of Object.entries(DEFAULT_COMPLEX_METRICS)) {
				expect(data?.[column as keyof typeof DEFAULT_COMPLEX_METRICS], column).toBe(value);
			}
			expect(data?.group_id).toBe(ownerGroupId);
			expect(data?.species_id).toBe(speciesId);
			expect(data?.temporal_unit).toBe('day');
			expect(data?.time_period).toBe(timePeriod);
		});

		it('round-trips a NULL species_id and time_period as the "all species, all time" cell rather than rejecting them', async () => {
			const row = buildComplexStatsCacheRow({
				groupId: ownerGroupId,
				speciesId: null,
				temporalUnit: 'all-time',
				timePeriod: null,
			});

			const { data, error } = await ownerClient
				.from('ComplexStatsCache')
				.insert(row)
				.select('species_id, time_period')
				.single();
			expect(error).toBeNull();
			expect(data?.species_id).toBeNull();
			expect(data?.time_period).toBeNull();
		});

		it('rejects an unrecognised temporal_unit value', async () => {
			const row = buildComplexStatsCacheRow({ groupId: ownerGroupId, speciesId });

			const { error } = await ownerClient
				.from('ComplexStatsCache')
				.insert({ ...row, temporal_unit: 'fortnight' } as never);
			expect(error).not.toBeNull();
			expect(error?.code).toBe('23514'); // check_violation
		});
	});

	describe('row level security', () => {
		afterAll(() => {
			psql(`DELETE FROM "ComplexStatsCache" WHERE group_id IN (${ownerGroupId}, ${otherGroupId});`);
		});

		it('allows a group to read its own rows', async () => {
			const inserted = await ownerClient
				.from('ComplexStatsCache')
				.insert(buildComplexStatsCacheRow({ groupId: ownerGroupId, speciesId, temporalUnit: 'month' }))
				.select('id')
				.single();
			expect(inserted.error).toBeNull();

			const { data, error } = await ownerClient.from('ComplexStatsCache').select('id').eq('id', inserted.data!.id);
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
		});

		it("blocks a read of another group's rows", async () => {
			const inserted = await ownerClient
				.from('ComplexStatsCache')
				.insert(buildComplexStatsCacheRow({ groupId: ownerGroupId, speciesId, temporalUnit: 'month' }))
				.select('id')
				.single();
			expect(inserted.error).toBeNull();

			const { data, error } = await otherClient.from('ComplexStatsCache').select('id').eq('id', inserted.data!.id);
			expect(error).toBeNull();
			expect(data).toEqual([]);
		});

		it('allows a group to insert/update its own rows', async () => {
			const inserted = await ownerClient
				.from('ComplexStatsCache')
				.insert(buildComplexStatsCacheRow({ groupId: ownerGroupId, speciesId, temporalUnit: 'month' }))
				.select('id')
				.single();
			expect(inserted.error).toBeNull();

			const updated = await ownerClient
				.from('ComplexStatsCache')
				.update({ new_adult_bird_count: 999 })
				.eq('id', inserted.data!.id)
				.select('new_adult_bird_count')
				.single();
			expect(updated.error).toBeNull();
			expect(updated.data?.new_adult_bird_count).toBe(999);
		});

		it("blocks an authenticated insert/update targeting another group's rows", async () => {
			const blockedInsert = await otherClient
				.from('ComplexStatsCache')
				.insert(buildComplexStatsCacheRow({ groupId: ownerGroupId, speciesId, temporalUnit: 'month' }));
			expect(blockedInsert.error).not.toBeNull();

			const ownedRow = await ownerClient
				.from('ComplexStatsCache')
				.insert(buildComplexStatsCacheRow({ groupId: ownerGroupId, speciesId, temporalUnit: 'month' }))
				.select('id')
				.single();
			expect(ownedRow.error).toBeNull();

			const blockedUpdate = await otherClient
				.from('ComplexStatsCache')
				.update({ new_adult_bird_count: 1 })
				.eq('id', ownedRow.data!.id)
				.select('id');
			expect(blockedUpdate.error).toBeNull();
			expect(blockedUpdate.data).toEqual([]); // RLS filters the target row to none, so the update affects nothing
		});

		it('blocks an authenticated delete — no delete grant exists for this table', async () => {
			const inserted = await ownerClient
				.from('ComplexStatsCache')
				.insert(buildComplexStatsCacheRow({ groupId: ownerGroupId, speciesId, temporalUnit: 'month' }))
				.select('id')
				.single();
			expect(inserted.error).toBeNull();

			const { error } = await ownerClient.from('ComplexStatsCache').delete().eq('id', inserted.data!.id);
			expect(error).not.toBeNull();
			expect(error?.code).toBe('42501'); // insufficient_privilege
		});
	});
});
