/**
 * The shared table-shape contract for the stats-cache tables (#1169) —
 * "SimpleStatsCache" and "SimpleStatsCacheBySpecies".
 *
 * Both police the same rules (one unique constraint, a NOT NULL
 * time_period with a sentinel for the all-time grain, a temporal_unit CHECK,
 * own-group-only RLS, and no DELETE grant) over different column sets, so the
 * assertions are identical per table while the row shape is not — the case
 * CLAUDE.md's `parametrized-test-runner` convention covers. Each caller file
 * invokes this once, and gets its own named describe block in the reporter so
 * a failure still points at one table.
 *
 * Requires local Supabase running:
 *   npm run db:start:local
 *
 * Run with: npm run test:integration
 *
 * All rows created here use a run-unique suffix and a random future date so
 * concurrent worktree runs against the shared local Supabase instance never
 * collide (see CLAUDE.md's "DB integration tests" section and
 * supabase/__tests__/test-isolation.ts).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedSupabaseClientForGroup } from '../../app/lib/auth/group-auth';
import { supabase as anonClient } from '../../lib/supabase';
import {
	createIsolatedGroup,
	grantGroupDataSharing,
	psql
} from './db-test-helpers';
import { randomTestSuffix, randomFutureDate } from './test-isolation';
import {
	ALL_TIME_SENTINEL_DATE,
	createIsolatedSpecies,
	type TemporalUnit
} from './stats-cache-fixtures';

/** Postgres/PostgREST error codes these tests assert on by name. */
const NOT_NULL_VIOLATION = '23502';
const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';
const INSUFFICIENT_PRIVILEGE = '42501';
/** PostgREST's own code for a column absent from the table's schema cache. */
const UNDEFINED_COLUMN = 'PGRST204';

type BuildRowParams = {
	groupId: number;
	speciesId: number;
	temporalUnit?: TemporalUnit;
	timePeriod?: string;
};

