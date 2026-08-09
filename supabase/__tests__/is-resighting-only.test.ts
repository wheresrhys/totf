/**
 * Integration tests for the Sessions.is_resighting_only identity column (#428).
 *
 * Covers the new (visit_date, location_id, is_resighting_only) unique constraint,
 * ringing_group_id derivation on hand-inserted resighting-only rows, and the one-off
 * backfill data-migration logic that splits mixed Sessions and flips pure-resighting ones.
 *
 * Requires local Supabase running and e2e seed data loaded:
 *   npm run db:start:local
 *   npm run db:seed:e2e
 *
 * Run with: npm run test:integration
 *
 * All rows created here use a run-unique suffix so concurrent worktree runs against the
 * shared local Supabase instance never collide.
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { execSync } from 'child_process';
import { getAuthenticatedSupabaseClientForGroup } from '../../lib/group-auth';
import { supabase } from '../../lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

function psql(sql: string) {
	execSync(`psql "${LOCAL_DB_URL}" -c "${sql.replace(/"/g, '\\"')}"`);
}

function psqlScalar(sql: string): string {
	// psql prints the RETURNING value followed by the command tag (e.g. "INSERT 0 1"),
	// so take the first non-empty line only.
	return execSync(`psql "${LOCAL_DB_URL}" -t -A -c "${sql.replace(/"/g, '\\"')}"`)
		.toString()
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)[0];
}

const BASE_ENCOUNTER = {
	capture_time: '10:00:00',
	scheme: 'BTO',
	sex: 'M',
	age_code: 1
};

async function getRobinSpeciesId(): Promise<number> {
	const { data, error } = await supabase
		.from('Species')
		.select('id')
		.eq('species_name', 'Robin')
		.single();
	if (error || !data)
		throw new Error('Robin species not found — run npm run db:seed:e2e first');
	return data.id;
}

function createIsolatedGroupAndLocation(suffix: string): {
	groupId: number;
	locationId: number;
} {
	const groupId = Number(
		psqlScalar(
			`INSERT INTO "RingingGroups" (group_name) VALUES ('is-resighting-${suffix}') RETURNING id;`
		)
	);
	const locationId = Number(
		psqlScalar(
			`INSERT INTO "Locations" (location_name, ringing_group_id) VALUES ('is-resighting-loc-${suffix}', ${groupId}) RETURNING id;`
		)
	);
	return { groupId, locationId };
}

function cleanupGroup(groupId: number, locationId: number) {
	psql(
		`DELETE FROM "Encounters" WHERE session_id IN (SELECT id FROM "Sessions" WHERE location_id = ${locationId});` +
			`DELETE FROM "Sessions" WHERE location_id = ${locationId};` +
			`DELETE FROM "Birds" WHERE ${groupId} = ANY(ringing_group_ids);` +
			`DELETE FROM "Locations" WHERE id = ${locationId};` +
			`DELETE FROM "RingingGroups" WHERE id = ${groupId};`
	);
}

describe('Sessions — is_resighting_only identity', () => {
	const suffix = `identity-${process.pid}-${Date.now()}`;
	let groupId: number;
	let locationId: number;
	let groupClient: SupabaseClient;

	beforeAll(async () => {
		({ groupId, locationId } = createIsolatedGroupAndLocation(suffix));
		groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
	});

	afterAll(() => cleanupGroup(groupId, locationId));

	it('allows two Sessions with the same visit_date/location when is_resighting_only differs, and rejects a duplicate triple', async () => {
		const visitDate = '2099-03-01';

		const realCatch = await groupClient
			.from('Sessions')
			.insert({ visit_date: visitDate, location_id: locationId, is_resighting_only: false });
		expect(realCatch.error).toBeNull();

		const resighting = await groupClient
			.from('Sessions')
			.insert({ visit_date: visitDate, location_id: locationId, is_resighting_only: true });
		expect(resighting.error).toBeNull();

		const duplicate = await groupClient
			.from('Sessions')
			.insert({ visit_date: visitDate, location_id: locationId, is_resighting_only: false });
		expect(duplicate.error?.code).toBe('23505');
	});

	it('derives ringing_group_id for a hand-inserted resighting-only Sessions row', async () => {
		const { data, error } = await groupClient
			.from('Sessions')
			.insert({ visit_date: '2099-03-02', location_id: locationId, is_resighting_only: true })
			.select('ringing_group_id')
			.single();
		expect(error).toBeNull();
		expect(data?.ringing_group_id).toBe(groupId);
	});
});

describe('is_resighting_only backfill migration', () => {
	// Mirrors the two DML statements hand-appended to the #428 migration, scoped by
	// location_id so it only touches this test's isolated fixtures.
	function runBackfillScopedToLocation(loc: number) {
		psql(
			`WITH mixed_sessions AS (
				SELECT s.id AS old_session_id, s.visit_date, s.location_id
				FROM "Sessions" s
				WHERE s.location_id = ${loc}
					AND EXISTS (SELECT 1 FROM "Encounters" e WHERE e.session_id = s.id AND e.record_type IN ('N','S'))
					AND EXISTS (SELECT 1 FROM "Encounters" e WHERE e.session_id = s.id AND e.record_type NOT IN ('N','S'))
			), inserted_twins AS (
				INSERT INTO "Sessions" (visit_date, location_id, is_resighting_only)
				SELECT visit_date, location_id, TRUE FROM mixed_sessions
				RETURNING id AS new_session_id, visit_date, location_id
			)
			UPDATE "Encounters" e
			SET session_id = t.new_session_id
			FROM mixed_sessions m
			JOIN inserted_twins t ON t.visit_date = m.visit_date AND t.location_id = m.location_id
			WHERE e.session_id = m.old_session_id AND e.record_type NOT IN ('N','S');`
		);
		psql(
			`UPDATE "Sessions" s SET is_resighting_only = TRUE
			WHERE s.location_id = ${loc}
				AND s.is_resighting_only = FALSE
				AND EXISTS (SELECT 1 FROM "Encounters" e WHERE e.session_id = s.id)
				AND NOT EXISTS (SELECT 1 FROM "Encounters" e WHERE e.session_id = s.id AND e.record_type IN ('N','S'));`
		);
	}

	const suffix = `backfill-${process.pid}-${Date.now()}`;
	let groupId: number;
	let locationId: number;
	let groupClient: SupabaseClient;
	let speciesId: number;

	// Fixtures, all inserted with the default is_resighting_only = FALSE (pre-migration state).
	let mixedSessionId: number;
	let pureResightSessionId: number;
	let allNSessionId: number;
	let emptySessionId: number;

	async function insertBird(ringNo: string): Promise<number> {
		const { data, error } = await groupClient
			.from('Birds')
			.insert({ ring_no: ringNo, species_id: speciesId })
			.select('id')
			.single();
		if (error) throw error;
		return data!.id;
	}

	async function insertSession(visitDate: string): Promise<number> {
		const { data, error } = await groupClient
			.from('Sessions')
			.insert({ visit_date: visitDate, location_id: locationId })
			.select('id')
			.single();
		if (error) throw error;
		return data!.id;
	}

	async function insertEncounter(
		birdId: number,
		sessionId: number,
		recordType: string
	) {
		const { error } = await groupClient.from('Encounters').insert({
			...BASE_ENCOUNTER,
			record_type: recordType,
			bird_id: birdId,
			session_id: sessionId
		});
		if (error) throw error;
	}

	beforeAll(async () => {
		({ groupId, locationId } = createIsolatedGroupAndLocation(suffix));
		groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
		speciesId = await getRobinSpeciesId();

		mixedSessionId = await insertSession('2099-04-01');
		pureResightSessionId = await insertSession('2099-04-02');
		allNSessionId = await insertSession('2099-04-03');
		emptySessionId = await insertSession('2099-04-04');

		const [birdN, birdC, birdF, birdAllN] = await Promise.all([
			insertBird(`RSN-${suffix}`),
			insertBird(`RSC-${suffix}`),
			insertBird(`RSF-${suffix}`),
			insertBird(`RSA-${suffix}`)
		]);

		// mixed: one real (N) + one resighting (C) encounter on the same day/site
		await insertEncounter(birdN, mixedSessionId, 'N');
		await insertEncounter(birdC, mixedSessionId, 'C');
		// pure resighting: only a non-N/S (F) encounter
		await insertEncounter(birdF, pureResightSessionId, 'F');
		// all real: only an N encounter
		await insertEncounter(birdAllN, allNSessionId, 'N');
		// emptySession deliberately has no encounters

		runBackfillScopedToLocation(locationId);
	});

	afterAll(() => cleanupGroup(groupId, locationId));

	it('splits a mixed session into two rows, repointing the non-N/S encounters onto a new resighting-only row', async () => {
		const { data: original } = await groupClient
			.from('Sessions')
			.select('is_resighting_only')
			.eq('id', mixedSessionId)
			.single();
		expect(original?.is_resighting_only).toBe(false);

		const { data: rows } = await groupClient
			.from('Sessions')
			.select('id, is_resighting_only')
			.eq('location_id', locationId)
			.eq('visit_date', '2099-04-01');
		expect(rows).toHaveLength(2);
		const twin = rows!.find((r) => r.is_resighting_only);
		expect(twin).toBeDefined();

		// original keeps the N encounter, twin holds the C encounter
		const { data: originalEncounters } = await groupClient
			.from('Encounters')
			.select('record_type')
			.eq('session_id', mixedSessionId);
		expect(originalEncounters?.map((e) => e.record_type)).toEqual(['N']);

		const { data: twinEncounters } = await groupClient
			.from('Encounters')
			.select('record_type')
			.eq('session_id', twin!.id);
		expect(twinEncounters?.map((e) => e.record_type)).toEqual(['C']);
	});

	it('flips an already-pure resighting-only session in place without creating a new row', async () => {
		const { data: rows } = await groupClient
			.from('Sessions')
			.select('id, is_resighting_only')
			.eq('location_id', locationId)
			.eq('visit_date', '2099-04-02');
		expect(rows).toHaveLength(1);
		expect(rows![0].id).toBe(pureResightSessionId);
		expect(rows![0].is_resighting_only).toBe(true);
	});

	it('leaves an all-N session at is_resighting_only = FALSE', async () => {
		const { data } = await groupClient
			.from('Sessions')
			.select('is_resighting_only')
			.eq('id', allNSessionId)
			.single();
		expect(data?.is_resighting_only).toBe(false);
	});

	it('leaves a zero-encounter session at is_resighting_only = FALSE', async () => {
		const { data } = await groupClient
			.from('Sessions')
			.select('is_resighting_only')
			.eq('id', emptySessionId)
			.single();
		expect(data?.is_resighting_only).toBe(false);
	});
});
