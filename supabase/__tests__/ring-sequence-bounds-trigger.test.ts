/**
 * Integration tests for the trg_refresh_ring_sequence_bounds trigger on Birds.
 *
 * When a bird is assigned to a RingSequences row (via Birds.ring_sequence_id, on
 * INSERT or on an UPDATE that changes the assignment), the sequence's
 * first_ring/last_ring window widens to cover it in escalating batch tiers.
 *
 * Requires local Supabase running and e2e seed data loaded:
 *   npm run db:start:local
 *   npm run db:seed:e2e
 *
 * Run with: npm run test:integration
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { execSync } from 'child_process';
import { getAuthenticatedSupabaseClientForGroup } from '../../lib/group-auth';
import { supabase } from '../../lib/supabase';
import { randomTestSuffix } from './test-isolation';
import type { SupabaseClient } from '@supabase/supabase-js';

const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

function psql(sql: string) {
	execSync(`psql "${LOCAL_DB_URL}" -c "${sql.replace(/"/g, '\\"')}"`);
}

/**
 * A purely-alphabetic, collision-free ring prefix. randomTestSuffix() can't be used
 * directly inside a ring number because it contains digits — the trigger splits a ring
 * on its leading `[A-Za-z]+` / trailing `[0-9]+`, so a digit in the "prefix" would
 * corrupt the numeric part. Six random letters give ~3e8 combinations, enough to keep
 * concurrent worktree runs (and the ring_no unique constraint) from colliding.
 */
function randomAlphaPrefix(): string {
	const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
	return Array.from({ length: 6 }, () => letters[Math.floor(Math.random() * 26)]).join('');
}

