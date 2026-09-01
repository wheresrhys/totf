/**
 * DB integration tests for the RingSequences table's own schema — column
 * defaults/nullability, the ring_size enum's declared ordering, the
 * (prefix, ringing_group_id) unique constraint, NOT NULL/FK constraints, and RLS —
 * independent of the ring-sequence RPC functions covered in ring-sequences.test.ts (#657).
 *
 * Requires local Supabase running and e2e seed data loaded:
 *   npm run db:start:local
 *   npm run db:seed:e2e
 *
 * Run with: npm run test:integration
 *
 * All rows created here use a run-unique suffix so concurrent worktree runs against the
 * shared local Supabase instance never collide (see CLAUDE.md's "DB integration tests"
 * section and supabase/__tests__/test-isolation.ts).
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { execSync } from 'child_process';
import { getAuthenticatedSupabaseClientForGroup } from '../../lib/group-auth';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomTestSuffix } from './test-isolation';
import { createRingSequenceLookup } from '../../lib/demon-import';

const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

function psql(sql: string) {
	execSync(`psql "${LOCAL_DB_URL}" -c "${sql.replace(/"/g, '\\"')}"`);
}

function psqlScalar(sql: string): string {
	return execSync(`psql "${LOCAL_DB_URL}" -t -A -c "${sql.replace(/"/g, '\\"')}"`)
		.toString()
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)[0];
}

function createIsolatedGroup(name: string): number {
	return Number(
		psqlScalar(
			`INSERT INTO "RingingGroups" (group_name, slug) VALUES ('${name}', '${name.toLowerCase().replace(/ /g, '-')}') RETURNING id;`
		)
	);
}

describe('RingSequences table', () => {
	describe('column defaults and nullability', () => {
		const suffix = randomTestSuffix();
		let groupId: number;
		let groupClient: SupabaseClient;

		beforeAll(async () => {
			groupId = createIsolatedGroup(`ring-sequences-defaults-${suffix}`);
			groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
		});

		afterAll(() => {
			psql(
				`DELETE FROM "RingSequences" WHERE ringing_group_id = ${groupId};` +
					`DELETE FROM "RingingGroups" WHERE id = ${groupId};`
			);
		});

		it('defaults owned_by_group to true when omitted on insert', async () => {
			const { data, error } = await groupClient
				.from('RingSequences')
				.insert({ prefix: `RS-${suffix}-DEFAULT`, ringing_group_id: groupId })
				.select('owned_by_group')
				.single();
			expect(error).toBeNull();
			expect(data?.owned_by_group).toBe(true);
		});

		it('accepts a null size (unset ring-size metadata)', async () => {
			const { data, error } = await groupClient
				.from('RingSequences')
				.insert({ prefix: `RS-${suffix}-NULLSIZE`, ringing_group_id: groupId, size: null })
				.select('size')
				.single();
			expect(error).toBeNull();
			expect(data?.size).toBeNull();
		});

		it('accepts an explicit ring_size value, including one containing a "+" (e.g. "B+")', async () => {
			const { data, error } = await groupClient
				.from('RingSequences')
				.insert({ prefix: `RS-${suffix}-PLUS`, ringing_group_id: groupId, size: 'B+' })
				.select('size')
				.single();
			expect(error).toBeNull();
			expect(data?.size).toBe('B+');
		});

		it('accepts null first_ring and last_ring (set via the ring-sequences UI, not on insert)', async () => {
			const { data, error } = await groupClient
				.from('RingSequences')
				.insert({ prefix: `RS-${suffix}-RINGS`, ringing_group_id: groupId })
				.select('first_ring, last_ring')
				.single();
			expect(error).toBeNull();
			expect(data?.first_ring).toBeNull();
			expect(data?.last_ring).toBeNull();
		});
	});

	describe('generated numeric bounds (first_index / last_index)', () => {
		const suffix = randomTestSuffix();
		let groupId: number;
		let groupClient: SupabaseClient;

		beforeAll(async () => {
			groupId = createIsolatedGroup(`ring-sequences-bounds-${suffix}`);
			groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
		});

		afterAll(() => {
			psql(
				`DELETE FROM "RingSequences" WHERE ringing_group_id = ${groupId};` +
					`DELETE FROM "RingingGroups" WHERE id = ${groupId};`
			);
		});

		it('derives first_index/last_index by stripping the leading alpha prefix and casting the trailing digits to a number', async () => {
			const { data, error } = await groupClient
				.from('RingSequences')
				.insert({
					prefix: 'ABC',
					ringing_group_id: groupId,
					first_ring: 'ABC1000',
					last_ring: 'ABC2000'
				})
				.select('first_index, last_index')
				.single();
			expect(error).toBeNull();
			expect(data?.first_index).toBe(1000);
			expect(data?.last_index).toBe(2000);
		});

		it('ignores leading zeros in the trailing digits (e.g. "ABC0100" -> 100)', async () => {
			const { data, error } = await groupClient
				.from('RingSequences')
				.insert({
					prefix: 'DEF',
					ringing_group_id: groupId,
					first_ring: 'DEF0100',
					last_ring: 'DEF0200'
				})
				.select('first_index, last_index')
				.single();
			expect(error).toBeNull();
			expect(data?.first_index).toBe(100);
			expect(data?.last_index).toBe(200);
		});

		it('leaves first_index/last_index null when first_ring/last_ring are null', async () => {
			const { data, error } = await groupClient
				.from('RingSequences')
				.insert({ prefix: 'GHI', ringing_group_id: groupId })
				.select('first_index, last_index')
				.single();
			expect(error).toBeNull();
			expect(data?.first_index).toBeNull();
			expect(data?.last_index).toBeNull();
		});

		it('rejects a direct write to the generated first_index column', async () => {
			const { error } = await groupClient
				.from('RingSequences')
				.insert({
					prefix: 'JKL',
					ringing_group_id: groupId,
					first_index: 5 // GENERATED ALWAYS — rejected at the DB, not the type layer
				});
			expect(error).not.toBeNull();
			expect(error?.code).toBe('428C9'); // cannot insert into generated column
		});
	});

	describe('createRingSequenceLookup bounds matching', () => {
		const suffix = randomTestSuffix();
		let groupId: number;
		let groupClient: SupabaseClient;
		let boundedRowId: number;
		let lookup: ReturnType<typeof createRingSequenceLookup>;

		beforeAll(async () => {
			groupId = createIsolatedGroup(`ring-sequences-lookup-${suffix}`);
			groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
			lookup = createRingSequenceLookup(groupClient);

			// A bounded sequence: prefix ABC covering ABC1000..ABC2000.
			const bounded = await groupClient
				.from('RingSequences')
				.insert({
					prefix: 'ABC',
					ringing_group_id: groupId,
					first_ring: 'ABC1000',
					last_ring: 'ABC2000'
				})
				.select('id')
				.single();
			if (bounded.error || !bounded.data)
				throw bounded.error ?? new Error('Failed to seed bounded RingSequences row');
			boundedRowId = bounded.data.id;

			// An unbounded sequence (null first/last): prefix DEF, no numeric window.
			await groupClient
				.from('RingSequences')
				.insert({ prefix: 'DEF', ringing_group_id: groupId });
		});

		afterAll(() => {
			psql(
				`DELETE FROM "RingSequences" WHERE ringing_group_id = ${groupId};` +
					`DELETE FROM "RingingGroups" WHERE id = ${groupId};`
			);
		});

		it('matches a ring whose first 3 chars equal the prefix and whose number is within [first_index, last_index]', async () => {
			expect(await lookup('ABC1500', groupId)).toBe(boundedRowId);
		});

		it('matches a ring on the lower and upper bounds inclusively', async () => {
			expect(await lookup('ABC1000', groupId)).toBe(boundedRowId);
			expect(await lookup('ABC2000', groupId)).toBe(boundedRowId);
		});

		it('does not match a ring numerically below first_index', async () => {
			expect(await lookup('ABC0999', groupId)).toBeNull();
		});

		it('does not match a ring numerically above last_index', async () => {
			expect(await lookup('ABC2001', groupId)).toBeNull();
		});

		it('does not match a ring whose first 3 chars differ from the prefix', async () => {
			expect(await lookup('XYZ1500', groupId)).toBeNull();
		});

		it('does not match a sequence with null bounds (unverifiable numeric window)', async () => {
			expect(await lookup('DEF1500', groupId)).toBeNull();
		});
	});

	describe('ring_size enum ordering', () => {
		const suffix = randomTestSuffix();
		let groupId: number;
		let groupClient: SupabaseClient;

		beforeAll(async () => {
			groupId = createIsolatedGroup(`ring-sequences-order-${suffix}`);
			groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
			await groupClient.from('RingSequences').insert([
				{ prefix: `RS-${suffix}-SO`, ringing_group_id: groupId, size: 'SO' },
				{ prefix: `RS-${suffix}-C`, ringing_group_id: groupId, size: 'C' },
			]);
		});

		afterAll(() => {
			psql(
				`DELETE FROM "RingSequences" WHERE ringing_group_id = ${groupId};` +
					`DELETE FROM "RingingGroups" WHERE id = ${groupId};`
			);
		});

		it('sorts rows by size ascending in the declared BTO order, not alphabetically (e.g. "SO" sorts before "C")', async () => {
			const { data, error } = await groupClient
				.from('RingSequences')
				.select('prefix, size')
				.eq('ringing_group_id', groupId)
				.order('size', { ascending: true });
			expect(error).toBeNull();
			expect(data?.map((row) => row.size)).toEqual(['SO', 'C']);
		});

		it('rejects an insert with a size value outside the enum (e.g. "Z")', async () => {
			const { error } = await groupClient.from('RingSequences').insert({
				prefix: `RS-${suffix}-INVALID`,
				ringing_group_id: groupId,
				// @ts-expect-error 'Z' is deliberately not a member of the ring_size enum
				size: 'Z',
			});
			expect(error).not.toBeNull();
			expect(error?.code).toBe('22P02'); // invalid_text_representation (bad enum literal)
		});
	});

	describe('unique constraint on (prefix, ringing_group_id)', () => {
		const suffix = randomTestSuffix();
		let groupAId: number;
		let groupBId: number;
		let groupAClient: SupabaseClient;
		let groupBClient: SupabaseClient;

		beforeAll(async () => {
			groupAId = createIsolatedGroup(`ring-sequences-unique-a-${suffix}`);
			groupBId = createIsolatedGroup(`ring-sequences-unique-b-${suffix}`);
			[groupAClient, groupBClient] = await Promise.all([
				getAuthenticatedSupabaseClientForGroup(groupAId),
				getAuthenticatedSupabaseClientForGroup(groupBId),
			]);
		});

		afterAll(() => {
			psql(
				`DELETE FROM "RingSequences" WHERE ringing_group_id IN (${groupAId}, ${groupBId});` +
					`DELETE FROM "RingingGroups" WHERE id IN (${groupAId}, ${groupBId});`
			);
		});

		it('allows inserting a RingSequences row with a prefix unique to that group', async () => {
			const { error } = await groupAClient
				.from('RingSequences')
				.insert({ prefix: `RS-${suffix}-UNIQUE`, ringing_group_id: groupAId });
			expect(error).toBeNull();
		});

		it('rejects a duplicate (prefix, ringing_group_id) insert with a 23505 unique-violation error', async () => {
			const prefix = `RS-${suffix}-DUP`;
			const first = await groupAClient
				.from('RingSequences')
				.insert({ prefix, ringing_group_id: groupAId });
			expect(first.error).toBeNull();

			const duplicate = await groupAClient
				.from('RingSequences')
				.insert({ prefix, ringing_group_id: groupAId });
			expect(duplicate.error?.code).toBe('23505');
		});

		it('allows a different group to reuse the same prefix as another group (constraint is per-group, not global)', async () => {
			const prefix = `RS-${suffix}-SHARED`;
			const forGroupA = await groupAClient
				.from('RingSequences')
				.insert({ prefix, ringing_group_id: groupAId });
			expect(forGroupA.error).toBeNull();

			const forGroupB = await groupBClient
				.from('RingSequences')
				.insert({ prefix, ringing_group_id: groupBId });
			expect(forGroupB.error).toBeNull();
		});
	});

	describe('NOT NULL / foreign key constraints', () => {
		const suffix = randomTestSuffix();
		let groupId: number;
		let groupClient: SupabaseClient;

		beforeAll(async () => {
			groupId = createIsolatedGroup(`ring-sequences-constraints-${suffix}`);
			groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
		});

		afterAll(() => {
			psql(
				`DELETE FROM "RingSequences" WHERE ringing_group_id = ${groupId};` +
					`DELETE FROM "RingingGroups" WHERE id = ${groupId};`
			);
		});

		it('rejects an insert with a null prefix', async () => {
			const { error } = await groupClient.from('RingSequences').insert({
				// @ts-expect-error prefix is required — deliberately omitted to test the NOT NULL constraint
				ringing_group_id: groupId,
			});
			expect(error).not.toBeNull();
			expect(error?.code).toBe('23502'); // not_null_violation
		});

		it('rejects a raw insert (bypassing RLS) referencing a non-existent ringing_group_id with a foreign-key-violation error', () => {
			const nonExistentGroupId = 999999999;
			expect(() =>
				psql(
					`INSERT INTO "RingSequences" (prefix, ringing_group_id) VALUES ('RS-${suffix}-FK', ${nonExistentGroupId});`
				)
			).toThrow();
		});
	});

	describe('RLS — SELECT', () => {
		const suffix = randomTestSuffix();
		let ownerGroupId: number;
		let otherGroupId: number;
		let ownerClient: SupabaseClient;
		let otherClient: SupabaseClient;

		beforeAll(async () => {
			ownerGroupId = createIsolatedGroup(`ring-sequences-select-owner-${suffix}`);
			otherGroupId = createIsolatedGroup(`ring-sequences-select-other-${suffix}`);
			[ownerClient, otherClient] = await Promise.all([
				getAuthenticatedSupabaseClientForGroup(ownerGroupId),
				getAuthenticatedSupabaseClientForGroup(otherGroupId),
			]);
			await ownerClient
				.from('RingSequences')
				.insert({ prefix: `RS-${suffix}-SELECT`, ringing_group_id: ownerGroupId });
			// Grant otherGroup read access to ownerGroup's data generally, to prove
			// RingSequences ignores GroupDataSharing entirely — unlike Locations/Sessions,
			// which allow a granted recipient group to also SELECT (see the table's schema
			// file for the "strictly own-group only" RLS rationale).
			psql(
				`INSERT INTO "GroupDataSharing" (granter_group_id, recipient_group_id) VALUES (${ownerGroupId}, ${otherGroupId});`
			);
		});

		afterAll(() => {
			psql(
				`DELETE FROM "GroupDataSharing" WHERE granter_group_id = ${ownerGroupId} AND recipient_group_id = ${otherGroupId};` +
					`DELETE FROM "RingSequences" WHERE ringing_group_id = ${ownerGroupId};` +
					`DELETE FROM "RingingGroups" WHERE id IN (${ownerGroupId}, ${otherGroupId});`
			);
		});

		it('a group can select its own RingSequences rows', async () => {
			const { data, error } = await ownerClient
				.from('RingSequences')
				.select('prefix')
				.eq('ringing_group_id', ownerGroupId);
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
		});

		it("a group cannot select another group's RingSequences rows, even with a GroupDataSharing grant in place (no cross-group sharing for this table)", async () => {
			const { data, error } = await otherClient
				.from('RingSequences')
				.select('prefix')
				.eq('ringing_group_id', ownerGroupId);
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});
	});

	describe('RLS — INSERT', () => {
		const suffix = randomTestSuffix();
		let ownGroupId: number;
		let otherGroupId: number;
		let ownClient: SupabaseClient;

		beforeAll(async () => {
			ownGroupId = createIsolatedGroup(`ring-sequences-insert-own-${suffix}`);
			otherGroupId = createIsolatedGroup(`ring-sequences-insert-other-${suffix}`);
			ownClient = await getAuthenticatedSupabaseClientForGroup(ownGroupId);
		});

		afterAll(() => {
			psql(
				`DELETE FROM "RingSequences" WHERE ringing_group_id IN (${ownGroupId}, ${otherGroupId});` +
					`DELETE FROM "RingingGroups" WHERE id IN (${ownGroupId}, ${otherGroupId});`
			);
		});

		it('a group can insert a RingSequences row for itself', async () => {
			const { error } = await ownClient
				.from('RingSequences')
				.insert({ prefix: `RS-${suffix}-SELF`, ringing_group_id: ownGroupId });
			expect(error).toBeNull();
		});

		it('a group cannot insert a RingSequences row for another group (ringing_group_id mismatch rejected by policy)', async () => {
			const { error } = await ownClient
				.from('RingSequences')
				.insert({ prefix: `RS-${suffix}-OTHER`, ringing_group_id: otherGroupId });
			expect(error).not.toBeNull();
		});
	});

	describe('RLS — UPDATE', () => {
		const suffix = randomTestSuffix();
		let ownerGroupId: number;
		let otherGroupId: number;
		let ownerClient: SupabaseClient;
		let otherClient: SupabaseClient;
		let rowId: number;

		beforeAll(async () => {
			ownerGroupId = createIsolatedGroup(`ring-sequences-update-owner-${suffix}`);
			otherGroupId = createIsolatedGroup(`ring-sequences-update-other-${suffix}`);
			[ownerClient, otherClient] = await Promise.all([
				getAuthenticatedSupabaseClientForGroup(ownerGroupId),
				getAuthenticatedSupabaseClientForGroup(otherGroupId),
			]);
			const { data, error } = await ownerClient
				.from('RingSequences')
				.insert({ prefix: `RS-${suffix}-UPDATE`, ringing_group_id: ownerGroupId })
				.select('id')
				.single();
			if (error || !data) throw error ?? new Error('Failed to seed RingSequences row');
			rowId = data.id;
		});

		afterAll(() => {
			psql(
				`DELETE FROM "RingSequences" WHERE ringing_group_id IN (${ownerGroupId}, ${otherGroupId});` +
					`DELETE FROM "RingingGroups" WHERE id IN (${ownerGroupId}, ${otherGroupId});`
			);
		});

		it('a group can update its own RingSequences row (e.g. setting a previously-null size)', async () => {
			const { data, error } = await ownerClient
				.from('RingSequences')
				.update({ size: 'C' })
				.eq('id', rowId)
				.select('size')
				.single();
			expect(error).toBeNull();
			expect(data?.size).toBe('C');
		});

		it("a group cannot update another group's RingSequences row", async () => {
			const { data, error } = await otherClient
				.from('RingSequences')
				.update({ size: 'D2' })
				.eq('id', rowId)
				.select('size');
			expect(error).toBeNull();
			expect(data).toHaveLength(0);

			const { data: unchanged } = await ownerClient
				.from('RingSequences')
				.select('size')
				.eq('id', rowId)
				.single();
			expect(unchanged?.size).toBe('C');
		});
	});
});
