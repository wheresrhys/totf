/**
 * Integration tests for lib/demon-import.ts against the real Postgres schema (#464).
 *
 * demon-import.ts leans entirely on the DB's unique constraints to decide whether a
 * given upsert reuses an existing row or creates a new one (see `createUpserter`'s
 * `uniqueColumns` argument, matched against each table's `ON CONFLICT` target). These
 * tests exercise `createUpserter` + `processEncounterRow` against the real schema so a
 * change to a table's unique constraints (or a mismatch between demon-import.ts and the
 * schema) fails loudly here rather than being caught only at import time in production.
 * The existing unit tests in lib/__tests__/demon-import.test.ts mock the Supabase client
 * entirely, so none of this DB-level behaviour is covered there.
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
import {
	createUpserter,
	processEncounterRow,
	type DemonRow
} from '../../lib/demon-import';
import { randomTestSuffix, randomFutureDate, addDays } from './test-isolation';
import type { SupabaseClient } from '@supabase/supabase-js';

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

function psqlCount(sql: string): number {
	return Number(psqlScalar(sql));
}

/** Converts an ISO `YYYY-MM-DD` date into the DD/MM/YYYY format demon-import.ts expects. */
function toDemonDate(isoDate: string): string {
	return isoDate.split('-').reverse().join('/');
}

function createIsolatedGroup(name: string): number {
	return Number(
		psqlScalar(
			`INSERT INTO "RingingGroups" (group_name) VALUES ('${name}') RETURNING id;`
		)
	);
}

/** Builds a full DemonRow (all DemonColumnNames keys), overriding only what a test cares about. */
function makeRow(overrides: Partial<DemonRow> = {}): DemonRow {
	return {
		entered_by: '',
		nest_link_code: '',
		validation_comments: '',
		submission_status: '',
		filename: '',
		record_type: 'N',
		'new/subsequent': '',
		ring_no: 'DEMON-TEST-DEFAULT',
		scheme: 'BTO',
		scheme2: '',
		ring_no2: '',
		species_name: 'DemonImportTestSpecies',
		age: '5',
		pulli_ringed: '',
		pulli_alive: '',
		sex: 'M',
		sexing_method: 'P',
		provisional_sex: '',
		breeding_condition: '',
		visit_date: toDemonDate(randomFutureDate()),
		capture_time: '08:30',
		loc_id: 'DemonImportTestLocation',
		gridref: '',
		habitat_1: '',
		habitat_2: '',
		status_code_1: '',
		status_code_2: '',
		lure_code_1: '',
		lure_code_2: '',
		wing_length: '65',
		weight: '10.5',
		date_measured: '',
		time_w: '',
		condition: '',
		moult_code: '',
		alula: '',
		old_greater_coverts: '',
		primary_moult: '',
		primary_covert_moult_scores: '',
		secondary_moult_scores: '',
		finding_condition: '',
		finding_circumstances: '',
		capture_method: '',
		metal_mark_info: '',
		ringer_initials: '',
		ringer_check_initials: '',
		processor_initials: '',
		extractor_initials: '',
		wing_initials: '',
		colour_mark_info: '',
		metal_mark_position: '',
		fat: '',
		pectoral_muscle: '',
		body_moult: '',
		greater_covert_moult_scores: '',
		alula_moult_scores: '',
		carpal_covert_moult: '',
		wing_point: '',
		primary_length: '',
		bill_length_method: '',
		bill_length: '',
		head_bill_length: '',
		bill_depth_method: '',
		bill_depth: '',
		tarsus_length_method: '',
		tail_moult_scores: '',
		tarsus_length: '',
		tail_length: '',
		claw_length: '',
		plumage: '',
		tail_diff: '',
		lesser_median_covert_moult: '',
		underwing_covert_moult: '',
		head_moult: '',
		upperparts_moult: '',
		underparts_moult: '',
		permit_no: '',
		pullus_stage: '',
		extra_text: '',
		date_accuracy: '',
		left_leg_below: '',
		right_leg_below: '',
		left_leg_above: '',
		right_leg_above: '',
		neck_collar: '',
		left_wing_tag: '',
		right_wing_tag: '',
		nasal_saddle: '',
		sample_processed: '',
		high_tide_time: '',
		finder_name: '',
		own: '',
		own2: '',
		userc1: '',
		userc2: '',
		email: '',
		userc3: '',
		userc4: '',
		userc5: '',
		userv1: '',
		userv2: '',
		userv3: '',
		userv4: '',
		userv5: '',
		l_primary_moult_scores: '',
		l_secondary_moult_scores: '',
		l_tail_moult_scores: '',
		l_primary_covert_moult_scores: '',
		l_greater_covert_moult_scores: '',
		l_carpal_covert_moult: '',
		l_alula_moult_scores: '',
		toe_span: '',
		...overrides
	};
}

