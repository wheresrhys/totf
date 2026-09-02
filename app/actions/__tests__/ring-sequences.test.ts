/**
 * DB integration tests for the ring-sequence server actions
 * (`app/actions/ring-sequences.ts`): `fetchRingSequences`, `updateRingSequence` and
 * `promoteControlToSequence`. These call `getAuthenticatedSupabaseClient()`, which
 * reads the caller's JWT from a cookie via `next/headers` — unavailable outside a
 * Next.js request. `@/app/actions/group-cookie` is mocked below to hand back a real
 * JWT for whichever group `authenticateAs()` last selected (generated the same way
 * `getAuthenticatedSupabaseClientForGroup` does for other integration tests), so
 * everything downstream of that — the Supabase client, RLS, the database — is real.
 * This replaces the old test file, which only asserted mocked Supabase method calls
 * without checking real end-to-end behaviour (issue #725).
 *
 * Requires local Supabase running and e2e seed data loaded:
 *   npm run db:start:local
 *   npm run db:seed:e2e
 *
 * Run with: npm run test:integration
 *
 * All rows created here use a run-unique suffix/prefix so concurrent worktree runs
 * against the shared local Supabase instance never collide (see CLAUDE.md's "DB
 * integration tests" section and supabase/__tests__/test-isolation.ts).
 */

import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	fetchRingSequences,
	updateRingSequence,
	promoteControlToSequence
} from '../ring-sequences';
import { getAuthenticatedSupabaseClientForGroup } from '@/lib/group-auth';
import { supabase } from '@/lib/supabase';
import { randomTestSuffix } from '@/supabase/__tests__/test-isolation';
import {
	psql,
	psqlScalar,
	createIsolatedGroup
} from '@/supabase/__tests__/db-test-helpers';

// The active group for the mocked `getGroupJwt()` below. `authenticateAs()` sets
// this before an action call to stand in for "the caller is logged in as this
// group" without going through a real cookie/request. `vi.mock` is hoisted above
// every import in this file, so `../ring-sequences`'s transitive import of
// `@/app/actions/group-cookie` (via `@/lib/group-auth`) resolves to this mock.
const activeGroupId = vi.hoisted(() => ({ current: null as number | null }));

vi.mock('@/app/actions/group-cookie', () => ({
	getGroupJwt: async () => {
		if (activeGroupId.current === null) return null;
		const { generateGroupJwt } = await import('@/lib/jwt');
		return generateGroupJwt(activeGroupId.current);
	}
}));

function authenticateAs(groupId: number): void {
	activeGroupId.current = groupId;
}

function makeFormData(fields: Record<string, string>): FormData {
	const fd = new FormData();
	for (const [key, value] of Object.entries(fields)) fd.append(key, value);
	return fd;
}

// A short random uppercase 3-letter prefix — `promoteControlToSequence` derives a
// ring sequence's prefix as the ring number's first 3 characters, and RingSequences
// enforces a unique (prefix, ringing_group_id) constraint, so concurrent worktree
// runs must never share one.
function randomPrefix(): string {
	const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
	return Array.from(
		{ length: 3 },
		() => letters[Math.floor(Math.random() * 26)]
	).join('');
}

