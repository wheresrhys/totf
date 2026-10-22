/**
 * DB integration tests for the `SimpleStatsCache` table's own schema — the
 * unique constraint, column types/nullability and RLS — independent of the
 * (not-yet-written, see sibling ticket) `refresh_simple_stats_cache` write
 * path. See supabase/schema/schemas/public/tables/"SimpleStatsCache".sql.
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
 * column comment in supabase/schema/schemas/public/tables/"SimpleStatsCache".sql. */
const ALL_TIME_SENTINEL = '0001-01-01';

type TemporalUnit = 'day' | 'month' | 'year' | 'month-squashed' | 'all-time';

/** Every non-key column, with one representative, round-trip-safe value per
 * source type (bigint, interval, numeric, real, smallint) — used as the
 * default metric payload so most tests need only override group_id/species_id/
 * temporal_unit/time_period. */
const DEFAULT_METRICS = {
	species_count: 7,
	bird_count: 42,
	encounter_count: 100,
	new_bird_count: 5,
	session_count: 3,
	total_effort: '10:30:00',
	effort_per_session: '03:30:00',
	effort_per_encounter: '00:06:18',
	avg_encounters_per_session: 12.5,
	max_per_session: 40,
	max_new_per_session: 10,
	max_weight: 15.75,
	avg_weight: 12.345,
	min_weight: 9.5,
	median_weight: 12,
	max_wing: 95,
	avg_wing: 88.4,
	min_wing: 80,
	median_wing: 85,
	pullus_bird_count: 1,
	juv_bird_count: 2,
	postjuv_bird_count: 3,
	adult_bird_count: 36,
	unknown_age_bird_count: 0,
	new_young_bird_count: 2,
	pullus_enc_count: 1,
	juv_enc_count: 2,
	postjuv_enc_count: 3,
	adult_enc_count: 90,
	unknown_age_enc_count: 4,
	postjuv_juv_enc_count: 5,
	new_postjuv_juv_enc_count: 1,
	new_postjuv_enc_count: 1,
} as const;

/** The eight biometric columns are genuinely nullable in the schema (see
 * supabase/schema/schemas/public/tables/"SimpleStatsCache".sql) even though
 * DEFAULT_METRICS gives each a representative non-null default — so the
 * builder's param type widens just these to `number | null` rather than
 * inheriting DEFAULT_METRICS' inferred non-null `number` type. */
type NullableBiometricColumn =
	| 'max_weight'
	| 'avg_weight'
	| 'min_weight'
	| 'median_weight'
	| 'max_wing'
	| 'avg_wing'
	| 'min_wing'
	| 'median_wing';

type SimpleStatsCacheRowParams = {
	groupId: number;
	speciesId: number;
	temporalUnit?: TemporalUnit;
	timePeriod?: string;
} & Partial<Omit<typeof DEFAULT_METRICS, NullableBiometricColumn>> &
	Partial<Record<NullableBiometricColumn, number | null>>;