const suffix = randomTestSuffix();

/** Deletes every row this file could have created, identified by the shared suffix. */
function cleanupAll() {
	psql(
		`DELETE FROM "Encounters" WHERE bird_id IN (SELECT id FROM "Birds" WHERE ring_no LIKE 'DEMON-TEST-${suffix}-%');` +
			`DELETE FROM "Sessions" WHERE location_id IN (SELECT id FROM "Locations" WHERE location_name LIKE 'DemonImportLoc-${suffix}-%');` +
			`DELETE FROM "Birds" WHERE ring_no LIKE 'DEMON-TEST-${suffix}-%';` +
			`DELETE FROM "Locations" WHERE location_name LIKE 'DemonImportLoc-${suffix}-%';` +
			`DELETE FROM "Species" WHERE species_name LIKE 'DemonImportSpecies-${suffix}-%';` +
			`DELETE FROM "RingingGroups" WHERE group_name LIKE 'demon-import-${suffix}-%';`
	);
}

afterAll(() => cleanupAll());

describe('demon-import — multi-record import (usual case)', () => {
	let groupId: number;
	let groupClient: SupabaseClient;

	beforeAll(async () => {
		groupId = createIsolatedGroup(`demon-import-${suffix}-multi`);
		groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
	});

	it('writes independent Species/Birds/Locations/Sessions/Encounters rows for multiple distinct CSV rows', async () => {
		const upsert = createUpserter(groupClient);
		const rows = [1, 2, 3].map((n) =>
			makeRow({
				ring_no: `DEMON-TEST-${suffix}-multi-${n}`,
				species_name: `DemonImportSpecies-${suffix}-multi-${n}`,
				loc_id: `DemonImportLoc-${suffix}-multi-${n}`,
				visit_date: toDemonDate(addDays(randomFutureDate(), n))
			})
		);

		for (const row of rows) {
			await processEncounterRow(row, upsert, groupId);
		}

		const encounterCount = psqlCount(
			`SELECT COUNT(*) FROM "Encounters" e JOIN "Birds" b ON b.id = e.bird_id WHERE b.ring_no LIKE 'DEMON-TEST-${suffix}-multi-%';`
		);
		expect(encounterCount).toBe(3);

		const birdCount = psqlCount(
			`SELECT COUNT(*) FROM "Birds" WHERE ring_no LIKE 'DEMON-TEST-${suffix}-multi-%';`
		);
		expect(birdCount).toBe(3);

		const locationCount = psqlCount(
			`SELECT COUNT(*) FROM "Locations" WHERE location_name LIKE 'DemonImportLoc-${suffix}-multi-%';`
		);
		expect(locationCount).toBe(3);
	});

	it('re-importing the same CSV rows a second time does not create duplicate rows', async () => {
		const upsert = createUpserter(groupClient);
		const row = makeRow({
			ring_no: `DEMON-TEST-${suffix}-repeat`,
			species_name: `DemonImportSpecies-${suffix}-repeat`,
			loc_id: `DemonImportLoc-${suffix}-repeat`,
			visit_date: toDemonDate(randomFutureDate())
		});

		await processEncounterRow(row, upsert, groupId);
		await processEncounterRow(row, upsert, groupId);

		expect(
			psqlCount(
				`SELECT COUNT(*) FROM "Species" WHERE species_name = 'DemonImportSpecies-${suffix}-repeat';`
			)
		).toBe(1);
		expect(
			psqlCount(
				`SELECT COUNT(*) FROM "Birds" WHERE ring_no = 'DEMON-TEST-${suffix}-repeat';`
			)
		).toBe(1);
		expect(
			psqlCount(
				`SELECT COUNT(*) FROM "Locations" WHERE location_name = 'DemonImportLoc-${suffix}-repeat';`
			)
		).toBe(1);
		expect(
			psqlCount(
				`SELECT COUNT(*) FROM "Encounters" e JOIN "Birds" b ON b.id = e.bird_id WHERE b.ring_no = 'DEMON-TEST-${suffix}-repeat';`
			)
		).toBe(1);
	});
});

