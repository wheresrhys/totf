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

import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest';
import { getAuthenticatedSupabaseClientForGroup } from '../../app/lib/auth/group-auth';
import {
	createUpserter,
	processEncounterRow,
	type DemonRow
} from '../../lib/demon-import';
import { randomTestSuffix, randomFutureDate, addDays } from './test-isolation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { psql, psqlScalar, createIsolatedGroup } from './db-test-helpers';

function psqlCount(sql: string): number {
	return Number(psqlScalar(sql));
}

/** Converts an ISO `YYYY-MM-DD` date into the DD/MM/YYYY format demon-import.ts expects. */
function toDemonDate(isoDate: string): string {
	return isoDate.split('-').reverse().join('/');
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
			`DELETE FROM "Sessions" WHERE ringing_group_id IN (SELECT id FROM "RingingGroups" WHERE group_name LIKE 'demon-import-${suffix}-%');` +
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
	let lookupRingSequence: ReturnType<typeof vi.fn>;

	beforeAll(async () => {
		groupId = createIsolatedGroup(`demon-import-${suffix}-multi`);
		groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
		lookupRingSequence = vi.fn().mockResolvedValue(null)
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
			await processEncounterRow(row, upsert, lookupRingSequence, groupId);
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

		await processEncounterRow(row, upsert, lookupRingSequence, groupId);
		await processEncounterRow(row, upsert, lookupRingSequence, groupId);

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
	let lookupRingSequence: ReturnType<typeof vi.fn>;

	beforeAll(async () => {
		groupId = createIsolatedGroup(`demon-import-${suffix}-species`);
		groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
		lookupRingSequence = vi.fn().mockResolvedValue(null)
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
			lookupRingSequence,
			groupId
		);
		await processEncounterRow(
			makeRow({
				ring_no: `DEMON-TEST-${suffix}-species-b`,
				species_name: speciesName,
				loc_id: `DemonImportLoc-${suffix}-species`
			}),
			upsert,
			lookupRingSequence,
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
});

describe('demon-import — Locations uniqueness (location_name, ringing_group_id)', () => {
	let groupIdA: number;
	let groupIdB: number;
	let groupClientA: SupabaseClient;
	let groupClientB: SupabaseClient;
	let lookupRingSequence: ReturnType<typeof vi.fn>;

	beforeAll(async () => {
		groupIdA = createIsolatedGroup(`demon-import-${suffix}-loc-a`);
		groupIdB = createIsolatedGroup(`demon-import-${suffix}-loc-b`);
		groupClientA = await getAuthenticatedSupabaseClientForGroup(groupIdA);
		groupClientB = await getAuthenticatedSupabaseClientForGroup(groupIdB);
		lookupRingSequence = vi.fn().mockResolvedValue(null);
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
			lookupRingSequence,
			groupIdA
		);
		await processEncounterRow(
			makeRow({
				ring_no: `DEMON-TEST-${suffix}-loc-cross-b`,
				species_name: `DemonImportSpecies-${suffix}-loc-cross-b`,
				loc_id: locationName
			}),
			upsertB,
			lookupRingSequence,
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
			lookupRingSequence,
			groupIdA
		);
		await processEncounterRow(
			makeRow({
				ring_no: `DEMON-TEST-${suffix}-loc-same-2`,
				species_name: `DemonImportSpecies-${suffix}-loc-same-2`,
				loc_id: locationName
			}),
			upsertA,
			lookupRingSequence,
			groupIdA
		);

		expect(
			psqlCount(
				`SELECT COUNT(*) FROM "Locations" WHERE location_name = '${locationName}';`
			)
		).toBe(1);
	});
});

// #1024 rewrote the Sessions upsert key from (visit_date, location_id,
// session_type) to (visit_date, ringing_group_id), so three of the four
// scenarios this block used to assert "creates separate Session rows" for now
// correctly reuse one row. Only a different visit_date still separates them.
describe('demon-import — Sessions uniqueness (visit_date, ringing_group_id)', () => {
	let groupId: number;
	let groupClient: SupabaseClient;
	let locationName: string;
	let lookupRingSequence: ReturnType<typeof vi.fn>;

	beforeAll(async () => {
		groupId = createIsolatedGroup(`demon-import-${suffix}-sessions`);
		groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
		locationName = `DemonImportLoc-${suffix}-sessions`;
		lookupRingSequence = vi.fn().mockResolvedValue(null);
	});

	/** Sessions this group holds for the given date(s). */
	function sessionCount(...visitDates: string[]): number {
		const dateList = visitDates.map((date) => `'${date}'`).join(', ');
		return psqlCount(
			`SELECT COUNT(*) FROM "Sessions" WHERE ringing_group_id = ${groupId} AND visit_date IN (${dateList});`
		);
	}

	/** Imports one CSV row for this group, labelled so rows never collide. */
	async function importRow(
		label: string,
		fields: { loc_id: string; visit_date: string; record_type: string; age: string }
	): Promise<void> {
		await processEncounterRow(
			makeRow({
				ring_no: `DEMON-TEST-${suffix}-${label}`,
				species_name: `DemonImportSpecies-${suffix}-${label}`,
				...fields
			}),
			createUpserter(groupClient),
			lookupRingSequence,
			groupId
		);
	}

	it('reuses one Session row for two rows on the same date at the same location', async () => {
		const visitDate = randomFutureDate();
		await importRow('session-same-1', {
			loc_id: locationName,
			visit_date: toDemonDate(visitDate),
			record_type: 'N',
			age: '5'
		});
		await importRow('session-same-2', {
			loc_id: locationName,
			visit_date: toDemonDate(visitDate),
			record_type: 'N',
			age: '6'
		});

		expect(sessionCount(visitDate)).toBe(1);
	});

	// Used to create two Sessions, one FULL_GROWN and one FIELD_OBSERVATION —
	// record_type 'N' + age 5 bucketed as the former, resighting type 'U' as the
	// latter. There is no session_type to split them on any more.
	it('reuses one Session row whatever the rows’ record_type and age', async () => {
		const visitDate = randomFutureDate();
		await importRow('session-type-fg', {
			loc_id: locationName,
			visit_date: toDemonDate(visitDate),
			record_type: 'N',
			age: '5'
		});
		await importRow('session-type-fo', {
			loc_id: locationName,
			visit_date: toDemonDate(visitDate),
			record_type: 'U',
			age: '5'
		});

		expect(sessionCount(visitDate)).toBe(1);
	});

	// Also used to create two Sessions. The per-location distinction now lives on
	// the Encounters rows, which is what the assertion checks for instead — losing
	// it is exactly what the Encounters uniqueness repoint guards against.
	it('reuses one Session row across two locations visited on the same date, with each encounter keeping its own location', async () => {
		const visitDate = randomFutureDate();
		const otherLocationName = `DemonImportLoc-${suffix}-sessions-other-location`;
		await importRow('session-location-1', {
			loc_id: locationName,
			visit_date: toDemonDate(visitDate),
			record_type: 'N',
			age: '5'
		});
		await importRow('session-location-2', {
			loc_id: otherLocationName,
			visit_date: toDemonDate(visitDate),
			record_type: 'N',
			age: '5'
		});

		expect(sessionCount(visitDate)).toBe(1);
		expect(
			psqlCount(
				`SELECT COUNT(DISTINCT e.location_id) FROM "Encounters" e WHERE e.ringing_group_id = ${groupId} AND e.visit_date = '${visitDate}';`
			)
		).toBe(2);
	});

	it('creates separate Session rows for two different visit_dates', async () => {
		const firstVisitDate = randomFutureDate();
		const secondVisitDate = addDays(firstVisitDate, 1);
		await importRow('session-date-1', {
			loc_id: locationName,
			visit_date: toDemonDate(firstVisitDate),
			record_type: 'N',
			age: '5'
		});
		await importRow('session-date-2', {
			loc_id: locationName,
			visit_date: toDemonDate(secondVisitDate),
			record_type: 'N',
			age: '5'
		});

		expect(sessionCount(firstVisitDate, secondVisitDate)).toBe(2);
	});
});

describe('demon-import — Encounters uniqueness (bird_id, location_id, visit_date)', () => {
	let groupId: number;
	let groupClient: SupabaseClient;
	let locationName: string;
	let lookupRingSequence: ReturnType<typeof vi.fn>;

	beforeAll(async () => {
		groupId = createIsolatedGroup(`demon-import-${suffix}-encounters`);
		groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
		locationName = `DemonImportLoc-${suffix}-encounters`;
		lookupRingSequence = vi.fn().mockResolvedValue(null);
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

		await processEncounterRow(row, upsert, lookupRingSequence, groupId);
		await processEncounterRow(
			{ ...row, weight: '12.3' }, // near-identical row: same key, different measurement
			upsert,
			lookupRingSequence,
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

	// The case the repointed key exists for: before #1024 these two rows landed in
	// two Sessions (different location_id) and so had two distinct (bird_id,
	// session_id) keys. They now share one Session, and only the encounter's own
	// location_id keeps them apart — on the old key the second row would have
	// overwritten the first.
	it('processing the same bird on the same date at two different locations creates two Encounters rows', async () => {
		const upsert = createUpserter(groupClient);
		const ringNo = `DEMON-TEST-${suffix}-encounter-two-locations`;
		const speciesName = `DemonImportSpecies-${suffix}-encounter-two-locations`;
		const visitDate = randomFutureDate();

		await processEncounterRow(
			makeRow({
				ring_no: ringNo,
				species_name: speciesName,
				loc_id: locationName,
				visit_date: toDemonDate(visitDate)
			}),
			upsert,
			lookupRingSequence,
			groupId
		);
		await processEncounterRow(
			makeRow({
				ring_no: ringNo,
				species_name: speciesName,
				loc_id: `DemonImportLoc-${suffix}-encounters-second-site`,
				visit_date: toDemonDate(visitDate)
			}),
			upsert,
			lookupRingSequence,
			groupId
		);

		expect(
			psqlCount(
				`SELECT COUNT(*) FROM "Encounters" e JOIN "Birds" b ON b.id = e.bird_id WHERE b.ring_no = '${ringNo}';`
			)
		).toBe(2);
	});

	it('processing the same bird on a different date (near-duplicate) creates a new Encounters row', async () => {
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
			lookupRingSequence,
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
			lookupRingSequence,
			groupId
		);

		expect(
			psqlCount(
				`SELECT COUNT(*) FROM "Encounters" e JOIN "Birds" b ON b.id = e.bird_id WHERE b.ring_no = '${ringNo}';`
			)
		).toBe(2);
	});
});

describe('demon-import — fat/pectoral_muscle/primary_moult persistence', () => {
	let groupId: number;
	let groupClient: SupabaseClient;
	let locationName: string;
	let lookupRingSequence: ReturnType<typeof vi.fn>;

	beforeAll(async () => {
		groupId = createIsolatedGroup(`demon-import-${suffix}-biometrics`);
		groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
		locationName = `DemonImportLoc-${suffix}-biometrics`;
		lookupRingSequence = vi.fn().mockResolvedValue(null);
	});

	// Regression test for the historical bug where primary_moult (despite having a column)
	// was never written by any import, and fat/pectoral_muscle had no column at all.
	it('persists fat, pectoral_muscle and primary_moult values from a CSV row onto the Encounters row', async () => {
		const upsert = createUpserter(groupClient);
		const ringNo = `DEMON-TEST-${suffix}-biometrics-set`;

		await processEncounterRow(
			makeRow({
				ring_no: ringNo,
				species_name: `DemonImportSpecies-${suffix}-biometrics-set`,
				loc_id: locationName,
				primary_moult: 'FFFFF3210',
				fat: 'B4',
				pectoral_muscle: '2'
			}),
			upsert,
			lookupRingSequence,
			groupId
		);

		const row = psqlScalar(
			`SELECT e.primary_moult || '|' || e.fat || '|' || e.pectoral_muscle FROM "Encounters" e JOIN "Birds" b ON b.id = e.bird_id WHERE b.ring_no = '${ringNo}';`
		);
		expect(row).toBe('FFFFF3210|B4|2');
	});

	it('persists null for fat, pectoral_muscle and primary_moult when the CSV row leaves them blank', async () => {
		const upsert = createUpserter(groupClient);
		const ringNo = `DEMON-TEST-${suffix}-biometrics-blank`;

		await processEncounterRow(
			makeRow({
				ring_no: ringNo,
				species_name: `DemonImportSpecies-${suffix}-biometrics-blank`,
				loc_id: locationName,
				primary_moult: '',
				fat: '',
				pectoral_muscle: ''
			}),
			upsert,
			lookupRingSequence,
			groupId
		);

		expect(
			psqlCount(
				`SELECT COUNT(*) FROM "Encounters" e JOIN "Birds" b ON b.id = e.bird_id WHERE b.ring_no = '${ringNo}' AND e.primary_moult IS NULL AND e.fat IS NULL AND e.pectoral_muscle IS NULL;`
			)
		).toBe(1);
	});
});

describe('demon-import — capture_method persistence', () => {
	let groupId: number;
	let groupClient: SupabaseClient;
	let locationName: string;
	let lookupRingSequence: ReturnType<typeof vi.fn>;

	beforeAll(async () => {
		groupId = createIsolatedGroup(`demon-import-${suffix}-capture-method`);
		groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
		locationName = `DemonImportLoc-${suffix}-capture-method`;
		lookupRingSequence = vi.fn().mockResolvedValue(null);
	});

	// Regression test: capture_method was recognized in DemonColumnNames but never
	// written onto the Encounters payload, so every imported row landed with
	// capture_method = NULL regardless of the CSV's actual value (the gap #1022's
	// isMistNetEncounter predicate was written to tolerate).
	it('persists a capture_method value from a CSV row onto the Encounters row', async () => {
		const upsert = createUpserter(groupClient);
		const ringNo = `DEMON-TEST-${suffix}-capture-method-set`;

		await processEncounterRow(
			makeRow({
				ring_no: ringNo,
				species_name: `DemonImportSpecies-${suffix}-capture-method-set`,
				loc_id: locationName,
				capture_method: 'M'
			}),
			upsert,
			lookupRingSequence,
			groupId
		);

		const capture_method = psqlScalar(
			`SELECT e.capture_method FROM "Encounters" e JOIN "Birds" b ON b.id = e.bird_id WHERE b.ring_no = '${ringNo}';`
		);
		expect(capture_method).toBe('M');
	});

	it('persists null for capture_method when the CSV row leaves it blank', async () => {
		const upsert = createUpserter(groupClient);
		const ringNo = `DEMON-TEST-${suffix}-capture-method-blank`;

		await processEncounterRow(
			makeRow({
				ring_no: ringNo,
				species_name: `DemonImportSpecies-${suffix}-capture-method-blank`,
				loc_id: locationName,
				capture_method: ''
			}),
			upsert,
			lookupRingSequence,
			groupId
		);

		expect(
			psqlCount(
				`SELECT COUNT(*) FROM "Encounters" e JOIN "Birds" b ON b.id = e.bird_id WHERE b.ring_no = '${ringNo}' AND e.capture_method IS NULL;`
			)
		).toBe(1);
	});
});