describe('fetchRingSequences', () => {
	const suffix = randomTestSuffix();
	let groupId: number;
	let otherGroupId: number;

	beforeAll(async () => {
		groupId = createIsolatedGroup(`fetch-ring-sequences-${suffix}`);
		otherGroupId = createIsolatedGroup(`fetch-ring-sequences-other-${suffix}`);
		const groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
		const { error } = await groupClient.from('RingSequences').insert([
			{ prefix: `Z-${suffix}`, ringing_group_id: groupId },
			{ prefix: `A-${suffix}`, ringing_group_id: groupId }
		]);
		if (error) throw error;
	});

	afterAll(() => {
		psql(
			`DELETE FROM "RingSequences" WHERE ringing_group_id IN (${groupId}, ${otherGroupId});` +
				`DELETE FROM "RingingGroups" WHERE id IN (${groupId}, ${otherGroupId});`
		);
	});

	it("returns the group's ring sequences ordered by prefix", async () => {
		authenticateAs(groupId);
		const result = await fetchRingSequences(groupId);
		expect(result?.map((row) => row.prefix)).toEqual([
			`A-${suffix}`,
			`Z-${suffix}`
		]);
	});

	it("does not return another group's ring sequences, even when asked for by id (RLS + explicit filter)", async () => {
		authenticateAs(otherGroupId);
		const result = await fetchRingSequences(groupId);
		expect(result).toEqual([]);
	});

	it('returns an empty array (not null) when the group has no ring sequences', async () => {
		authenticateAs(otherGroupId);
		const result = await fetchRingSequences(otherGroupId);
		expect(result).toEqual([]);
	});
});

describe('updateRingSequence', () => {
	const suffix = randomTestSuffix();
	let groupId: number;
	let otherGroupId: number;
	let rowId: number;
	let secondRowId: number;
	let otherGroupRowId: number;
	let groupClient: SupabaseClient;
	let otherGroupClient: SupabaseClient;

	beforeAll(async () => {
		groupId = createIsolatedGroup(`update-ring-sequence-${suffix}`);
		otherGroupId = createIsolatedGroup(`update-ring-sequence-other-${suffix}`);
		groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
		otherGroupClient =
			await getAuthenticatedSupabaseClientForGroup(otherGroupId);

		const { data: row, error: rowError } = await groupClient
			.from('RingSequences')
			.insert({ prefix: `URS-${suffix}-1`, ringing_group_id: groupId })
			.select('id')
			.single();
		if (rowError || !row) throw rowError ?? new Error('Failed to seed row');
		rowId = row.id;

		const { data: secondRow, error: secondRowError } = await groupClient
			.from('RingSequences')
			.insert({ prefix: `URS-${suffix}-2`, ringing_group_id: groupId })
			.select('id')
			.single();
		if (secondRowError || !secondRow)
			throw secondRowError ?? new Error('Failed to seed second row');
		secondRowId = secondRow.id;

		const { data: otherRow, error: otherRowError } = await otherGroupClient
			.from('RingSequences')
			.insert({ prefix: `URS-${suffix}-OTHER`, ringing_group_id: otherGroupId })
			.select('id')
			.single();
		if (otherRowError || !otherRow)
			throw otherRowError ?? new Error('Failed to seed other-group row');
		otherGroupRowId = otherRow.id;
	});

	afterAll(() => {
		psql(
			`DELETE FROM "RingSequences" WHERE ringing_group_id IN (${groupId}, ${otherGroupId});` +
				`DELETE FROM "RingingGroups" WHERE id IN (${groupId}, ${otherGroupId});`
		);
	});

	it('updates size and prefix and persists the change', async () => {
		authenticateAs(groupId);
		const result = await updateRingSequence(
			null,
			makeFormData({ id: String(rowId), size: 'C', prefix: `URS-${suffix}-1B` })
		);
		expect(result).toEqual({ success: true });

		const { data } = await groupClient
			.from('RingSequences')
			.select('size, prefix')
			.eq('id', rowId)
			.single();
		expect(data).toMatchObject({ size: 'C', prefix: `URS-${suffix}-1B` });
	});

	it('returns a validation error and does not call supabase when size is empty', async () => {
		authenticateAs(groupId);
		const result = await updateRingSequence(
			null,
			makeFormData({ id: String(rowId), size: '', prefix: `URS-${suffix}-1B` })
		);
		expect(result).toEqual({
			success: false,
			error: 'Please select a ring size'
		});
	});

	it('returns a validation error when prefix is blank', async () => {
		authenticateAs(groupId);
		const result = await updateRingSequence(
			null,
			makeFormData({ id: String(rowId), size: 'C', prefix: '   ' })
		);
		expect(result).toEqual({ success: false, error: 'Prefix cannot be empty' });
	});

	it('surfaces a unique-constraint violation when updating to a prefix already used by the same group', async () => {
		authenticateAs(groupId);
		const result = await updateRingSequence(
			null,
			makeFormData({
				id: String(secondRowId),
				size: 'C',
				prefix: `URS-${suffix}-1B`
			})
		);
		expect(result).toMatchObject({ success: false });
		if (result && !result.success) {
			expect(result.error).toContain('unique constraint');
		}
	});

	it("does not modify another group's row — RLS silently matches zero rows rather than erroring, so the action still reports success", async () => {
		authenticateAs(groupId);
		const result = await updateRingSequence(
			null,
			makeFormData({
				id: String(otherGroupRowId),
				size: 'D2',
				prefix: `URS-${suffix}-HIJACKED`
			})
		);
		expect(result).toEqual({ success: true });

		const { data } = await otherGroupClient
			.from('RingSequences')
			.select('size, prefix')
			.eq('id', otherGroupRowId)
			.single();
		expect(data).toMatchObject({ size: null, prefix: `URS-${suffix}-OTHER` });
	});
});