/** Fixture builder: flat params merged over sensible defaults. */
function buildSimpleStatsCacheRow({
	groupId,
	speciesId,
	temporalUnit = 'month',
	timePeriod = randomFutureDate(),
	...metricOverrides
}: SimpleStatsCacheRowParams) {
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

describe('SimpleStatsCache', () => {
	const suffix = randomTestSuffix();
	let ownerGroupId: number;
	let otherGroupId: number;
	let speciesId: number;
	let ownerClient: SupabaseClient;
	let otherClient: SupabaseClient;

	beforeAll(async () => {
		ownerGroupId = createIsolatedGroup(`ssc-owner-${suffix}`);
		otherGroupId = createIsolatedGroup(`ssc-other-${suffix}`);
		speciesId = createIsolatedSpecies(`SimpleStatsCacheSpecies-${suffix}`);
		[ownerClient, otherClient] = await Promise.all([
			getAuthenticatedSupabaseClientForGroup(ownerGroupId),
			getAuthenticatedSupabaseClientForGroup(otherGroupId),
		]);
	});

	afterAll(() => {
		psql(
			`DELETE FROM "SimpleStatsCache" WHERE group_id IN (${ownerGroupId}, ${otherGroupId});` +
				`DELETE FROM "Species" WHERE id = ${speciesId};` +
				`DELETE FROM "RingingGroups" WHERE id IN (${ownerGroupId}, ${otherGroupId});`
		);
	});

	describe('the unique constraint', () => {
		afterAll(() => {
			psql(`DELETE FROM "SimpleStatsCache" WHERE group_id IN (${ownerGroupId}, ${otherGroupId});`);
		});

		it('rejects a duplicate dated row for the same group/species/grain/period', async () => {
			const timePeriod = randomFutureDate();
			const first = await ownerClient
				.from('SimpleStatsCache')
				.insert(buildSimpleStatsCacheRow({ groupId: ownerGroupId, speciesId, temporalUnit: 'month', timePeriod }));
			expect(first.error).toBeNull();

			const second = await ownerClient
				.from('SimpleStatsCache')
				.insert(buildSimpleStatsCacheRow({ groupId: ownerGroupId, speciesId, temporalUnit: 'month', timePeriod }));
			expect(second.error).not.toBeNull();
			expect(second.error?.code).toBe('23505'); // unique_violation
		});

		it('rejects a second all-time row for the same group/species (same sentinel time_period)', async () => {
			const first = await ownerClient.from('SimpleStatsCache').insert(
				buildSimpleStatsCacheRow({
					groupId: ownerGroupId,
					speciesId,
					temporalUnit: 'all-time',
					timePeriod: ALL_TIME_SENTINEL,
				})
			);
			expect(first.error).toBeNull();

			const second = await ownerClient.from('SimpleStatsCache').insert(
				buildSimpleStatsCacheRow({
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
				.from('SimpleStatsCache')
				.insert(buildSimpleStatsCacheRow({ groupId: ownerGroupId, speciesId, temporalUnit: 'year', timePeriod }));
			expect(ownerInsert.error).toBeNull();

			const otherInsert = await otherClient
				.from('SimpleStatsCache')
				.insert(buildSimpleStatsCacheRow({ groupId: otherGroupId, speciesId, temporalUnit: 'year', timePeriod }));
			expect(otherInsert.error).toBeNull();
		});

		it('allows two different temporal_unit rows for the same group/species/period', async () => {
			const timePeriod = randomFutureDate();
			const monthInsert = await ownerClient
				.from('SimpleStatsCache')
				.insert(buildSimpleStatsCacheRow({ groupId: ownerGroupId, speciesId, temporalUnit: 'month', timePeriod }));
			expect(monthInsert.error).toBeNull();

			const monthSquashedInsert = await ownerClient.from('SimpleStatsCache').insert(
				buildSimpleStatsCacheRow({
					groupId: ownerGroupId,
					speciesId,
					temporalUnit: 'month-squashed',
					timePeriod,
				})
			);
			expect(monthSquashedInsert.error).toBeNull();
		});
	});

	describe('column types', () => {
		afterAll(() => {
			psql(`DELETE FROM "SimpleStatsCache" WHERE group_id = ${ownerGroupId};`);
		});

		it('round-trips every column from the legacy core_stats_result/biometrics_stats_result/demographics_stats_result types with no narrowing', async () => {
			const timePeriod = randomFutureDate();
			const row = buildSimpleStatsCacheRow({ groupId: ownerGroupId, speciesId, temporalUnit: 'day', timePeriod });

			const inserted = await ownerClient.from('SimpleStatsCache').insert(row).select('id').single();
			expect(inserted.error).toBeNull();

			const { data, error } = await ownerClient
				.from('SimpleStatsCache')
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

		it('allows NULL biometric columns on a row with no biometric-eligible encounters, without defaulting them to 0', async () => {
			const row = buildSimpleStatsCacheRow({
				groupId: ownerGroupId,
				speciesId,
				temporalUnit: 'month',
				max_weight: null,
				avg_weight: null,
				min_weight: null,
				median_weight: null,
				max_wing: null,
				avg_wing: null,
				min_wing: null,
				median_wing: null,
			});

			const { data, error } = await ownerClient.from('SimpleStatsCache').insert(row).select('*').single();
			expect(error).toBeNull();
			expect(data?.max_weight).toBeNull();
			expect(data?.avg_weight).toBeNull();
			expect(data?.min_weight).toBeNull();
			expect(data?.median_weight).toBeNull();
			expect(data?.max_wing).toBeNull();
			expect(data?.avg_wing).toBeNull();
			expect(data?.min_wing).toBeNull();
			expect(data?.median_wing).toBeNull();
		});

		it('rejects a NULL time_period — the column is NOT NULL, all-time rows use the sentinel value instead', async () => {
			const row = buildSimpleStatsCacheRow({ groupId: ownerGroupId, speciesId, temporalUnit: 'all-time' });

			const { error } = await ownerClient
				.from('SimpleStatsCache')
				.insert({ ...row, time_period: null } as never);
			expect(error).not.toBeNull();
			expect(error?.code).toBe('23502'); // not_null_violation
		});
	});

	describe('row level security', () => {
		afterAll(() => {
			psql(`DELETE FROM "SimpleStatsCache" WHERE group_id IN (${ownerGroupId}, ${otherGroupId});`);
		});

		it('allows a group to read its own rows', async () => {
			const inserted = await ownerClient
				.from('SimpleStatsCache')
				.insert(buildSimpleStatsCacheRow({ groupId: ownerGroupId, speciesId, temporalUnit: 'month' }))
				.select('id')
				.single();
			expect(inserted.error).toBeNull();

			const { data, error } = await ownerClient.from('SimpleStatsCache').select('id').eq('id', inserted.data!.id);
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
		});

		it("blocks a read of another group's rows", async () => {
			const inserted = await ownerClient
				.from('SimpleStatsCache')
				.insert(buildSimpleStatsCacheRow({ groupId: ownerGroupId, speciesId, temporalUnit: 'month' }))
				.select('id')
				.single();
			expect(inserted.error).toBeNull();

			const { data, error } = await otherClient.from('SimpleStatsCache').select('id').eq('id', inserted.data!.id);
			expect(error).toBeNull();
			expect(data).toEqual([]);
		});

		it('allows a group to insert/update its own rows', async () => {
			const inserted = await ownerClient
				.from('SimpleStatsCache')
				.insert(buildSimpleStatsCacheRow({ groupId: ownerGroupId, speciesId, temporalUnit: 'month' }))
				.select('id')
				.single();
			expect(inserted.error).toBeNull();

			const updated = await ownerClient
				.from('SimpleStatsCache')
				.update({ bird_count: 999 })
				.eq('id', inserted.data!.id)
				.select('bird_count')
				.single();
			expect(updated.error).toBeNull();
			expect(updated.data?.bird_count).toBe(999);
		});

		it("blocks an authenticated insert/update targeting another group's rows", async () => {
			const blockedInsert = await otherClient
				.from('SimpleStatsCache')
				.insert(buildSimpleStatsCacheRow({ groupId: ownerGroupId, speciesId, temporalUnit: 'month' }));
			expect(blockedInsert.error).not.toBeNull();

			const ownedRow = await ownerClient
				.from('SimpleStatsCache')
				.insert(buildSimpleStatsCacheRow({ groupId: ownerGroupId, speciesId, temporalUnit: 'month' }))
				.select('id')
				.single();
			expect(ownedRow.error).toBeNull();

			const blockedUpdate = await otherClient
				.from('SimpleStatsCache')
				.update({ bird_count: 1 })
				.eq('id', ownedRow.data!.id)
				.select('id');
			expect(blockedUpdate.error).toBeNull();
			expect(blockedUpdate.data).toEqual([]); // RLS filters the target row to none, so the update affects nothing
		});

		it('blocks an authenticated delete — no delete grant exists for this table', async () => {
			const inserted = await ownerClient
				.from('SimpleStatsCache')
				.insert(buildSimpleStatsCacheRow({ groupId: ownerGroupId, speciesId, temporalUnit: 'month' }))
				.select('id')
				.single();
			expect(inserted.error).toBeNull();

			const { error } = await ownerClient.from('SimpleStatsCache').delete().eq('id', inserted.data!.id);
			expect(error).not.toBeNull();
			expect(error?.code).toBe('42501'); // insufficient_privilege
		});
	});
});