describe('demon-import — Species uniqueness (species_name)', () => {
	let groupId: number;
	let groupClient: SupabaseClient;

	beforeAll(async () => {
		groupId = createIsolatedGroup(`demon-import-${suffix}-species`);
		groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
	});

	it('upserting two rows with the same species_name resolves to the same Species row', async () => {
		const upsert = createUpserter(groupClient);
		const speciesName = `DemonImportSpecies-${suffix}-shared`;

		await processEncounterRow(
			makeRow({
				ring_no: `DEMON-TEST-${suffix}-species-a`,
				species_name: speciesName,
				loc_id: `DemonImportLoc-${suffix}-species`
			}),
			upsert,
			groupId
		);
		await processEncounterRow(
			makeRow({
				ring_no: `DEMON-TEST-${suffix}-species-b`,
				species_name: speciesName,
				loc_id: `DemonImportLoc-${suffix}-species`
			}),
			upsert,
			groupId
		);

		expect(
			psqlCount(`SELECT COUNT(*) FROM "Species" WHERE species_name = '${speciesName}';`)
		).toBe(1);

		const speciesIds = psqlScalar(
			`SELECT COUNT(DISTINCT species_id) FROM "Birds" WHERE ring_no IN ('DEMON-TEST-${suffix}-species-a', 'DEMON-TEST-${suffix}-species-b');`
		);
		expect(Number(speciesIds)).toBe(1);
	});

	it('rejects a raw duplicate species_name insert (bypassing upsert) with a unique-violation error', async () => {
		const speciesName = `DemonImportSpecies-${suffix}-raw-dup`;
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

describe('demon-import — Birds uniqueness (ring_no)', () => {
	let groupId: number;
	let groupClient: SupabaseClient;

	beforeAll(async () => {
		groupId = createIsolatedGroup(`demon-import-${suffix}-birds`);
		groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
	});

	it('upserting two rows with the same ring_no but a different species reuses the same Birds row and updates species_id', async () => {
		const upsert = createUpserter(groupClient);
		const ringNo = `DEMON-TEST-${suffix}-bird-shared`;

		await processEncounterRow(
			makeRow({
				ring_no: ringNo,
				species_name: `DemonImportSpecies-${suffix}-bird-1`,
				loc_id: `DemonImportLoc-${suffix}-bird`
			}),
			upsert,
			groupId
		);
		await processEncounterRow(
			makeRow({
				ring_no: ringNo,
				species_name: `DemonImportSpecies-${suffix}-bird-2`,
				loc_id: `DemonImportLoc-${suffix}-bird`
			}),
			upsert,
			groupId
		);

		expect(
			psqlCount(`SELECT COUNT(*) FROM "Birds" WHERE ring_no = '${ringNo}';`)
		).toBe(1);

		const currentSpeciesName = psqlScalar(
			`SELECT s.species_name FROM "Birds" b JOIN "Species" s ON s.id = b.species_id WHERE b.ring_no = '${ringNo}';`
		);
		expect(currentSpeciesName).toBe(`DemonImportSpecies-${suffix}-bird-2`);
	});

	it('rejects a raw duplicate ring_no insert (bypassing upsert) with a unique-violation error', async () => {
		const ringNo = `DEMON-TEST-${suffix}-bird-raw-dup`;
		const speciesId = Number(
			psqlScalar(
				`INSERT INTO "Species" (species_name) VALUES ('DemonImportSpecies-${suffix}-bird-raw-dup') RETURNING id;`
			)
		);

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

describe('demon-import — Locations uniqueness (location_name, ringing_group_id)', () => {
	let groupIdA: number;
	let groupIdB: number;
	let groupClientA: SupabaseClient;
	let groupClientB: SupabaseClient;

	beforeAll(async () => {
		groupIdA = createIsolatedGroup(`demon-import-${suffix}-loc-a`);
		groupIdB = createIsolatedGroup(`demon-import-${suffix}-loc-b`);
		groupClientA = await getAuthenticatedSupabaseClientForGroup(groupIdA);
		groupClientB = await getAuthenticatedSupabaseClientForGroup(groupIdB);
	});

	it('upserting the same location_name under two different ringing groups creates two separate Location rows', async () => {
		const locationName = `DemonImportLoc-${suffix}-cross-group`;
		const upsertA = createUpserter(groupClientA);
		const upsertB = createUpserter(groupClientB);

		await processEncounterRow(
			makeRow({
				ring_no: `DEMON-TEST-${suffix}-loc-cross-a`,
				species_name: `DemonImportSpecies-${suffix}-loc-cross-a`,
				loc_id: locationName
			}),
			upsertA,
			groupIdA
		);
		await processEncounterRow(
			makeRow({
				ring_no: `DEMON-TEST-${suffix}-loc-cross-b`,
				species_name: `DemonImportSpecies-${suffix}-loc-cross-b`,
				loc_id: locationName
			}),
			upsertB,
			groupIdB
		);

		expect(
			psqlCount(
				`SELECT COUNT(*) FROM "Locations" WHERE location_name = '${locationName}';`
			)
		).toBe(2);
		expect(
			psqlCount(
				`SELECT COUNT(DISTINCT ringing_group_id) FROM "Locations" WHERE location_name = '${locationName}';`
			)
		).toBe(2);
	});

	it('upserting the same location_name twice under the same group reuses the same Location row', async () => {
		const locationName = `DemonImportLoc-${suffix}-same-group`;
		const upsertA = createUpserter(groupClientA);

		await processEncounterRow(
			makeRow({
				ring_no: `DEMON-TEST-${suffix}-loc-same-1`,
				species_name: `DemonImportSpecies-${suffix}-loc-same-1`,
				loc_id: locationName
			}),
			upsertA,
			groupIdA
		);
		await processEncounterRow(
			makeRow({
				ring_no: `DEMON-TEST-${suffix}-loc-same-2`,
				species_name: `DemonImportSpecies-${suffix}-loc-same-2`,
				loc_id: locationName
			}),
			upsertA,
			groupIdA
		);

		expect(
			psqlCount(
				`SELECT COUNT(*) FROM "Locations" WHERE location_name = '${locationName}';`
			)
		).toBe(1);
	});

	it('rejects a raw duplicate (location_name, ringing_group_id) insert (bypassing upsert) with a unique-violation error', async () => {
		const locationName = `DemonImportLoc-${suffix}-raw-dup`;
		const first = await groupClientA
			.from('Locations')
			.insert({ location_name: locationName, ringing_group_id: groupIdA });
		expect(first.error).toBeNull();

		const duplicate = await groupClientA
			.from('Locations')
			.insert({ location_name: locationName, ringing_group_id: groupIdA });
		expect(duplicate.error?.code).toBe('23505');
	});
});

describe('demon-import — Sessions uniqueness (visit_date, location_id, session_type)', () => {
	let groupId: number;
	let groupClient: SupabaseClient;
	let locationName: string;

	beforeAll(async () => {
		groupId = createIsolatedGroup(`demon-import-${suffix}-sessions`);
		groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
		locationName = `DemonImportLoc-${suffix}-sessions`;
	});

	it('upserting rows with the same visit_date/location but different session_type creates separate Session rows', async () => {
		const upsert = createUpserter(groupClient);
		const visitDate = randomFutureDate();

		// record_type 'N' + age 5 buckets as FULL_GROWN; record_type 'U' (resighting)
		// buckets as FIELD_OBSERVATION regardless of age — see processEncounterRow.
		await processEncounterRow(
			makeRow({
				ring_no: `DEMON-TEST-${suffix}-session-type-fg`,
				species_name: `DemonImportSpecies-${suffix}-session-type-fg`,
				loc_id: locationName,
				visit_date: toDemonDate(visitDate),
				record_type: 'N',
				age: '5'
			}),
			upsert,
			groupId
		);
		await processEncounterRow(
			makeRow({
				ring_no: `DEMON-TEST-${suffix}-session-type-fo`,
				species_name: `DemonImportSpecies-${suffix}-session-type-fo`,
				loc_id: locationName,
				visit_date: toDemonDate(visitDate),
				record_type: 'U',
				age: '5'
			}),
			upsert,
			groupId
		);

		expect(
			psqlCount(
				`SELECT COUNT(*) FROM "Sessions" s JOIN "Locations" l ON l.id = s.location_id WHERE l.location_name = '${locationName}' AND s.visit_date = '${visitDate}';`
			)
		).toBe(2);
	});

	it('upserting rows with the same visit_date/location/session_type reuses the same Session row', async () => {
		const upsert = createUpserter(groupClient);
		const visitDate = randomFutureDate();

		await processEncounterRow(
			makeRow({
				ring_no: `DEMON-TEST-${suffix}-session-same-1`,
				species_name: `DemonImportSpecies-${suffix}-session-same-1`,
				loc_id: locationName,
				visit_date: toDemonDate(visitDate),
				record_type: 'N',
				age: '5'
			}),
			upsert,
			groupId
		);
		await processEncounterRow(
			makeRow({
				ring_no: `DEMON-TEST-${suffix}-session-same-2`,
				species_name: `DemonImportSpecies-${suffix}-session-same-2`,
				loc_id: locationName,
				visit_date: toDemonDate(visitDate),
				record_type: 'N',
				age: '6'
			}),
			upsert,
			groupId
		);

		expect(
			psqlCount(
				`SELECT COUNT(*) FROM "Sessions" s JOIN "Locations" l ON l.id = s.location_id WHERE l.location_name = '${locationName}' AND s.visit_date = '${visitDate}' AND s.session_type = 'FULL_GROWN';`
			)
		).toBe(1);
	});

	it('rejects a raw duplicate (visit_date, location_id, session_type) insert (bypassing upsert) with a unique-violation error', async () => {
		const { data: location, error: locationError } = await groupClient
			.from('Locations')
			.insert({
				location_name: `DemonImportLoc-${suffix}-sessions-raw-dup`,
				ringing_group_id: groupId
			})
			.select('id')
			.single();
		expect(locationError).toBeNull();
		const locationId = location!.id;
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

describe('demon-import — Encounters uniqueness (bird_id, session_id)', () => {
	let groupId: number;
	let groupClient: SupabaseClient;
	let locationName: string;

	beforeAll(async () => {
		groupId = createIsolatedGroup(`demon-import-${suffix}-encounters`);
		groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
		locationName = `DemonImportLoc-${suffix}-encounters`;
	});

	it('reprocessing the exact same row (same bird + session) updates the existing Encounters row instead of creating a duplicate', async () => {
		const upsert = createUpserter(groupClient);
		const ringNo = `DEMON-TEST-${suffix}-encounter-exact-dup`;
		const row = makeRow({
			ring_no: ringNo,
			species_name: `DemonImportSpecies-${suffix}-encounter-exact-dup`,
			loc_id: locationName,
			weight: '10.5'
		});

		await processEncounterRow(row, upsert, groupId);
		await processEncounterRow(
			{ ...row, weight: '12.3' }, // near-identical row: same key, different measurement
			upsert,
			groupId
		);

		expect(
			psqlCount(
				`SELECT COUNT(*) FROM "Encounters" e JOIN "Birds" b ON b.id = e.bird_id WHERE b.ring_no = '${ringNo}';`
			)
		).toBe(1);

		const weight = psqlScalar(
			`SELECT e.weight FROM "Encounters" e JOIN "Birds" b ON b.id = e.bird_id WHERE b.ring_no = '${ringNo}';`
		);
		expect(Number(weight)).toBeCloseTo(12.3);
	});

	it('processing the same bird on a different session (near-duplicate) creates a new Encounters row', async () => {
		const upsert = createUpserter(groupClient);
		const ringNo = `DEMON-TEST-${suffix}-encounter-near-dup`;
		const speciesName = `DemonImportSpecies-${suffix}-encounter-near-dup`;
		const firstVisitDate = randomFutureDate();

		await processEncounterRow(
			makeRow({
				ring_no: ringNo,
				species_name: speciesName,
				loc_id: locationName,
				visit_date: toDemonDate(firstVisitDate)
			}),
			upsert,
			groupId
		);
		await processEncounterRow(
			makeRow({
				ring_no: ringNo,
				species_name: speciesName,
				loc_id: locationName,
				visit_date: toDemonDate(addDays(firstVisitDate, 1))
			}),
			upsert,
			groupId
		);

		expect(
			psqlCount(
				`SELECT COUNT(*) FROM "Encounters" e JOIN "Birds" b ON b.id = e.bird_id WHERE b.ring_no = '${ringNo}';`
			)
		).toBe(2);
	});

	it('rejects a raw duplicate (bird_id, session_id) insert (bypassing upsert) with a unique-violation error', async () => {
		const upsert = createUpserter(groupClient);
		const ringNo = `DEMON-TEST-${suffix}-encounter-raw-dup`;
		await processEncounterRow(
			makeRow({
				ring_no: ringNo,
				species_name: `DemonImportSpecies-${suffix}-encounter-raw-dup`,
				loc_id: locationName
			}),
			upsert,
			groupId
		);

		const { data: bird, error: birdError } = await groupClient
			.from('Birds')
			.select('id')
			.eq('ring_no', ringNo)
			.single();
		expect(birdError).toBeNull();
		const { data: encounter, error: encounterError } = await groupClient
			.from('Encounters')
			.select('session_id')
			.eq('bird_id', bird!.id)
			.single();
		expect(encounterError).toBeNull();

		const duplicate = await groupClient.from('Encounters').insert({
			bird_id: bird!.id,
			session_id: encounter!.session_id,
			capture_time: '09:00:00',
			record_type: 'N',
			scheme: 'BTO',
			sex: 'M',
			age_code: 5
		});
		expect(duplicate.error?.code).toBe('23505');
	});
});
