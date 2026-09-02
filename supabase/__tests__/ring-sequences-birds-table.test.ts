/**
 * DB integration tests for the `RingSequences_Birds` table's own schema —
 * unique/NOT NULL/FK constraints and RLS — independent of the
 * `ring_sequence_controls` RPC behaviour covered in ring-sequences.test.ts.
 *
 * `RingSequences_Birds` replaces the old group-agnostic `Birds.ring_sequence_id`
 * FK (issue #703): each group's link between a bird and a sequence is its own
 * row, scoped to that group by RLS with no cross-group sharing, so one group can
 * no longer create, read, alter or remove another group's link.
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
import { getAuthenticatedSupabaseClientForGroup } from '../../lib/group-auth';
import { supabase } from '../../lib/supabase';
import { randomTestSuffix } from './test-isolation';
import { psql, createIsolatedGroup } from './db-test-helpers';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('RingSequences_Birds table', () => {
	// Shared fixtures reused across the describe blocks below: an isolated group
	// with a bird and a sequence it can legitimately link to. Reused rather than
	// re-created per block since none of the tests mutate the bird or sequence
	// themselves, only rows in RingSequences_Birds.
	const suffix = randomTestSuffix();
	let groupId: number;
	let otherGroupId: number;
	let groupClient: SupabaseClient;
	let otherClient: SupabaseClient;
	let birdId: number;
	let sequenceId: number;

	beforeAll(async () => {
		groupId = createIsolatedGroup(`rsb-owner-${suffix}`);
		otherGroupId = createIsolatedGroup(`rsb-other-${suffix}`);
		[groupClient, otherClient] = await Promise.all([
			getAuthenticatedSupabaseClientForGroup(groupId),
			getAuthenticatedSupabaseClientForGroup(otherGroupId),
		]);

		const { data: species, error: speciesError } = await supabase
			.from('Species')
			.select('id')
			.eq('species_name', 'Robin')
			.single();
		if (speciesError || !species) throw new Error('Robin species not found — run npm run db:seed:e2e first');

		const { data: bird, error: birdError } = await groupClient
			.from('Birds')
			.insert({ ring_no: `RSB-${suffix}`, species_id: species.id })
			.select('id')
			.single();
		if (birdError || !bird) throw birdError ?? new Error('Failed to seed Birds row');
		birdId = bird.id;

		const { data: sequence, error: sequenceError } = await groupClient
			.from('RingSequences')
			.insert({ prefix: `RSB-${suffix}`, ringing_group_id: groupId })
			.select('id')
			.single();
		if (sequenceError || !sequence) throw sequenceError ?? new Error('Failed to seed RingSequences row');
		sequenceId = sequence.id;
	});

	afterAll(() => {
		psql(
			`DELETE FROM "RingSequences_Birds" WHERE ringing_group_id IN (${groupId}, ${otherGroupId});` +
				`DELETE FROM "RingSequences" WHERE id = ${sequenceId};` +
				`DELETE FROM "Birds" WHERE id = ${birdId};` +
				`DELETE FROM "RingingGroups" WHERE id IN (${groupId}, ${otherGroupId});`
		);
	});

	describe('unique constraint on (bird_id, ring_sequence_id, ringing_group_id)', () => {
		afterAll(() => {
			psql(`DELETE FROM "RingSequences_Birds" WHERE ringing_group_id = ${groupId};`);
		});

		it('allows inserting a link for a (bird, sequence, group) triple', async () => {
			const { error } = await groupClient
				.from('RingSequences_Birds')
				.insert({ bird_id: birdId, ring_sequence_id: sequenceId, ringing_group_id: groupId });
			expect(error).toBeNull();
		});

		it('rejects a duplicate (bird_id, ring_sequence_id, ringing_group_id) insert with a 23505 unique-violation error', async () => {
			const duplicate = await groupClient
				.from('RingSequences_Birds')
				.insert({ bird_id: birdId, ring_sequence_id: sequenceId, ringing_group_id: groupId });
			expect(duplicate.error?.code).toBe('23505');
		});
	});

	describe('NOT NULL / foreign key constraints', () => {
		it('rejects an insert with a null bird_id', async () => {
			const { error } = await groupClient.from('RingSequences_Birds').insert({
				// @ts-expect-error bird_id is required — deliberately omitted to test the NOT NULL constraint
				ring_sequence_id: sequenceId,
				ringing_group_id: groupId,
			});
			expect(error).not.toBeNull();
			expect(error?.code).toBe('23502'); // not_null_violation
		});

		it('rejects a raw insert (bypassing RLS) referencing a non-existent bird_id with a foreign-key-violation error', () => {
			const nonExistentBirdId = 999999999;
			expect(() =>
				psql(
					`INSERT INTO "RingSequences_Birds" (bird_id, ring_sequence_id, ringing_group_id) VALUES (${nonExistentBirdId}, ${sequenceId}, ${groupId});`
				)
			).toThrow();
		});

		it('rejects a raw insert (bypassing RLS) referencing a non-existent ring_sequence_id with a foreign-key-violation error', () => {
			const nonExistentSequenceId = 999999999;
			expect(() =>
				psql(
					`INSERT INTO "RingSequences_Birds" (bird_id, ring_sequence_id, ringing_group_id) VALUES (${birdId}, ${nonExistentSequenceId}, ${groupId});`
				)
			).toThrow();
		});
	});

	describe('RLS — SELECT', () => {
		let rowId: number;

		beforeAll(async () => {
			const { data, error } = await groupClient
				.from('RingSequences_Birds')
				.insert({ bird_id: birdId, ring_sequence_id: sequenceId, ringing_group_id: groupId })
				.select('id')
				.single();
			if (error || !data) throw error ?? new Error('Failed to seed RingSequences_Birds row');
			rowId = data.id;
			psql(
				`INSERT INTO "GroupDataSharing" (granter_group_id, recipient_group_id) VALUES (${groupId}, ${otherGroupId});`
			);
		});

		afterAll(() => {
			psql(
				`DELETE FROM "GroupDataSharing" WHERE granter_group_id = ${groupId} AND recipient_group_id = ${otherGroupId};` +
					`DELETE FROM "RingSequences_Birds" WHERE id = ${rowId};`
			);
		});

		it('a group can select its own RingSequences_Birds row', async () => {
			const { data, error } = await groupClient
				.from('RingSequences_Birds')
				.select('id')
				.eq('id', rowId);
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
		});

		it("a group cannot select another group's RingSequences_Birds row, even with a GroupDataSharing grant in place (no cross-group sharing for this table)", async () => {
			const { data, error } = await otherClient
				.from('RingSequences_Birds')
				.select('id')
				.eq('id', rowId);
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});
	});

	describe('RLS — INSERT', () => {
		afterAll(() => {
			psql(`DELETE FROM "RingSequences_Birds" WHERE ringing_group_id = ${groupId};`);
		});

		it('a group can insert a RingSequences_Birds row for itself', async () => {
			const { error } = await groupClient
				.from('RingSequences_Birds')
				.insert({ bird_id: birdId, ring_sequence_id: sequenceId, ringing_group_id: groupId });
			expect(error).toBeNull();
		});

		it("a group cannot insert a RingSequences_Birds row for another group (ringing_group_id mismatch rejected by policy) — this is the #703 fix: a group can no longer plant a link on another group's behalf", async () => {
			const { error } = await otherClient
				.from('RingSequences_Birds')
				.insert({ bird_id: birdId, ring_sequence_id: sequenceId, ringing_group_id: groupId });
			expect(error).not.toBeNull();
		});
	});

	describe('RLS — UPDATE', () => {
		let rowId: number;
		let otherSequenceId: number;

		beforeAll(async () => {
			const { data: row, error: rowError } = await groupClient
				.from('RingSequences_Birds')
				.insert({ bird_id: birdId, ring_sequence_id: sequenceId, ringing_group_id: groupId })
				.select('id')
				.single();
			if (rowError || !row) throw rowError ?? new Error('Failed to seed RingSequences_Birds row');
			rowId = row.id;

			const { data: sequence, error: sequenceError } = await groupClient
				.from('RingSequences')
				.insert({ prefix: `RSB2-${suffix}`, ringing_group_id: groupId })
				.select('id')
				.single();
			if (sequenceError || !sequence) throw sequenceError ?? new Error('Failed to seed second RingSequences row');
			otherSequenceId = sequence.id;
		});

		afterAll(() => {
			psql(
				`DELETE FROM "RingSequences_Birds" WHERE id = ${rowId};` +
					`DELETE FROM "RingSequences" WHERE id = ${otherSequenceId};`
			);
		});

		it('a group can update its own RingSequences_Birds row (e.g. repointing it to a different sequence)', async () => {
			const { data, error } = await groupClient
				.from('RingSequences_Birds')
				.update({ ring_sequence_id: otherSequenceId })
				.eq('id', rowId)
				.select('ring_sequence_id')
				.single();
			expect(error).toBeNull();
			expect(data?.ring_sequence_id).toBe(otherSequenceId);
		});

		it("a group cannot update another group's RingSequences_Birds row", async () => {
			const { data, error } = await otherClient
				.from('RingSequences_Birds')
				.update({ ring_sequence_id: sequenceId })
				.eq('id', rowId)
				.select('ring_sequence_id');
			expect(error).toBeNull();
			expect(data).toHaveLength(0);

			const { data: unchanged } = await groupClient
				.from('RingSequences_Birds')
				.select('ring_sequence_id')
				.eq('id', rowId)
				.single();
			expect(unchanged?.ring_sequence_id).toBe(otherSequenceId);
		});
	});

	describe('RLS — DELETE', () => {
		let rowId: number;

		beforeAll(async () => {
			const { data, error } = await groupClient
				.from('RingSequences_Birds')
				.insert({ bird_id: birdId, ring_sequence_id: sequenceId, ringing_group_id: groupId })
				.select('id')
				.single();
			if (error || !data) throw error ?? new Error('Failed to seed RingSequences_Birds row');
			rowId = data.id;
		});

		afterAll(() => {
			psql(`DELETE FROM "RingSequences_Birds" WHERE id = ${rowId};`);
		});

		it("a group cannot delete another group's RingSequences_Birds row", async () => {
			const { error } = await otherClient.from('RingSequences_Birds').delete().eq('id', rowId);
			expect(error).toBeNull(); // RLS silently matches zero rows rather than erroring

			const { data: stillThere } = await groupClient
				.from('RingSequences_Birds')
				.select('id')
				.eq('id', rowId);
			expect(stillThere).toHaveLength(1);
		});

		it('a group can delete its own RingSequences_Birds row', async () => {
			const { error } = await groupClient.from('RingSequences_Birds').delete().eq('id', rowId);
			expect(error).toBeNull();

			const { data: gone } = await groupClient
				.from('RingSequences_Birds')
				.select('id')
				.eq('id', rowId);
			expect(gone).toHaveLength(0);
		});
	});
});