export function testStatsCacheTableShape({
	tableName,
	hasSpeciesColumn,
	metricColumns,
	nullableMetricColumns = [],
	updatableColumn,
	buildRow
}: {
	tableName: string;
	/** True for the `*BySpecies` tables. The other two have no such column at
	 * all, rather than a nullable one — which is the whole point of the
	 * split. */
	hasSpeciesColumn: boolean;
	/** Every non-key column of the table, with a representative value each, for
	 * the round-trip test. */
	metricColumns: Record<string, string | number>;
	/** The subset of `metricColumns` the schema leaves nullable — the eight
	 * biometric columns, on the two `Simple*` tables only. */
	nullableMetricColumns?: readonly string[];
	/** Any metric column, used as the payload of the RLS update tests. */
	updatableColumn: string;
	/** Adapts the generic params above to this table's own row shape — crucially,
	 * whether `speciesId` reaches the row at all. */
	buildRow: (params: BuildRowParams) => Record<string, unknown>;
}) {
	describe(tableName, () => {
		const suffix = randomTestSuffix();
		let ownerGroupId: number;
		let otherGroupId: number;
		let speciesId: number;
		let otherSpeciesId: number;
		let ownerClient: SupabaseClient;
		let otherClient: SupabaseClient;

		beforeAll(async () => {
			ownerGroupId = createIsolatedGroup(`sc-owner-${suffix}`);
			otherGroupId = createIsolatedGroup(`sc-other-${suffix}`);
			speciesId = createIsolatedSpecies(`${tableName}Species-${suffix}`);
			otherSpeciesId = createIsolatedSpecies(
				`${tableName}OtherSpecies-${suffix}`
			);
			[ownerClient, otherClient] = await Promise.all([
				getAuthenticatedSupabaseClientForGroup(ownerGroupId),
				getAuthenticatedSupabaseClientForGroup(otherGroupId)
			]);
		});

		afterAll(() => {
			psql(
				`DELETE FROM "${tableName}" WHERE group_id IN (${ownerGroupId}, ${otherGroupId});` +
					`DELETE FROM "Species" WHERE id IN (${speciesId}, ${otherSpeciesId});` +
					`DELETE FROM "RingingGroups" WHERE id IN (${ownerGroupId}, ${otherGroupId});`
			);
		});

		function deleteAllTestRows() {
			psql(
				`DELETE FROM "${tableName}" WHERE group_id IN (${ownerGroupId}, ${otherGroupId});`
			);
		}

		/** A row belonging to the group that owns it, with a random period unless
		 * one is named. */
		function ownerRow(
			overrides: Omit<BuildRowParams, 'groupId' | 'speciesId'> = {}
		) {
			return buildRow({ groupId: ownerGroupId, speciesId, ...overrides });
		}

		describe('the unique constraint', () => {
			afterEach(deleteAllTestRows);

			it('rejects a second row for the same group, temporal unit and period', async () => {
				const row = ownerRow();
				const first = await ownerClient.from(tableName).insert(row);
				const second = await ownerClient.from(tableName).insert(row);
				expect(first.error).toBeNull();
				expect(second.error?.code).toBe(UNIQUE_VIOLATION);
			});

			it('allows the same temporal unit and period for two different groups', async () => {
				const timePeriod = randomFutureDate();
				const ownerInsert = await ownerClient
					.from(tableName)
					.insert(ownerRow({ temporalUnit: 'year', timePeriod }));
				expect(ownerInsert.error).toBeNull();

				const otherInsert = await otherClient.from(tableName).insert(
					buildRow({
						groupId: otherGroupId,
						speciesId,
						temporalUnit: 'year',
						timePeriod
					})
				);
				expect(otherInsert.error).toBeNull();
			});

			it('allows two different temporal_unit rows for the same group and period', async () => {
				const timePeriod = randomFutureDate();
				const { error } = await ownerClient
					.from(tableName)
					.insert([
						ownerRow({ temporalUnit: 'month', timePeriod }),
						ownerRow({ temporalUnit: 'month-squashed', timePeriod })
					]);
				expect(error).toBeNull();
			});

			if (hasSpeciesColumn) {
				it('allows two different species for the same group, temporal unit and period', async () => {
					const timePeriod = randomFutureDate();
					const { error } = await ownerClient.from(tableName).insert([
						ownerRow({ timePeriod }),
						buildRow({
							groupId: ownerGroupId,
							speciesId: otherSpeciesId,
							timePeriod
						})
					]);
					expect(error).toBeNull();
				});
			}
		});

		describe('column types', () => {
			afterAll(deleteAllTestRows);

			it('round-trips every column with no narrowing', async () => {
				const timePeriod = randomFutureDate();
				const { data, error } = await ownerClient
					.from(tableName)
					.insert(ownerRow({ temporalUnit: 'day', timePeriod }))
					.select('*')
					.single();

				expect(error).toBeNull();
				for (const [column, value] of Object.entries(metricColumns)) {
					expect(data?.[column], column).toBe(value);
				}
				expect(data?.group_id).toBe(ownerGroupId);
				expect(data?.temporal_unit).toBe('day');
				expect(data?.time_period).toBe(timePeriod);
				expect(data?.species_id).toBe(hasSpeciesColumn ? speciesId : undefined);
			});

			it('rejects a NULL time_period', async () => {
				const { error } = await ownerClient
					.from(tableName)
					.insert({ ...ownerRow(), time_period: null });
				expect(error?.code).toBe(NOT_NULL_VIOLATION);
			});

			it("accepts the all-time grain's sentinel date as an ordinary time_period", async () => {
				const { data, error } = await ownerClient
					.from(tableName)
					.insert(
						ownerRow({
							temporalUnit: 'all-time',
							timePeriod: ALL_TIME_SENTINEL_DATE
						})
					)
					.select('time_period')
					.single();
				expect(error).toBeNull();
				expect(data?.time_period).toBe(ALL_TIME_SENTINEL_DATE);
			});

			it('rejects an unrecognised temporal_unit value', async () => {
				const { error } = await ownerClient
					.from(tableName)
					.insert({ ...ownerRow(), temporal_unit: 'fortnight' });
				expect(error?.code).toBe(CHECK_VIOLATION);
			});

			if (hasSpeciesColumn) {
				it('rejects a NULL species_id', async () => {
					const { error } = await ownerClient
						.from(tableName)
						.insert({ ...ownerRow(), species_id: null });
					expect(error?.code).toBe(NOT_NULL_VIOLATION);
				});
			} else {
				it('has no species_id column to write to at all', async () => {
					const { error } = await ownerClient
						.from(tableName)
						.insert({ ...ownerRow(), species_id: speciesId });
					expect(error?.code).toBe(UNDEFINED_COLUMN);
				});
			}

			if (nullableMetricColumns.length > 0) {
				it('allows NULL biometric columns on a row with no biometric-eligible encounters, without defaulting them to 0', async () => {
					const nulledBiometrics = Object.fromEntries(
						nullableMetricColumns.map((column) => [column, null])
					);
					const { data, error } = await ownerClient
						.from(tableName)
						.insert({ ...ownerRow(), ...nulledBiometrics })
						.select('*')
						.single();

					expect(error).toBeNull();
					for (const column of nullableMetricColumns) {
						expect(data?.[column], column).toBeNull();
					}
				});
			}
		});

		describe('timestamps', () => {
			afterAll(deleteAllTestRows);

			it('sets created_at and updated_at on insert', async () => {
				const { data, error } = await ownerClient
					.from(tableName)
					.insert(ownerRow())
					.select('created_at, updated_at')
					.single();

				expect(error).toBeNull();
				expect(data?.created_at).not.toBeNull();
				expect(data?.updated_at).not.toBeNull();
			});

			it('bumps updated_at but preserves created_at on update', async () => {
				const { data: inserted, error: insertError } = await ownerClient
					.from(tableName)
					.insert(ownerRow())
					.select('id, created_at, updated_at')
					.single();
				expect(insertError).toBeNull();

				const { data: updated, error: updateError } = await ownerClient
					.from(tableName)
					.update({ [updatableColumn]: 999 })
					.eq('id', inserted!.id)
					.select('created_at, updated_at')
					.single();

				expect(updateError).toBeNull();
				expect(updated?.created_at).toBe(inserted!.created_at);
				expect(
					new Date(updated!.updated_at).getTime()
				).toBeGreaterThan(new Date(inserted!.updated_at).getTime());
			});
		});

		describe('row level security and grants', () => {
			afterAll(deleteAllTestRows);

			/** Inserts one owner-group row and returns its id. */
			async function insertOwnerRow() {
				const { data, error } = await ownerClient
					.from(tableName)
					.insert(ownerRow())
					.select('id')
					.single();
				expect(error).toBeNull();
				return data!.id as number;
			}

			it('allows a group to read its own rows', async () => {
				const id = await insertOwnerRow();

				const { data, error } = await ownerClient
					.from(tableName)
					.select('id')
					.eq('id', id);
				expect(error).toBeNull();
				expect(data).toHaveLength(1);
			});

			it("blocks a read of another group's rows", async () => {
				const id = await insertOwnerRow();

				const { data, error } = await otherClient
					.from(tableName)
					.select('id')
					.eq('id', id);
				expect(error).toBeNull();
				expect(data).toEqual([]);
			});

			it('allows a group to update its own rows', async () => {
				const id = await insertOwnerRow();

				const { data, error } = await ownerClient
					.from(tableName)
					.update({ [updatableColumn]: 999 })
					.eq('id', id)
					.select(updatableColumn)
					.single();
				expect(error).toBeNull();
				expect(data?.[updatableColumn]).toBe(999);
			});

			it("blocks an authenticated insert/update targeting another group's rows", async () => {
				const blockedInsert = await otherClient
					.from(tableName)
					.insert(ownerRow());
				expect(blockedInsert.error).not.toBeNull();

				const id = await insertOwnerRow();
				const blockedUpdate = await otherClient
					.from(tableName)
					.update({ [updatableColumn]: 1 })
					.eq('id', id)
					.select('id');
				// RLS filters the target row down to none, so the update affects
				// nothing rather than erroring.
				expect(blockedUpdate.error).toBeNull();
				expect(blockedUpdate.data).toEqual([]);
			});

			it('blocks an authenticated delete — no delete grant exists for this table', async () => {
				const id = await insertOwnerRow();

				const { error } = await ownerClient
					.from(tableName)
					.delete()
					.eq('id', id);
				expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);
			});

			// The two OR-branches #1202 added to the SELECT policy, on top of the
			// own-group branch the cases above cover. Between them these are the
			// four access levels the summary page's core_stats/public_core_stats
			// read path supports, so a later repoint onto this cache keeps all of
			// them. `anonClient` is the plain anon-key client with no JWT at all —
			// exactly what a public summary page's server-side read uses.
			describe('cross-group and public access', () => {
				/** A group that has opted its summary area into public view, so the
				 * public_areas branch can be exercised without mutating the
				 * own-group fixtures above. */
				let publicGroupId: number;
				let publicGroupClient: SupabaseClient;
				let revokeSharing: (() => void) | undefined;

				beforeAll(async () => {
					publicGroupId = createIsolatedGroup(`sc-public-${suffix}`, [
						'summary'
					]);
					publicGroupClient =
						await getAuthenticatedSupabaseClientForGroup(publicGroupId);
				});

				afterAll(() => {
					psql(
						`DELETE FROM "${tableName}" WHERE group_id = ${publicGroupId};` +
							`DELETE FROM "RingingGroups" WHERE id = ${publicGroupId};`
					);
				});

				afterEach(() => {
					revokeSharing?.();
					revokeSharing = undefined;
				});

				/** Inserts one row owned by the publicly-opted-in group and returns
				 * its id. */
				async function insertPublicGroupRow() {
					const { data, error } = await publicGroupClient
						.from(tableName)
						.insert(buildRow({ groupId: publicGroupId, speciesId }))
						.select('id')
						.single();
					expect(error).toBeNull();
					return data!.id as number;
				}

				it("allows a recipient group to read a granter's rows via a GroupDataSharing grant", async () => {
					const id = await insertOwnerRow();
					revokeSharing = grantGroupDataSharing(ownerGroupId, otherGroupId);

					const { data, error } = await otherClient
						.from(tableName)
						.select('id')
						.eq('id', id);
					expect(error).toBeNull();
					expect(data).toHaveLength(1);
				});

				it('allows an anonymous client to read rows for a group with "summary" in public_areas', async () => {
					const id = await insertPublicGroupRow();

					const { data, error } = await anonClient
						.from(tableName)
						.select('id')
						.eq('id', id);
					expect(error).toBeNull();
					expect(data).toHaveLength(1);
				});

				it("blocks an anonymous client's read of rows for a group with an empty public_areas", async () => {
					const id = await insertOwnerRow();

					const { data, error } = await anonClient
						.from(tableName)
						.select('id')
						.eq('id', id);
					// A grant exists for anon, so RLS filters the row out rather than
					// the request failing with 42501.
					expect(error).toBeNull();
					expect(data).toEqual([]);
				});
			});
		});
	});
}
