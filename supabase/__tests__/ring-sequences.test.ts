/**
 * Integration tests for ring-sequence RPC functions.
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
import { randomTestSuffix, randomFutureDate } from './test-isolation';
import type { SupabaseClient } from '@supabase/supabase-js';

async function getGroupIdByName(name: string): Promise<number> {
	const { data, error } = await supabase
		.from('RingingGroups')
		.select('id')
		.eq('group_name', name)
		.single();
	if (error || !data) throw new Error(`Group "${name}" not found — run npm run db:seed:e2e first`);
	return data.id;
}

describe('ring sequence RPC functions', () => {
	let alphaId: number;
	let betaId: number;
	let alphaClient: SupabaseClient;
	let betaClient: SupabaseClient;

	beforeAll(async () => {
		alphaId = await getGroupIdByName('Alpha');
		betaId = await getGroupIdByName('Beta');

		[alphaClient, betaClient] = await Promise.all([
			getAuthenticatedSupabaseClientForGroup(alphaId),
			getAuthenticatedSupabaseClientForGroup(betaId),
		]);
	});

	// Alpha seed has 7 ring sequences (all N-type encounters):
	//   ARW (len 9): 15 Reed Warbler rings, 2022-06-15 – 2024-05-10
	//   ABT (len 8): 6 Blue Tit rings,     2022-04-30 – 2023-05-12
	//   AR0 (len 6): 21 Robin rings,        2022-04-30 – 2023-05-12
	//   AKI (len 9): 1 Kingfisher ring,     2022-04-30 – 2022-04-30
	//   SHA (len 8): 1 Robin ring,          2022-04-30 – 2022-04-30
	//   ARR (len 8): 1 Robin ring,          2021-06-20 – 2021-06-20
	//   AWR (len 8): 1 Wren ring,           2021-06-20 – 2021-06-20
	//
	// ARRETRAP has 1 N encounter + 8 S encounters; it falls in the ARR sequence.
	// AWREN001 (Wren) has 1 N (2021-06-20) + 1 S (2024-05-10); only the N counts here.
	// Beta seed has BCH (len 8): 2 Chaffinch rings, 2023-06-01 – 2023-06-01
	// Beta also has 1 S encounter for SHARED01 (Robin, originally ringed by Alpha).

	describe('ring_sequence_summaries', () => {
		it('groups birds by 3-char prefix and total ring length', async () => {
			const { data, error } = await alphaClient.rpc('ring_sequence_summaries', {
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(7);
			const prefixes = data!.map((r) => r.sequence_prefix);
			expect(prefixes).toContain('ARW');
			expect(prefixes).toContain('ABT');
			expect(prefixes).toContain('AR0');
			expect(prefixes).toContain('AWR');
		});

		it('counts only distinct ring_nos per sequence', async () => {
			const { data, error } = await alphaClient.rpc('ring_sequence_summaries', {
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			const byPrefix = Object.fromEntries(
				data!.map((r) => [r.sequence_prefix, r])
			);
			expect(Number(byPrefix['ARW'].ring_count)).toBe(15);
			expect(Number(byPrefix['ABT'].ring_count)).toBe(6);
			expect(Number(byPrefix['AR0'].ring_count)).toBe(21);
			expect(Number(byPrefix['ARR'].ring_count)).toBe(1);
		});

		it('excludes encounters where record_type is not N', async () => {
			// ARRETRAP has 1 N + 8 S encounters; only the N should be counted
			const { data, error } = await alphaClient.rpc('ring_sequence_summaries', {
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			const arrRow = data!.find((r) => r.sequence_prefix === 'ARR');
			expect(Number(arrRow!.ring_count)).toBe(1);
			// Earliest/latest date should reflect the single N encounter date (2021-06-20)
			expect(arrRow!.earliest_date).toBe('2021-06-20');
			expect(arrRow!.latest_date).toBe('2021-06-20');
		});

		it('filters by ringing_group_id when provided', async () => {
			const { data, error } = await betaClient.rpc('ring_sequence_summaries', {
				ringing_group_filter: betaId,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			expect(data![0].sequence_prefix).toBe('BCH');
			expect(Number(data![0].ring_count)).toBe(2);
		});

		it('sorts by latest_date DESC, then earliest_date DESC, then sequence_prefix ASC', async () => {
			const { data, error } = await alphaClient.rpc('ring_sequence_summaries', {
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			// ARW has latest 2024-05-10; ABT and AR0 tie on latest 2023-05-12 and earliest 2022-04-30
			// tiebreak: ABT < AR0 alphabetically
			expect(data![0].sequence_prefix).toBe('ARW');
			expect(data![1].sequence_prefix).toBe('ABT');
			expect(data![2].sequence_prefix).toBe('AR0');
			// ARR has earliest latest_date
			expect(data![5].sequence_prefix).toBe('ARR');
		});

		it('returns correct date ranges per sequence', async () => {
			const { data, error } = await alphaClient.rpc('ring_sequence_summaries', {
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			const byPrefix = Object.fromEntries(
				data!.map((r) => [r.sequence_prefix, r])
			);
			expect(byPrefix['ARW'].earliest_date).toBe('2022-06-15');
			expect(byPrefix['ARW'].latest_date).toBe('2024-05-10');
			expect(byPrefix['AR0'].earliest_date).toBe('2022-04-30');
			expect(byPrefix['AR0'].latest_date).toBe('2023-05-12');
		});

		it('returns empty array when group has no N-type encounters', async () => {
			// Gamma group has no encounters
			const gammaId = await getGroupIdByName('Gamma');
			const gammaClient = await getAuthenticatedSupabaseClientForGroup(gammaId);
			const { data, error } = await gammaClient.rpc('ring_sequence_summaries', {
				ringing_group_filter: gammaId,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});
	});

	describe('ring_sequence_detail', () => {
		it('returns ring_no, species_name, ringed_date for matching prefix and length', async () => {
			const { data, error } = await alphaClient.rpc('ring_sequence_detail', {
				sequence_prefix_filter: 'ARW',
				ring_length_filter: 9,
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(15);
			expect(data![0]).toMatchObject({
				ring_no: 'ARWRBL001',
				species_name: 'Reed Warbler',
				ringed_date: '2022-06-15',
			});
			expect(data![14]).toMatchObject({
				ring_no: 'ARWRBL015',
				ringed_date: '2024-05-10',
			});
		});

		it('excludes encounters where record_type is not N', async () => {
			// ARR prefix: only ARRETRAP, which has 1 N + 8 S encounters
			const { data, error } = await alphaClient.rpc('ring_sequence_detail', {
				sequence_prefix_filter: 'ARR',
				ring_length_filter: 8,
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			expect(data![0].ring_no).toBe('ARRETRAP');
			expect(data![0].ringed_date).toBe('2021-06-20');
		});

		it('filters by ringing_group_id', async () => {
			// Alpha has SHA sequence (SHARED01 with N record); Beta has no N records for SHA
			const { data, error } = await betaClient.rpc('ring_sequence_detail', {
				sequence_prefix_filter: 'SHA',
				ring_length_filter: 8,
				ringing_group_filter: betaId,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});

		it('does not return rings from a different prefix or length', async () => {
			const { data, error } = await alphaClient.rpc('ring_sequence_detail', {
				sequence_prefix_filter: 'ABT',
				ring_length_filter: 8,
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(6);
			expect(data!.every((r) => r.ring_no.startsWith('ABT') && r.ring_no.length === 8)).toBe(true);
		});
	});

	describe('ring_sequence_controls', () => {
		it('returns rings where every encounter for the group is record_type S', async () => {
			// Beta has SHARED01 with only 1 S encounter
			const { data, error } = await betaClient.rpc('ring_sequence_controls', {
				ringing_group_filter: betaId,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			expect(data![0]).toMatchObject({
				ring_no: 'SHARED01',
				species_name: 'Robin',
				first_date: '2023-06-01',
			});
		});

		it('excludes rings that have any N encounter for the group', async () => {
			// Alpha: all birds have at least 1 N encounter → no controls
			const { data, error } = await alphaClient.rpc('ring_sequence_controls', {
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});

		it('excludes ARRETRAP because it has an N record despite also having S records', async () => {
			// ARRETRAP has 1 N + 8 S for Alpha — should not appear in Alpha controls
			const { data, error } = await alphaClient.rpc('ring_sequence_controls', {
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			const arretrap = data!.find((r) => r.ring_no === 'ARRETRAP');
			expect(arretrap).toBeUndefined();
		});

		it('filters by ringing_group_id', async () => {
			// SHARED01 is a control for Beta but not for Alpha
			const { data: alphaData } = await alphaClient.rpc('ring_sequence_controls', {
				ringing_group_filter: alphaId,
			});
			const { data: betaData } = await betaClient.rpc('ring_sequence_controls', {
				ringing_group_filter: betaId,
			});
			expect(alphaData!.find((r) => r.ring_no === 'SHARED01')).toBeUndefined();
			expect(betaData!.find((r) => r.ring_no === 'SHARED01')).toBeDefined();
		});

		it('returns ring_no, species_name and first_date columns', async () => {
			const { data, error } = await betaClient.rpc('ring_sequence_controls', {
				ringing_group_filter: betaId,
			});
			expect(error).toBeNull();
			const row = data![0];
			expect(row).toHaveProperty('ring_no');
			expect(row).toHaveProperty('species_name');
			expect(row).toHaveProperty('first_date');
		});
	});
});

/**
 * Controls exclusion for group-tracked prefixes (issue #661).
 *
 * A ring whose leading-alpha prefix already has a `RingSequences` row for the
 * current group is no longer a "foreign" control and must not appear in
 * `ring_sequence_controls` — regardless of that row's `owned_by_group`. This
 * covers promoted-but-not-owned sequences (`owned_by_group = false`) as well as
 * fully-owned ones.
 *
 * Uses freshly-created, isolated fixtures under the Delta/Gamma seed groups with
 * random alpha prefixes (never fixed literals) so concurrent worktree runs
 * against the shared local Supabase instance never collide on `ring_no` or on
 * the `(prefix, ringing_group_id)` unique constraint.
 */