describe('Birds — ring_sequence_bounds trigger', () => {
	let groupClient: SupabaseClient;
	let deltaId: number;
	let speciesId: number;

	const createdBirdIds: number[] = [];
	const createdSeqIds: number[] = [];

	/** Create a fresh, empty (first_ring/last_ring NULL) RingSequences row for Delta. */
	async function newSequence(): Promise<{ id: number; prefix: string }> {
		const prefix = randomAlphaPrefix();
		const { data, error } = await groupClient
			.from('RingSequences')
			.insert({ prefix, ringing_group_id: deltaId })
			.select('id')
			.single();
		if (error) throw error;
		createdSeqIds.push(data!.id);
		return { id: data!.id, prefix };
	}

	/** Insert a bird with the given ring number, optionally assigned to a sequence. */
	async function insertBird(ringNo: string, ringSequenceId: number | null): Promise<number> {
		const { data, error } = await groupClient
			.from('Birds')
			.insert({ ring_no: ringNo, species_id: speciesId, ring_sequence_id: ringSequenceId })
			.select('id')
			.single();
		if (error) throw error;
		createdBirdIds.push(data!.id);
		return data!.id;
	}

	/** Read a sequence's current first_ring/last_ring bounds. */
	async function bounds(seqId: number): Promise<{ first_ring: string | null; last_ring: string | null }> {
		const { data, error } = await groupClient
			.from('RingSequences')
			.select('first_ring, last_ring')
			.eq('id', seqId)
			.single();
		if (error) throw error;
		return data as { first_ring: string | null; last_ring: string | null };
	}

	beforeAll(async () => {
		const { data: group, error: groupError } = await supabase
			.from('RingingGroups')
			.select('id')
			.eq('group_name', 'Delta')
			.single();
		if (groupError || !group) throw new Error('Delta group not found — run npm run db:seed:e2e first');
		deltaId = group.id;

		groupClient = await getAuthenticatedSupabaseClientForGroup(deltaId);

		const { data: species, error: speciesError } = await supabase
			.from('Species')
			.select('id')
			.eq('species_name', 'Robin')
			.single();
		if (speciesError || !species) throw new Error('Robin species not found — run npm run db:seed:e2e first');
		speciesId = species.id;
	});

	afterAll(() => {
		const birdIds = createdBirdIds.length ? createdBirdIds.join(', ') : '-1';
		const seqIds = createdSeqIds.length ? createdSeqIds.join(', ') : '-1';
		psql(`DELETE FROM "Birds" WHERE id IN (${birdIds});` + `DELETE FROM "RingSequences" WHERE id IN (${seqIds});`);
	});

	// Usual
	it('sets first_ring and last_ring from the first bird inserted into an empty sequence', async () => {
		const { id, prefix } = await newSequence();
		await insertBird(`${prefix}1699`, id);
		expect(await bounds(id)).toEqual({ first_ring: `${prefix}1691`, last_ring: `${prefix}1700` });
	});

	it('reproduces the 3-step worked example: AEL1699 → AEL1723 → AEL1755 yields first_ring "AEL1691" and last_ring stepping "AEL1700" → "AEL1730" → "AEL1791"', async () => {
		const { id, prefix } = await newSequence();

		await insertBird(`${prefix}1699`, id);
		expect(await bounds(id)).toEqual({ first_ring: `${prefix}1691`, last_ring: `${prefix}1700` });

		await insertBird(`${prefix}1723`, id);
		expect(await bounds(id)).toEqual({ first_ring: `${prefix}1691`, last_ring: `${prefix}1730` });

		await insertBird(`${prefix}1755`, id);
		expect(await bounds(id)).toEqual({ first_ring: `${prefix}1691`, last_ring: `${prefix}1791` });
	});

	// Structure — one branch of the algorithm per test
	it("does not move first_ring backward when the new ring's decade start is not less than the existing first_ring", async () => {
		const { id, prefix } = await newSequence();
		await insertBird(`${prefix}1699`, id); // first_ring = 1691
		await insertBird(`${prefix}1723`, id); // decade start 1721, not < 1691
		expect((await bounds(id)).first_ring).toBe(`${prefix}1691`);
	});

	it('moves first_ring backward when a bird earlier than the current first_ring is inserted afterward', async () => {
		const { id, prefix } = await newSequence();
		await insertBird(`${prefix}1699`, id); // first_ring = 1691, last_ring = 1700
		await insertBird(`${prefix}1685`, id); // decade start 1681 < 1691, no escalation
		expect(await bounds(id)).toEqual({ first_ring: `${prefix}1681`, last_ring: `${prefix}1700` });
	});

	it('widens last_ring up to the next multiple of ten when a new ring exceeds the current last_ring and is not itself a multiple of ten', async () => {
		const { id, prefix } = await newSequence();
		await insertBird(`${prefix}1699`, id); // last_ring = 1700
		await insertBird(`${prefix}1723`, id); // 1723 not a multiple of 10 → 1730
		expect((await bounds(id)).last_ring).toBe(`${prefix}1730`);
	});

	it('sets last_ring exactly to the new ring index when it exceeds the current last_ring and is already a multiple of ten', async () => {
		const { id, prefix } = await newSequence();
		await insertBird(`${prefix}1699`, id); // last_ring = 1700
		await insertBird(`${prefix}1720`, id); // 1720 is a multiple of 10 → exactly 1720
		expect((await bounds(id)).last_ring).toBe(`${prefix}1720`);
	});

	it('leaves last_ring unchanged when the new ring falls within the existing window', async () => {
		const { id, prefix } = await newSequence();
		await insertBird(`${prefix}1699`, id); // first_ring = 1691, last_ring = 1700
		await insertBird(`${prefix}1695`, id); // within [1691, 1700]
		expect(await bounds(id)).toEqual({ first_ring: `${prefix}1691`, last_ring: `${prefix}1700` });
	});

	it('escalates the window to first_ring + 100 once it exceeds 50', async () => {
		const { id, prefix } = await newSequence();
		await insertBird(`${prefix}1699`, id); // first_ring = 1691, last_ring = 1700
		await insertBird(`${prefix}1755`, id); // required width 69 > 50 → first + 100 = 1791
		expect((await bounds(id)).last_ring).toBe(`${prefix}1791`);
	});

	it('escalates the window to first_ring + 500 once it still exceeds 100 after the first escalation', async () => {
		const { id, prefix } = await newSequence();
		await insertBird(`${prefix}1699`, id); // first_ring = 1691, last_ring = 1700
		await insertBird(`${prefix}1900`, id); // required width 209 > 100 → first + 500 = 2191
		expect((await bounds(id)).last_ring).toBe(`${prefix}2191`);
	});

	it("grows the digit width of last_ring rather than truncating when last_index gains an extra digit versus the ring's own numeric width", async () => {
		const { id, prefix } = await newSequence();
		await insertBird(`${prefix}998`, id); // width 3; last_index rounds to 1000 (4 digits)
		expect(await bounds(id)).toEqual({ first_ring: `${prefix}991`, last_ring: `${prefix}1000` });
	});

	// Edge
	it('does not modify any RingSequences row when a bird is inserted with ring_sequence_id NULL', async () => {
		const { id, prefix } = await newSequence();
		await insertBird(`${prefix}1699`, null);
		expect(await bounds(id)).toEqual({ first_ring: null, last_ring: null });
	});

	it('does not modify RingSequences when a bird is updated but ring_sequence_id is unchanged', async () => {
		const { id, prefix } = await newSequence();
		const birdId = await insertBird(`${prefix}1699`, id); // bounds now set

		// Blank the bounds directly, then re-set ring_sequence_id to its current value.
		// The trigger must short-circuit (OLD IS NOT DISTINCT FROM NEW) and leave the
		// blanked bounds untouched — it must not recompute and re-widen them.
		await groupClient.from('RingSequences').update({ first_ring: null, last_ring: null }).eq('id', id);
		await groupClient.from('Birds').update({ ring_sequence_id: id }).eq('id', birdId);

		expect(await bounds(id)).toEqual({ first_ring: null, last_ring: null });
	});

	it("recomputes bounds when an existing bird's ring_sequence_id is changed via UPDATE, not just on INSERT", async () => {
		const { id, prefix } = await newSequence();
		const birdId = await insertBird(`${prefix}1699`, null); // inserted unassigned → trigger no-ops
		expect(await bounds(id)).toEqual({ first_ring: null, last_ring: null });

		await groupClient.from('Birds').update({ ring_sequence_id: id }).eq('id', birdId);
		expect(await bounds(id)).toEqual({ first_ring: `${prefix}1691`, last_ring: `${prefix}1700` });
	});

	it('preserves leading zeros / correctly computes ring_index for ring numbers like "AEL0007"', async () => {
		const { id, prefix } = await newSequence();
		await insertBird(`${prefix}0007`, id); // width 4; ring_index = 7 → first 0001, last 0010
		expect(await bounds(id)).toEqual({ first_ring: `${prefix}0001`, last_ring: `${prefix}0010` });
	});
});
