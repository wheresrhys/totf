/**
 * Integration tests for custom Postgres triggers on Encounters and Birds.
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
import { createUpserter } from '../../lib/demon-import';
import { randomTestSuffix } from './test-isolation';
import type { SupabaseClient } from '@supabase/supabase-js';

const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

function psql(sql: string) {
	execSync(`psql "${LOCAL_DB_URL}" -c "${sql.replace(/"/g, '\\"')}"`);
}

const BASE_ENCOUNTER = {
	capture_time: '10:00:00',
	scheme: 'BTO',
	sex: 'M',
	age_code: 1,
};

describe('Encounters — same-session retrap suppression trigger', () => {
	let groupClient: SupabaseClient;
	let locationId: number;
	let sessionId: number;
	let birdIdN: number;
	let birdIdS: number;
	let birdIdFresh: number;

	beforeAll(async () => {
		const { data: group, error: groupError } = await supabase
			.from('RingingGroups')
			.select('id')
			.eq('group_name', 'Delta')
			.single();
		if (groupError || !group) throw new Error('Delta group not found — run npm run db:seed:e2e first');
		const deltaId = group.id;

		groupClient = await getAuthenticatedSupabaseClientForGroup(deltaId);

		const { data: species, error: speciesError } = await supabase
			.from('Species')
			.select('id')
			.eq('species_name', 'Robin')
			.single();
		if (speciesError || !species) throw new Error('Robin species not found — run npm run db:seed:e2e first');
		const speciesId = species.id;

		const testSuffix = randomTestSuffix();

		const { data: loc, error: locError } = await groupClient
			.from('Locations')
			.insert({ location_name: `Trigger Test Location ${testSuffix}`, ringing_group_id: deltaId })
			.select('id')
			.single();
		if (locError) throw locError;
		locationId = loc!.id;

		const { data: sess, error: sessError } = await groupClient
			.from('Sessions')
			.insert({ visit_date: '2099-01-01', location_id: locationId })
			.select('id')
			.single();
		if (sessError) throw sessError;
		sessionId = sess!.id;

		const birds = await Promise.all(
			[`TRIG-TEST-N-${testSuffix}`, `TRIG-TEST-S-${testSuffix}`, `TRIG-TEST-FRESH-${testSuffix}`].map((ringNo) =>
				groupClient
					.from('Birds')
					.insert({ ring_no: ringNo, species_id: speciesId })
					.select('id')
					.single()
			)
		);
		const [birdN, birdS, birdFresh] = birds;
		if (birdN.error) throw birdN.error;
		if (birdS.error) throw birdS.error;
		if (birdFresh.error) throw birdFresh.error;
		birdIdN = birdN.data!.id;
		birdIdS = birdS.data!.id;
		birdIdFresh = birdFresh.data!.id;
	});

	afterAll(() => {
		psql(
			`DELETE FROM "Encounters" WHERE bird_id IN (${birdIdN}, ${birdIdS}, ${birdIdFresh});` +
			`DELETE FROM "Birds" WHERE id IN (${birdIdN}, ${birdIdS}, ${birdIdFresh});` +
			`DELETE FROM "Sessions" WHERE id = ${sessionId};` +
			`DELETE FROM "Locations" WHERE id = ${locationId};`
		);
	});

	it('preserves N record_type when upsert would change it to S', async () => {
		await groupClient.from('Encounters').insert({
			...BASE_ENCOUNTER,
			record_type: 'N',
			bird_id: birdIdN,
			session_id: sessionId,
		});

		await groupClient.from('Encounters').upsert(
			{ ...BASE_ENCOUNTER, record_type: 'S', bird_id: birdIdN, session_id: sessionId },
			{ onConflict: 'bird_id,session_id', ignoreDuplicates: false }
		);

		const { data } = await groupClient
			.from('Encounters')
			.select('record_type')
			.eq('bird_id', birdIdN)
			.eq('session_id', sessionId)
			.single();

		expect(data?.record_type).toBe('N');
	});

	it('allows S→N update (does not block fixing bad data)', async () => {
		await groupClient.from('Encounters').insert({
			...BASE_ENCOUNTER,
			record_type: 'S',
			bird_id: birdIdS,
			session_id: sessionId,
		});

		await groupClient.from('Encounters').upsert(
			{ ...BASE_ENCOUNTER, record_type: 'N', bird_id: birdIdS, session_id: sessionId },
			{ onConflict: 'bird_id,session_id', ignoreDuplicates: false }
		);

		const { data } = await groupClient
			.from('Encounters')
			.select('record_type')
			.eq('bird_id', birdIdS)
			.eq('session_id', sessionId)
			.single();

		expect(data?.record_type).toBe('N');
	});

	it('allows inserting a fresh S encounter with no prior encounter in session', async () => {
		const { error } = await groupClient.from('Encounters').insert({
			...BASE_ENCOUNTER,
			record_type: 'S',
			bird_id: birdIdFresh,
			session_id: sessionId,
		});

		expect(error).toBeNull();

		const { data } = await groupClient
			.from('Encounters')
			.select('record_type')
			.eq('bird_id', birdIdFresh)
			.eq('session_id', sessionId)
			.single();

		expect(data?.record_type).toBe('S');
	});
});

describe('Birds — species_id immutability trigger', () => {
	let groupClient: SupabaseClient;
	let speciesIdA: number;
	let speciesIdB: number;
	let testSuffix: string;

	// Every ring_no this suite writes shares this prefix + the random suffix, so the
	// afterAll cleanup can remove exactly this run's rows without colliding with a
	// concurrent worktree run against the shared local Supabase instance.
	const ringPrefix = 'SPECIES-IMMUT';

	beforeAll(async () => {
		const { data: group, error: groupError } = await supabase
			.from('RingingGroups')
			.select('id')
			.eq('group_name', 'Delta')
			.single();
		if (groupError || !group)
			throw new Error('Delta group not found — run npm run db:seed:e2e first');

		groupClient = await getAuthenticatedSupabaseClientForGroup(group.id);

		const { data: species, error: speciesError } = await supabase
			.from('Species')
			.select('id')
			.order('id', { ascending: true })
			.limit(2);
		if (speciesError || !species || species.length < 2)
			throw new Error('Need two Species rows — run npm run db:seed:e2e first');
		speciesIdA = species[0].id;
		speciesIdB = species[1].id;

		testSuffix = randomTestSuffix();
	});

	afterAll(() => {
		psql(`DELETE FROM "Birds" WHERE ring_no LIKE '${ringPrefix}-%-${testSuffix}';`);
	});

	it('rejects a direct species_id change on an existing Birds row', async () => {
		const ringNo = `${ringPrefix}-DIRECT-${testSuffix}`;
		const { data: bird, error: insertError } = await groupClient
			.from('Birds')
			.insert({ ring_no: ringNo, species_id: speciesIdA })
			.select('id')
			.single();
		if (insertError) throw insertError;

		const { error } = await groupClient
			.from('Birds')
			.update({ species_id: speciesIdB })
			.eq('id', bird!.id);

		expect(error).not.toBeNull();
		expect(error?.code).toBe('23514'); // check_violation
		expect(error?.message).toContain('immutable');

		// The row must still hold its original species — the change was rejected, not applied.
		const { data: after } = await groupClient
			.from('Birds')
			.select('species_id')
			.eq('id', bird!.id)
			.single();
		expect(after?.species_id).toBe(speciesIdA);
	});

	it('allows setting species_id to the same value it already has (only a real change is blocked)', async () => {
		const ringNo = `${ringPrefix}-SAME-${testSuffix}`;
		const { data: bird, error: insertError } = await groupClient
			.from('Birds')
			.insert({ ring_no: ringNo, species_id: speciesIdA })
			.select('id')
			.single();
		if (insertError) throw insertError;

		const { error } = await groupClient
			.from('Birds')
			.update({ species_id: speciesIdA })
			.eq('id', bird!.id);

		expect(error).toBeNull();
	});

	it('does not block creating a new Bird with a fresh ring_no', async () => {
		const ringNo = `${ringPrefix}-FRESH-${testSuffix}`;
		const { data: bird, error } = await groupClient
			.from('Birds')
			.insert({ ring_no: ringNo, species_id: speciesIdB })
			.select('id, species_id')
			.single();

		expect(error).toBeNull();
		expect(bird?.species_id).toBe(speciesIdB);
	});

	describe('import path (createUpserter on ring_no, as processEncounterRow uses)', () => {
		it('re-importing the same ring_no with the same species is a no-op update, unaffected by the trigger', async () => {
			const upsert = createUpserter(groupClient);
			const ringNo = `${ringPrefix}-REIMPORT-SAME-${testSuffix}`;

			const firstId = await upsert(
				'Birds',
				{ ring_no: ringNo, species_id: speciesIdA },
				['ring_no']
			);
			const secondId = await upsert(
				'Birds',
				{ ring_no: ringNo, species_id: speciesIdA },
				['ring_no']
			);

			expect(secondId).toBe(firstId);
		});

		it('re-importing the same ring_no with a different species no longer silently changes species_id — it errors, and species_id is preserved', async () => {
			const upsert = createUpserter(groupClient);
			const ringNo = `${ringPrefix}-REIMPORT-DIFF-${testSuffix}`;

			const birdId = await upsert(
				'Birds',
				{ ring_no: ringNo, species_id: speciesIdA },
				['ring_no']
			);

			await expect(
				upsert('Birds', { ring_no: ringNo, species_id: speciesIdB }, ['ring_no'])
			).rejects.toMatchObject({ code: '23514' });

			// The original species must survive the rejected re-import.
			const { data: after } = await groupClient
				.from('Birds')
				.select('species_id')
				.eq('id', birdId)
				.single();
			expect(after?.species_id).toBe(speciesIdA);
		});
	});
});
