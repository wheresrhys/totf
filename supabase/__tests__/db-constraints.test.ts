/**
 * DB integration tests for uniqueness constraints across tables, independent of any
 * application code path (#467).
 *
 * PR #466 originally included a "raw duplicate insert rejected with 23505" test in
 * each uniqueness describe block of demon-import.test.ts — bypassing demon-import.ts's
 * upsert logic and inserting directly via `.insert()` to assert the underlying
 * Postgres unique constraint itself rejects a literal duplicate. Review feedback
 * flagged that as scope creep for a suite meant to exercise demon-import.ts's upsert
 * behaviour, not the schema's constraints directly, so those tests live here instead —
 * this suite never imports demon-import.ts and asserts the constraints directly
 * against each table's schema (see supabase/schema/schemas/public/tables/).
 *
 * Requires local Supabase running and e2e seed data loaded:
 *   npm run db:start:local
 *   npm run db:seed:e2e
 *
 * Run with: npm run test:integration
 *
 * All rows created here use a run-unique suffix and/or a random future date so
 * concurrent worktree runs against the shared local Supabase instance never collide
 * (see CLAUDE.md's "DB integration tests" section and
 * supabase/__tests__/test-isolation.ts).
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { execSync } from 'child_process';
import { getAuthenticatedSupabaseClientForGroup } from '../../lib/group-auth';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomTestSuffix, randomFutureDate } from './test-isolation';

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
			`INSERT INTO "RingingGroups" (group_name) VALUES ('${name}') RETURNING id;`
		)
	);
}

describe('DB constraints — Species uniqueness (species_name)', () => {
	const suffix = randomTestSuffix();
	let groupId: number;
	let groupClient: SupabaseClient;

	beforeAll(async () => {
		groupId = createIsolatedGroup(`db-constraints-${suffix}-species`);
		groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
	});

	afterAll(() => {
		psql(
			`DELETE FROM "Species" WHERE species_name LIKE 'DbConstraintsSpecies-${suffix}-%';` +
				`DELETE FROM "RingingGroups" WHERE id = ${groupId};`
		);
	});

	it('allows inserting a Species row with a unique species_name', async () => {
		const { error } = await groupClient
			.from('Species')
			.insert({ species_name: `DbConstraintsSpecies-${suffix}-unique` });
		expect(error).toBeNull();
	});

	it('rejects a raw duplicate species_name insert with a unique-violation error', async () => {
		const speciesName = `DbConstraintsSpecies-${suffix}-dup`;
		const first = await groupClient
			.from('Species')
			.insert({ species_name: speciesName });
		expect(first.error).toBeNull();

		const duplicate = await groupClient
			.from('Species')
			.insert({ species_name: speciesName });
		expect(duplicate.error?.code).toBe('23505');
	});
});

describe('DB constraints — Birds uniqueness (ring_no)', () => {
	const suffix = randomTestSuffix();
	let groupId: number;
	let groupClient: SupabaseClient;
	let speciesId: number;

	beforeAll(async () => {
		groupId = createIsolatedGroup(`db-constraints-${suffix}-birds`);
		groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
		speciesId = Number(
			psqlScalar(
				`INSERT INTO "Species" (species_name) VALUES ('DbConstraintsSpecies-${suffix}-birds') RETURNING id;`
			)
		);
	});

	afterAll(() => {
		psql(
			`DELETE FROM "Birds" WHERE ring_no LIKE 'DB-CONSTRAINTS-TEST-${suffix}-%';` +
				`DELETE FROM "Species" WHERE id = ${speciesId};` +
				`DELETE FROM "RingingGroups" WHERE id = ${groupId};`
		);
	});

	it('allows inserting a Birds row with a unique ring_no', async () => {
		const { error } = await groupClient.from('Birds').insert({
			ring_no: `DB-CONSTRAINTS-TEST-${suffix}-unique`,
			species_id: speciesId
		});
		expect(error).toBeNull();
	});

	it('rejects a raw duplicate ring_no insert with a unique-violation error', async () => {
		const ringNo = `DB-CONSTRAINTS-TEST-${suffix}-dup`;
		const first = await groupClient
			.from('Birds')
			.insert({ ring_no: ringNo, species_id: speciesId });
		expect(first.error).toBeNull();

		const duplicate = await groupClient
			.from('Birds')
			.insert({ ring_no: ringNo, species_id: speciesId });
		expect(duplicate.error?.code).toBe('23505');
	});
});

describe('DB constraints — Locations uniqueness (location_name, ringing_group_id)', () => {
	const suffix = randomTestSuffix();
	let groupId: number;
	let groupClient: SupabaseClient;

	beforeAll(async () => {
		groupId = createIsolatedGroup(`db-constraints-${suffix}-locations`);
		groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
	});

	afterAll(() => {
		psql(
			`DELETE FROM "Locations" WHERE ringing_group_id = ${groupId};` +
				`DELETE FROM "RingingGroups" WHERE id = ${groupId};`
		);
	});

	it('allows inserting a Locations row with a unique (location_name, ringing_group_id) pair', async () => {
		const { error } = await groupClient.from('Locations').insert({
			location_name: `DbConstraintsLoc-${suffix}-unique`,
			ringing_group_id: groupId
		});
		expect(error).toBeNull();
	});

	it('rejects a raw duplicate (location_name, ringing_group_id) insert with a unique-violation error', async () => {
		const locationName = `DbConstraintsLoc-${suffix}-dup`;
		const first = await groupClient.from('Locations').insert({
			location_name: locationName,
			ringing_group_id: groupId
		});
		expect(first.error).toBeNull();

		const duplicate = await groupClient.from('Locations').insert({
			location_name: locationName,
			ringing_group_id: groupId
		});
		expect(duplicate.error?.code).toBe('23505');
	});
});

describe('DB constraints — Sessions uniqueness (visit_date, location_id, session_type)', () => {
	const suffix = randomTestSuffix();
	let groupId: number;
	let groupClient: SupabaseClient;
	let locationId: number;

	beforeAll(async () => {
		groupId = createIsolatedGroup(`db-constraints-${suffix}-sessions`);
		groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
		locationId = Number(
			psqlScalar(
				`INSERT INTO "Locations" (location_name, ringing_group_id) VALUES ('DbConstraintsLoc-${suffix}-sessions', ${groupId}) RETURNING id;`
			)
		);
	});

	afterAll(() => {
		psql(
			`DELETE FROM "Sessions" WHERE location_id = ${locationId};` +
				`DELETE FROM "Locations" WHERE id = ${locationId};` +
				`DELETE FROM "RingingGroups" WHERE id = ${groupId};`
		);
	});

	it('allows inserting a Sessions row with a unique (visit_date, location_id, session_type) triple', async () => {
		const { error } = await groupClient.from('Sessions').insert({
			visit_date: randomFutureDate(),
			location_id: locationId,
			session_type: 'FULL_GROWN'
		});
		expect(error).toBeNull();
	});

	it('rejects a raw duplicate (visit_date, location_id, session_type) insert with a unique-violation error', async () => {
		const visitDate = randomFutureDate();
		const first = await groupClient.from('Sessions').insert({
			visit_date: visitDate,
			location_id: locationId,
			session_type: 'FULL_GROWN'
		});
		expect(first.error).toBeNull();

		const duplicate = await groupClient.from('Sessions').insert({
			visit_date: visitDate,
			location_id: locationId,
			session_type: 'FULL_GROWN'
		});
		expect(duplicate.error?.code).toBe('23505');
	});
});

describe('DB constraints — Encounters uniqueness (bird_id, session_id)', () => {
	const suffix = randomTestSuffix();
	let groupId: number;
	let groupClient: SupabaseClient;
	let locationId: number;
	const speciesIds: number[] = [];
	const birdIds: number[] = [];
	const sessionIds: number[] = [];

	beforeAll(async () => {
		groupId = createIsolatedGroup(`db-constraints-${suffix}-encounters`);
		groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
		locationId = Number(
			psqlScalar(
				`INSERT INTO "Locations" (location_name, ringing_group_id) VALUES ('DbConstraintsLoc-${suffix}-encounters', ${groupId}) RETURNING id;`
			)
		);
	});

	afterAll(() => {
		// Delete explicitly by id (rather than matching Birds on ringing_group_id
		// membership) because deleting an Encounters row fires a trigger that removes
		// the group id from its bird's ringing_group_ids array — matching on that array
		// after the Encounters delete would miss rows it should also clean up.
		psql(
			`DELETE FROM "Encounters" WHERE session_id = ANY(ARRAY[${sessionIds.join(',') || 'NULL'}]::bigint[]);` +
				`DELETE FROM "Sessions" WHERE id = ANY(ARRAY[${sessionIds.join(',') || 'NULL'}]::bigint[]);` +
				`DELETE FROM "Birds" WHERE id = ANY(ARRAY[${birdIds.join(',') || 'NULL'}]::bigint[]);` +
				`DELETE FROM "Species" WHERE id = ANY(ARRAY[${speciesIds.join(',') || 'NULL'}]::bigint[]);` +
				`DELETE FROM "Locations" WHERE id = ${locationId};` +
				`DELETE FROM "RingingGroups" WHERE id = ${groupId};`
		);
	});

	function createBirdAndSession(label: string): {
		birdId: number;
		sessionId: number;
	} {
		const speciesId = Number(
			psqlScalar(
				`INSERT INTO "Species" (species_name) VALUES ('DbConstraintsSpecies-${suffix}-${label}') RETURNING id;`
			)
		);
		speciesIds.push(speciesId);
		const birdId = Number(
			psqlScalar(
				`INSERT INTO "Birds" (ring_no, species_id) VALUES ('DB-CONSTRAINTS-TEST-${suffix}-${label}', ${speciesId}) RETURNING id;`
			)
		);
		birdIds.push(birdId);
		const sessionId = Number(
			psqlScalar(
				`INSERT INTO "Sessions" (visit_date, location_id) VALUES ('${randomFutureDate()}', ${locationId}) RETURNING id;`
			)
		);
		sessionIds.push(sessionId);
		return { birdId, sessionId };
	}

	it('allows inserting an Encounters row with a unique (bird_id, session_id) pair', async () => {
		const { birdId, sessionId } = createBirdAndSession('unique');

		const { error } = await groupClient.from('Encounters').insert({
			bird_id: birdId,
			session_id: sessionId,
			capture_time: '09:00:00',
			record_type: 'N',
			scheme: 'BTO',
			sex: 'M',
			age_code: 5
		});
		expect(error).toBeNull();
	});

	it('rejects a raw duplicate (bird_id, session_id) insert with a unique-violation error', async () => {
		const { birdId, sessionId } = createBirdAndSession('dup');

		const first = await groupClient.from('Encounters').insert({
			bird_id: birdId,
			session_id: sessionId,
			capture_time: '09:00:00',
			record_type: 'N',
			scheme: 'BTO',
			sex: 'M',
			age_code: 5
		});
		expect(first.error).toBeNull();

		const duplicate = await groupClient.from('Encounters').insert({
			bird_id: birdId,
			session_id: sessionId,
			capture_time: '10:00:00',
			record_type: 'N',
			scheme: 'BTO',
			sex: 'M',
			age_code: 5
		});
		expect(duplicate.error?.code).toBe('23505');
	});
});