describe('ring_sequence_controls with tracked sequences', () => {
	const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
	function psql(sql: string) {
		execSync(`psql "${LOCAL_DB_URL}" -c "${sql.replace(/"/g, '\\"')}"`);
	}

	// A purely-alphabetic prefix — the RPC extracts `substring(ring_no from
	// '^[A-Za-z]+')`, so the prefix segment must contain no digits. Six random
	// letters keep concurrent runs (and the ring_no unique constraint) apart.
	function randomAlphaPrefix(): string {
		const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
		return Array.from({ length: 6 }, () => letters[Math.floor(Math.random() * 26)]).join('');
	}

	let deltaId: number;
	let gammaId: number;
	let deltaClient: SupabaseClient;
	let gammaClient: SupabaseClient;
	let robinId: number;
	let deltaLocationId: number;
	let deltaSessionId: number;

	const createdBirdIds: number[] = [];
	const createdSeqIds: number[] = [];

	// Create a control bird under Delta: a single `record_type = 'S'` encounter,
	// so `ring_sequence_controls` counts it as a control (every encounter is S).
	// Returns its ring number and leading-alpha prefix.
	async function createDeltaControl(): Promise<{ ringNo: string; prefix: string }> {
		const prefix = randomAlphaPrefix();
		const ringNo = `${prefix}0001`;
		const { data: bird, error: birdError } = await deltaClient
			.from('Birds')
			.insert({ ring_no: ringNo, species_id: robinId })
			.select('id')
			.single();
		if (birdError) throw birdError;
		createdBirdIds.push(bird!.id);

		const { error: encounterError } = await deltaClient.from('Encounters').insert({
			capture_time: '10:00:00',
			record_type: 'S',
			scheme: 'BTO',
			sex: 'M',
			age_code: 4,
			session_id: deltaSessionId,
			bird_id: bird!.id,
		});
		if (encounterError) throw encounterError;

		return { ringNo, prefix };
	}

	// Insert a RingSequences row for the given group/prefix, tracking it for cleanup.
	async function insertRingSequence(
		client: SupabaseClient,
		groupId: number,
		prefix: string,
		ownedByGroup: boolean
	): Promise<void> {
		const { data, error } = await client
			.from('RingSequences')
			.insert({ prefix, ringing_group_id: groupId, owned_by_group: ownedByGroup })
			.select('id')
			.single();
		if (error) throw error;
		createdSeqIds.push(data!.id);
	}

	async function deltaControls() {
		const { data, error } = await deltaClient.rpc('ring_sequence_controls', {
			ringing_group_filter: deltaId,
		});
		expect(error).toBeNull();
		return data!;
	}

	beforeAll(async () => {
		deltaId = await getGroupIdByName('Delta');
		gammaId = await getGroupIdByName('Gamma');
		[deltaClient, gammaClient] = await Promise.all([
			getAuthenticatedSupabaseClientForGroup(deltaId),
			getAuthenticatedSupabaseClientForGroup(gammaId),
		]);

		const { data: robin, error: robinError } = await supabase
			.from('Species')
			.select('id')
			.eq('species_name', 'Robin')
			.single();
		if (robinError || !robin) throw new Error('Robin species not found — run npm run db:seed:e2e first');
		robinId = robin.id;

		const suffix = randomTestSuffix();
		const { data: location, error: locationError } = await deltaClient
			.from('Locations')
			.insert({ location_name: `Controls Test Location ${suffix}`, ringing_group_id: deltaId })
			.select('id')
			.single();
		if (locationError) throw locationError;
		deltaLocationId = location!.id;

		const { data: session, error: sessionError } = await deltaClient
			.from('Sessions')
			.insert({ visit_date: randomFutureDate(), location_id: deltaLocationId })
			.select('id')
			.single();
		if (sessionError) throw sessionError;
		deltaSessionId = session!.id;
	});

	afterAll(() => {
		const birdIds = createdBirdIds.length ? createdBirdIds.join(', ') : '-1';
		const seqIds = createdSeqIds.length ? createdSeqIds.join(', ') : '-1';
		psql(
			`DELETE FROM "Encounters" WHERE bird_id IN (${birdIds});` +
				`DELETE FROM "Birds" WHERE id IN (${birdIds});` +
				`DELETE FROM "RingSequences" WHERE id IN (${seqIds});` +
				`DELETE FROM "Sessions" WHERE id = ${deltaSessionId};` +
				`DELETE FROM "Locations" WHERE id = ${deltaLocationId};`
		);
	});

	// Usual
	it('a genuine control with no matching RingSequences row still appears', async () => {
		const { ringNo } = await createDeltaControl();
		const controls = await deltaControls();
		expect(controls.find((r) => r.ring_no === ringNo)).toBeDefined();
	});

	// Structure — owned_by_group = true excludes
	it('excludes a control whose prefix has an owned_by_group = true RingSequences row for the group', async () => {
		const { ringNo, prefix } = await createDeltaControl();
		expect((await deltaControls()).find((r) => r.ring_no === ringNo)).toBeDefined();

		await insertRingSequence(deltaClient, deltaId, prefix, true);
		expect((await deltaControls()).find((r) => r.ring_no === ringNo)).toBeUndefined();
	});

	// Structure — owned_by_group = false also excludes (promoted-but-not-owned)
	it('excludes a control whose prefix has an owned_by_group = false RingSequences row for the group', async () => {
		const { ringNo, prefix } = await createDeltaControl();
		expect((await deltaControls()).find((r) => r.ring_no === ringNo)).toBeDefined();

		await insertRingSequence(deltaClient, deltaId, prefix, false);
		expect((await deltaControls()).find((r) => r.ring_no === ringNo)).toBeUndefined();
	});

	// Edge — cross-group isolation
	it('a RingSequences row for a different group with the same prefix does not exclude this group\'s control', async () => {
		const { ringNo, prefix } = await createDeltaControl();

		// Gamma tracks the same prefix text — must not affect Delta's controls.
		await insertRingSequence(gammaClient, gammaId, prefix, true);
		expect((await deltaControls()).find((r) => r.ring_no === ringNo)).toBeDefined();
	});
});