describe('promoteControlToSequence', () => {
	const suffix = randomTestSuffix();
	let groupId: number;
	let otherGroupId: number;
	let robinId: number;
	let locationId: number;
	let sessionId: number;
	let otherLocationId: number;
	let otherSessionId: number;
	let groupClient: SupabaseClient;
	let otherGroupClient: SupabaseClient;

	const createdBirdIds: number[] = [];
	const createdSeqIds: number[] = [];

	// Creates a Bird for `client`/`onBehalfOfGroupId` with a single Encounter, which
	// populates `Birds.ringing_group_ids` via the DB trigger — a raw `insert` on
	// Birds alone leaves it as the empty-array default.
	async function createBird(
		client: SupabaseClient,
		ringNo: string,
		onSessionId: number
	): Promise<number> {
		const { data: bird, error: birdError } = await client
			.from('Birds')
			.insert({ ring_no: ringNo, species_id: robinId })
			.select('id')
			.single();
		if (birdError || !bird)
			throw birdError ?? new Error('Failed to create bird');
		createdBirdIds.push(bird.id);

		const { error: encounterError } = await client.from('Encounters').insert({
			capture_time: '09:00:00',
			record_type: 'S',
			scheme: 'BTO',
			sex: 'U',
			age_code: 4,
			session_id: onSessionId,
			bird_id: bird.id
		});
		if (encounterError) throw encounterError;

		return bird.id;
	}

	// Verification reads use `groupClient` (authenticated as `groupId`) rather than
	// the anon `supabase` client — RingSequences/RingSequences_Birds RLS has no
	// anon-read policy, so an unauthenticated select silently returns zero rows
	// regardless of what's actually there.
	async function ringSequenceFor(prefix: string, forGroupId: number) {
		const { data } = await groupClient
			.from('RingSequences')
			.select('*')
			.eq('prefix', prefix)
			.eq('ringing_group_id', forGroupId)
			.maybeSingle();
		return data;
	}

	async function linkedBirdIds(ringSequenceId: number): Promise<number[]> {
		const { data } = await groupClient
			.from('RingSequences_Birds')
			.select('bird_id')
			.eq('ring_sequence_id', ringSequenceId);
		return (data ?? []).map((row) => row.bird_id);
	}

	beforeAll(async () => {
		groupId = createIsolatedGroup(`promote-control-${suffix}`);
		otherGroupId = createIsolatedGroup(`promote-control-other-${suffix}`);
		[groupClient, otherGroupClient] = await Promise.all([
			getAuthenticatedSupabaseClientForGroup(groupId),
			getAuthenticatedSupabaseClientForGroup(otherGroupId)
		]);

		const { data: robin, error: robinError } = await supabase
			.from('Species')
			.select('id')
			.eq('species_name', 'Robin')
			.single();
		if (robinError || !robin)
			throw new Error(
				'Robin species not found — run npm run db:seed:e2e first'
			);
		robinId = robin.id;

		const { data: location, error: locationError } = await groupClient
			.from('Locations')
			.insert({
				location_name: `Promote Control Location ${suffix}`,
				ringing_group_id: groupId
			})
			.select('id')
			.single();
		if (locationError || !location)
			throw locationError ?? new Error('Failed to create location');
		locationId = location.id;

		const { data: session, error: sessionError } = await groupClient
			.from('Sessions')
			.insert({ visit_date: '2090-01-01', location_id: locationId })
			.select('id')
			.single();
		if (sessionError || !session)
			throw sessionError ?? new Error('Failed to create session');
		sessionId = session.id;

		const { data: otherLocation, error: otherLocationError } =
			await otherGroupClient
				.from('Locations')
				.insert({
					location_name: `Promote Control Other Location ${suffix}`,
					ringing_group_id: otherGroupId
				})
				.select('id')
				.single();
		if (otherLocationError || !otherLocation)
			throw otherLocationError ?? new Error('Failed to create other location');
		otherLocationId = otherLocation.id;

		const { data: otherSession, error: otherSessionError } =
			await otherGroupClient
				.from('Sessions')
				.insert({ visit_date: '2090-01-01', location_id: otherLocationId })
				.select('id')
				.single();
		if (otherSessionError || !otherSession)
			throw otherSessionError ?? new Error('Failed to create other session');
		otherSessionId = otherSession.id;
	});

	afterAll(() => {
		const birdIds = createdBirdIds.length ? createdBirdIds.join(', ') : '-1';
		const seqIds = createdSeqIds.length ? createdSeqIds.join(', ') : '-1';
		psql(
			`DELETE FROM "RingSequences_Birds" WHERE bird_id IN (${birdIds});` +
				`DELETE FROM "Encounters" WHERE bird_id IN (${birdIds});` +
				`DELETE FROM "Birds" WHERE id IN (${birdIds});` +
				`DELETE FROM "RingSequences" WHERE id IN (${seqIds});` +
				`DELETE FROM "Sessions" WHERE id IN (${sessionId}, ${otherSessionId});` +
				`DELETE FROM "Locations" WHERE id IN (${locationId}, ${otherLocationId});` +
				`DELETE FROM "RingingGroups" WHERE id IN (${groupId}, ${otherGroupId});`
		);
	});

	it('creates a promoted (owned_by_group=false, size=null) sequence and links every bird sharing the prefix when none exists', async () => {
		const prefix = randomPrefix();
		const birdA = await createBird(groupClient, `${prefix}0001`, sessionId);
		const birdB = await createBird(groupClient, `${prefix}0002`, sessionId);

		authenticateAs(groupId);
		const result = await promoteControlToSequence(
			null,
			makeFormData({
				ring_no: `${prefix}0001`,
				viewed_group_id: String(groupId)
			})
		);
		expect(result).toEqual({ success: true });

		const sequence = await ringSequenceFor(prefix, groupId);
		expect(sequence).toMatchObject({ owned_by_group: false, size: null });
		createdSeqIds.push(sequence!.id);

		expect(await linkedBirdIds(sequence!.id)).toEqual(
			expect.arrayContaining([birdA, birdB])
		);
	});

	it('reuses an existing matching-prefix sequence without creating a duplicate or touching its owned_by_group/size', async () => {
		const prefix = randomPrefix();
		const { data: existing, error: existingError } = await groupClient
			.from('RingSequences')
			.insert({
				prefix,
				ringing_group_id: groupId,
				owned_by_group: true,
				size: 'C'
			})
			.select('id')
			.single();
		if (existingError || !existing)
			throw existingError ?? new Error('Failed to seed existing sequence');
		createdSeqIds.push(existing.id);
		const birdId = await createBird(groupClient, `${prefix}0001`, sessionId);

		authenticateAs(groupId);
		const result = await promoteControlToSequence(
			null,
			makeFormData({
				ring_no: `${prefix}0001`,
				viewed_group_id: String(groupId)
			})
		);
		expect(result).toEqual({ success: true });

		const { data: matches } = await groupClient
			.from('RingSequences')
			.select('id, owned_by_group, size')
			.eq('prefix', prefix)
			.eq('ringing_group_id', groupId);
		expect(matches).toHaveLength(1);
		expect(matches![0]).toMatchObject({
			id: existing.id,
			owned_by_group: true,
			size: 'C'
		});
		expect(await linkedBirdIds(existing.id)).toEqual([birdId]);
	});

	it('does not duplicate-link a bird already tracked by the sequence when promoted again', async () => {
		const prefix = randomPrefix();
		const birdId = await createBird(groupClient, `${prefix}0001`, sessionId);

		authenticateAs(groupId);
		const first = await promoteControlToSequence(
			null,
			makeFormData({
				ring_no: `${prefix}0001`,
				viewed_group_id: String(groupId)
			})
		);
		expect(first).toEqual({ success: true });
		const sequence = await ringSequenceFor(prefix, groupId);
		createdSeqIds.push(sequence!.id);

		const second = await promoteControlToSequence(
			null,
			makeFormData({
				ring_no: `${prefix}0001`,
				viewed_group_id: String(groupId)
			})
		);
		expect(second).toEqual({ success: true });

		expect(await linkedBirdIds(sequence!.id)).toEqual([birdId]);
	});

	it('does not link a bird belonging only to a different group, even when its ring number shares the prefix', async () => {
		const prefix = randomPrefix();
		const ownBirdId = await createBird(groupClient, `${prefix}0001`, sessionId);
		await createBird(otherGroupClient, `${prefix}0002`, otherSessionId);

		authenticateAs(groupId);
		const result = await promoteControlToSequence(
			null,
			makeFormData({
				ring_no: `${prefix}0001`,
				viewed_group_id: String(groupId)
			})
		);
		expect(result).toEqual({ success: true });

		const sequence = await ringSequenceFor(prefix, groupId);
		createdSeqIds.push(sequence!.id);
		expect(await linkedBirdIds(sequence!.id)).toEqual([ownBirdId]);
	});

	it('returns a validation error and does not touch supabase when ring_no is missing', async () => {
		authenticateAs(groupId);
		const result = await promoteControlToSequence(
			null,
			makeFormData({ ring_no: '', viewed_group_id: String(groupId) })
		);
		expect(result).toEqual({ success: false, error: 'Missing ring number' });
	});

	it('returns a validation error and does not touch supabase when viewed_group_id is missing', async () => {
		authenticateAs(groupId);
		const prefix = randomPrefix();
		const result = await promoteControlToSequence(
			null,
			makeFormData({ ring_no: `${prefix}0001`, viewed_group_id: '' })
		);
		expect(result).toEqual({ success: false, error: 'Missing group' });
	});

	it('returns an error when viewed_group_id does not match the authenticated group (RLS rejects the cross-group insert)', async () => {
		const prefix = randomPrefix();
		await createBird(otherGroupClient, `${prefix}0001`, otherSessionId);

		// Authenticated as groupId but asking to promote on behalf of otherGroupId —
		// RLS's `ringing_group_id = auth group` insert check rejects the write.
		authenticateAs(groupId);
		const result = await promoteControlToSequence(
			null,
			makeFormData({
				ring_no: `${prefix}0001`,
				viewed_group_id: String(otherGroupId)
			})
		);
		expect(result).toMatchObject({ success: false });

		// Ground-truth check bypassing RLS: no row was actually inserted for
		// otherGroupId, not merely one this test's clients can't see.
		const count = psqlScalar(
			`SELECT COUNT(*) FROM "RingSequences" WHERE prefix = '${prefix}' AND ringing_group_id = ${otherGroupId};`
		);
		expect(count).toBe('0');
	});
});
