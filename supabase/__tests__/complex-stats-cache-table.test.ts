/**
 * DB integration tests for the `ComplexStatsCache` table's own schema — the
 * unique constraint, column types/nullability/CHECK and RLS — independent of
 * the (not-yet-written, see blocked-on-this ticket) write path that populates
 * it. See supabase/schema/schemas/public/tables/"ComplexStatsCache".sql.
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
import { createIsolatedGroup, psql, psqlScalar } from './db-test-helpers';
import { randomTestSuffix, randomFutureDate } from './test-isolation';

/** Sentinel `time_period` value for the 'all-time' grain — see the table's own
 * column comment in supabase/schema/schemas/public/tables/"ComplexStatsCache".sql. */
const ALL_TIME_SENTINEL = '0001-01-01';

type TemporalUnit = 'day' | 'month' | 'year' | 'month-squashed' | 'all-time';

/** The five lifetime-relative metric columns, with a distinct representative
 * bigint value each so a round-trip test can tell them apart if any were ever
 * mis-mapped. */
const DEFAULT_METRICS = {
	new_adult_bird_count: 11,
	returning_age_1_bird_count: 22,
	returning_age_2_bird_count: 33,
	returning_age_3_plus_bird_count: 44,
	returning_new_unknown_age_bird_count: 55,
} as const;

type ComplexStatsCacheRowParams = {
	groupId: number;
	speciesId: number;
	temporalUnit?: TemporalUnit;
	timePeriod?: string;
} & Partial<typeof DEFAULT_METRICS>;

/** Fixture builder: flat params merged over sensible defaults. */
function buildComplexStatsCacheRow({
	groupId,
	speciesId,
	temporalUnit = 'month',
	timePeriod = randomFutureDate(),
	...metricOverrides
}: ComplexStatsCacheRowParams) {
	return {
		group_id: groupId,
		species_id: speciesId,
		temporal_unit: temporalUnit,
		time_period: timePeriod,
		...DEFAULT_METRICS,
		...metricOverrides,
	};
}

/** Creates a throwaway `Species` row and returns its id. */
function createIsolatedSpecies(name: string): number {
	return Number(psqlScalar(`INSERT INTO "Species" (species_name) VALUES ('${name}') RETURNING id;`));
}

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

	describe('the unique constraint', () => {
		afterAll(() => {
			psql(`DELETE FROM "ComplexStatsCache" WHERE group_id IN (${ownerGroupId}, ${otherGroupId});`);
		});

		it('rejects a duplicate dated row for the same group/species/grain/period', async () => {
			const timePeriod = randomFutureDate();
			const first = await ownerClient
				.from('ComplexStatsCache')
				.insert(buildComplexStatsCacheRow({ groupId: ownerGroupId, speciesId, temporalUnit: 'month', timePeriod }));
			expect(first.error).toBeNull();

			const second = await ownerClient
				.from('ComplexStatsCache')
				.insert(buildComplexStatsCacheRow({ groupId: ownerGroupId, speciesId, temporalUnit: 'month', timePeriod }));
			expect(second.error).not.toBeNull();
			expect(second.error?.code).toBe('23505'); // unique_violation
		});

		it('rejects a second all-time row for the same group/species (same sentinel time_period)', async () => {
			const first = await ownerClient.from('ComplexStatsCache').insert(
				buildComplexStatsCacheRow({
					groupId: ownerGroupId,
					speciesId,
					temporalUnit: 'all-time',
					timePeriod: ALL_TIME_SENTINEL,
				})
			);
			expect(first.error).toBeNull();

			const second = await ownerClient.from('ComplexStatsCache').insert(
				buildComplexStatsCacheRow({
					groupId: ownerGroupId,
					speciesId,
					temporalUnit: 'all-time',
					timePeriod: ALL_TIME_SENTINEL,
				})
			);
			expect(second.error).not.toBeNull();
			expect(second.error?.code).toBe('23505'); // unique_violation
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
			for (const [column, value] of Object.entries(DEFAULT_METRICS)) {
				expect(data?.[column as keyof typeof DEFAULT_METRICS], column).toBe(value);
			}
			expect(data?.group_id).toBe(ownerGroupId);
			expect(data?.species_id).toBe(speciesId);
			expect(data?.temporal_unit).toBe('day');
			expect(data?.time_period).toBe(timePeriod);
		});

		it('stores the sentinel time_period verbatim on an all-time row', async () => {
			const row = buildComplexStatsCacheRow({
				groupId: ownerGroupId,
				speciesId,
				temporalUnit: 'all-time',
				timePeriod: ALL_TIME_SENTINEL,
			});

			const { data, error } = await ownerClient.from('ComplexStatsCache').insert(row).select('time_period').single();
			expect(error).toBeNull();
			expect(data?.time_period).toBe(ALL_TIME_SENTINEL);
		});

		it('rejects a NULL time_period — the column is NOT NULL, all-time rows use the sentinel value instead', async () => {
			const row = buildComplexStatsCacheRow({ groupId: ownerGroupId, speciesId, temporalUnit: 'all-time' });

			const { error } = await ownerClient.from('ComplexStatsCache').insert({ ...row, time_period: null } as never);
			expect(error).not.toBeNull();
			expect(error?.code).toBe('23502'); // not_null_violation
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
