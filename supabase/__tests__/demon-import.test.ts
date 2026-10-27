/**
 * Integration tests for lib/demon-import.ts against the real Postgres schema (#464).
 *
 * demon-import.ts leans entirely on the DB's unique constraints to decide whether a
 * given upsert reuses an existing row or creates a new one (see
 * `EncounterRowBatchWriter`'s per-entity-type `uniqueColumns`, matched against each
 * table's `ON CONFLICT` target). These tests exercise `EncounterRowBatchWriter`
 * against the real schema so a change to a table's unique constraints (or a mismatch
 * between demon-import.ts and the schema) fails loudly here rather than being caught
 * only at import time in production. The existing unit tests in
 * lib/__tests__/demon-import.test.ts mock the Supabase client entirely, so none of
 * this DB-level behaviour is covered there.
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
	createRingSequenceLinker,
	EncounterRowBatchWriter,
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

/**
 * Imports one CSV row through the real batched writer (#1139), in a chunk of its
 * own.
 *
 * Stands in for the per-row writer this file used to call. The writer's own
 * per-chunk deduplication is unit-tested against a mocked client in
 * lib/__tests__/demon-import.test.ts; what this file exists for is the DB's unique
 * constraints deciding whether each upsert reuses a row, which a chunk of one
 * exercises exactly as the old per-row path did. `importChunkThroughWriter` below
 * covers the multi-row case against the same real constraints.
 */
async function importRowThroughWriter(
	row: DemonRow,
	groupClient: SupabaseClient,
	lookupRingSequence: ReturnType<typeof vi.fn>,
	groupId: number
): Promise<void> {
	await importChunkThroughWriter([row], groupClient, lookupRingSequence, groupId);
}

/** Imports every row as a single chunk, so one bulk upsert covers them all. */
async function importChunkThroughWriter(
	rows: DemonRow[],
	groupClient: SupabaseClient,
	lookupRingSequence: ReturnType<typeof vi.fn>,
	groupId: number,
	/** Defaults to one chunk holding every row; pass 1 to split them up. */
	chunkSize: number = rows.length
): Promise<void> {
	const writer = new EncounterRowBatchWriter(groupClient, {
		ringingGroupId: groupId,
		lookupRingSequence,
		linkRingSequence: createRingSequenceLinker(groupClient),
		chunkSize
	});
	const written = rows.map((rowOfChunk) => writer.writeEncounterRow(rowOfChunk));
	await writer.flushRemaining();
	await Promise.all(written);
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
		const rows = [1, 2, 3].map((n) =>
			makeRow({
				ring_no: `DEMON-TEST-${suffix}-multi-${n}`,
				species_name: `DemonImportSpecies-${suffix}-multi-${n}`,
				loc_id: `DemonImportLoc-${suffix}-multi-${n}`,
				visit_date: toDemonDate(addDays(randomFutureDate(), n))
			})
		);

		for (const row of rows) {
			await importRowThroughWriter(row, groupClient, lookupRingSequence, groupId);
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
		const row = makeRow({
			ring_no: `DEMON-TEST-${suffix}-repeat`,
			species_name: `DemonImportSpecies-${suffix}-repeat`,
			loc_id: `DemonImportLoc-${suffix}-repeat`,
			visit_date: toDemonDate(randomFutureDate())
		});

		await importRowThroughWriter(row, groupClient, lookupRingSequence, groupId);
		await importRowThroughWriter(row, groupClient, lookupRingSequence, groupId);

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
		const speciesName = `DemonImportSpecies-${suffix}-shared`;

		await importRowThroughWriter(
			makeRow({
				ring_no: `DEMON-TEST-${suffix}-species-a`,
				species_name: speciesName,
				loc_id: `DemonImportLoc-${suffix}-species`
			}),
			groupClient,
			lookupRingSequence,
			groupId
		);
		await importRowThroughWriter(
			makeRow({
				ring_no: `DEMON-TEST-${suffix}-species-b`,
				species_name: speciesName,
				loc_id: `DemonImportLoc-${suffix}-species`
			}),
			groupClient,
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

		await importRowThroughWriter(
			makeRow({
				ring_no: `DEMON-TEST-${suffix}-loc-cross-a`,
				species_name: `DemonImportSpecies-${suffix}-loc-cross-a`,
				loc_id: locationName
			}),
			groupClientA,
			lookupRingSequence,
			groupIdA
		);
		await importRowThroughWriter(
			makeRow({
				ring_no: `DEMON-TEST-${suffix}-loc-cross-b`,
				species_name: `DemonImportSpecies-${suffix}-loc-cross-b`,
				loc_id: locationName
			}),
			groupClientB,
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

		await importRowThroughWriter(
			makeRow({
				ring_no: `DEMON-TEST-${suffix}-loc-same-1`,
				species_name: `DemonImportSpecies-${suffix}-loc-same-1`,
				loc_id: locationName
			}),
			groupClientA,
			lookupRingSequence,
			groupIdA
		);
		await importRowThroughWriter(
			makeRow({
				ring_no: `DEMON-TEST-${suffix}-loc-same-2`,
				species_name: `DemonImportSpecies-${suffix}-loc-same-2`,
				loc_id: locationName
			}),
			groupClientA,
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
		await importRowThroughWriter(
			makeRow({
				ring_no: `DEMON-TEST-${suffix}-${label}`,
				species_name: `DemonImportSpecies-${suffix}-${label}`,
				...fields
			}),
			groupClient,
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
		const ringNo = `DEMON-TEST-${suffix}-encounter-exact-dup`;
		const row = makeRow({
			ring_no: ringNo,
			species_name: `DemonImportSpecies-${suffix}-encounter-exact-dup`,
			loc_id: locationName,
			weight: '10.5'
		});

		await importRowThroughWriter(row, groupClient, lookupRingSequence, groupId);
		await importRowThroughWriter(
			{ ...row, weight: '12.3' }, // near-identical row: same key, different measurement
			groupClient,
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
		const ringNo = `DEMON-TEST-${suffix}-encounter-two-locations`;
		const speciesName = `DemonImportSpecies-${suffix}-encounter-two-locations`;
		const visitDate = randomFutureDate();

		await importRowThroughWriter(
			makeRow({
				ring_no: ringNo,
				species_name: speciesName,
				loc_id: locationName,
				visit_date: toDemonDate(visitDate)
			}),
			groupClient,
			lookupRingSequence,
			groupId
		);
		await importRowThroughWriter(
			makeRow({
				ring_no: ringNo,
				species_name: speciesName,
				loc_id: `DemonImportLoc-${suffix}-encounters-second-site`,
				visit_date: toDemonDate(visitDate)
			}),
			groupClient,
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
		const ringNo = `DEMON-TEST-${suffix}-encounter-near-dup`;
		const speciesName = `DemonImportSpecies-${suffix}-encounter-near-dup`;
		const firstVisitDate = randomFutureDate();

		await importRowThroughWriter(
			makeRow({
				ring_no: ringNo,
				species_name: speciesName,
				loc_id: locationName,
				visit_date: toDemonDate(firstVisitDate)
			}),
			groupClient,
			lookupRingSequence,
			groupId
		);
		await importRowThroughWriter(
			makeRow({
				ring_no: ringNo,
				species_name: speciesName,
				loc_id: locationName,
				visit_date: toDemonDate(addDays(firstVisitDate, 1))
			}),
			groupClient,
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
		const ringNo = `DEMON-TEST-${suffix}-biometrics-set`;

		await importRowThroughWriter(
			makeRow({
				ring_no: ringNo,
				species_name: `DemonImportSpecies-${suffix}-biometrics-set`,
				loc_id: locationName,
				primary_moult: 'FFFFF3210',
				fat: 'B4',
				pectoral_muscle: '2'
			}),
			groupClient,
			lookupRingSequence,
			groupId
		);

		const row = psqlScalar(
			`SELECT e.primary_moult || '|' || e.fat || '|' || e.pectoral_muscle FROM "Encounters" e JOIN "Birds" b ON b.id = e.bird_id WHERE b.ring_no = '${ringNo}';`
		);
		expect(row).toBe('FFFFF3210|B4|2');
	});

	it('persists null for fat, pectoral_muscle and primary_moult when the CSV row leaves them blank', async () => {
		const ringNo = `DEMON-TEST-${suffix}-biometrics-blank`;

		await importRowThroughWriter(
			makeRow({
				ring_no: ringNo,
				species_name: `DemonImportSpecies-${suffix}-biometrics-blank`,
				loc_id: locationName,
				primary_moult: '',
				fat: '',
				pectoral_muscle: ''
			}),
			groupClient,
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
		const ringNo = `DEMON-TEST-${suffix}-capture-method-set`;

		await importRowThroughWriter(
			makeRow({
				ring_no: ringNo,
				species_name: `DemonImportSpecies-${suffix}-capture-method-set`,
				loc_id: locationName,
				capture_method: 'M'
			}),
			groupClient,
			lookupRingSequence,
			groupId
		);

		const capture_method = psqlScalar(
			`SELECT e.capture_method FROM "Encounters" e JOIN "Birds" b ON b.id = e.bird_id WHERE b.ring_no = '${ringNo}';`
		);
		expect(capture_method).toBe('M');
	});

	it('persists null for capture_method when the CSV row leaves it blank', async () => {
		const ringNo = `DEMON-TEST-${suffix}-capture-method-blank`;

		await importRowThroughWriter(
			makeRow({
				ring_no: ringNo,
				species_name: `DemonImportSpecies-${suffix}-capture-method-blank`,
				loc_id: locationName,
				capture_method: ''
			}),
			groupClient,
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

// The chunked writer's reason for existing (#1139): one bulk upsert per entity
// type per chunk. Every assertion here is about what the real constraints do with
// a *multi-row* upsert — the case the per-row writer could never produce, and the
// case Postgres is strictest about ("ON CONFLICT DO UPDATE command cannot affect
// row a second time").
describe('demon-import — chunked multi-row upserts', () => {
	let groupId: number;
	let groupClient: SupabaseClient;
	let locationName: string;
	let lookupRingSequence: ReturnType<typeof vi.fn>;

	beforeAll(async () => {
		groupId = createIsolatedGroup(`demon-import-${suffix}-chunk`);
		groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
		locationName = `DemonImportLoc-${suffix}-chunk`;
		lookupRingSequence = vi.fn().mockResolvedValue(null);
	});

	it('writes one row per distinct entity for a chunk of distinct CSV rows', async () => {
		const visitDate = randomFutureDate();
		await importChunkThroughWriter(
			[1, 2, 3].map((n) =>
				makeRow({
					ring_no: `DEMON-TEST-${suffix}-chunk-distinct-${n}`,
					species_name: `DemonImportSpecies-${suffix}-chunk-distinct-${n}`,
					loc_id: `${locationName}-distinct-${n}`,
					visit_date: toDemonDate(visitDate)
				})
			),
			groupClient,
			lookupRingSequence,
			groupId
		);

		expect(
			psqlCount(
				`SELECT COUNT(*) FROM "Encounters" e JOIN "Birds" b ON b.id = e.bird_id WHERE b.ring_no LIKE 'DEMON-TEST-${suffix}-chunk-distinct-%';`
			)
		).toBe(3);
		expect(
			psqlCount(
				`SELECT COUNT(*) FROM "Locations" WHERE location_name LIKE '${locationName}-distinct-%';`
			)
		).toBe(3);
		// One group-day, however many sites the chunk spans (#1024).
		expect(
			psqlCount(
				`SELECT COUNT(*) FROM "Sessions" WHERE ringing_group_id = ${groupId} AND visit_date = '${visitDate}';`
			)
		).toBe(1);
	});

	it('writes one Species row for a chunk whose rows all share a species_name', async () => {
		const speciesName = `DemonImportSpecies-${suffix}-chunk-shared`;
		await importChunkThroughWriter(
			[1, 2, 3].map((n) =>
				makeRow({
					ring_no: `DEMON-TEST-${suffix}-chunk-shared-${n}`,
					species_name: speciesName,
					loc_id: `${locationName}-shared`,
					visit_date: toDemonDate(randomFutureDate())
				})
			),
			groupClient,
			lookupRingSequence,
			groupId
		);

		expect(
			psqlCount(
				`SELECT COUNT(*) FROM "Species" WHERE species_name = '${speciesName}';`
			)
		).toBe(1);
		expect(
			psqlCount(
				`SELECT COUNT(DISTINCT species_id) FROM "Birds" WHERE ring_no LIKE 'DEMON-TEST-${suffix}-chunk-shared-%';`
			)
		).toBe(1);
	});

	/**
	 * The two halves of a same-run duplicate (#1219): one bird, one site, one
	 * day, logged twice, each recording a measurement the other left blank. The
	 * wrap-up pass in `flushRemaining` should leave a single Encounters row
	 * holding the chronologically first row's `capture_time`/`weight` and the
	 * later row's `wing_length`, whichever chunking the pair arrives in.
	 */
	function makeDuplicatePair(label: string) {
		const ringNo = `DEMON-TEST-${suffix}-${label}`;
		const sharedFields = {
			ring_no: ringNo,
			species_name: `DemonImportSpecies-${suffix}-${label}`,
			loc_id: `${locationName}-${label}`,
			visit_date: toDemonDate(randomFutureDate())
		};
		return {
			ringNo,
			rows: [
				makeRow({
					...sharedFields,
					capture_time: '08:30',
					weight: '10.5',
					wing_length: ''
				}),
				makeRow({
					...sharedFields,
					capture_time: '15:45',
					weight: '12.3',
					wing_length: '65'
				})
			]
		};
	}

	const storedEncounter = (ringNo: string) => ({
		rowCount: psqlCount(
			`SELECT COUNT(*) FROM "Encounters" e JOIN "Birds" b ON b.id = e.bird_id WHERE b.ring_no = '${ringNo}';`
		),
		weight: Number(
			psqlScalar(
				`SELECT e.weight FROM "Encounters" e JOIN "Birds" b ON b.id = e.bird_id WHERE b.ring_no = '${ringNo}';`
			)
		),
		wingLength: Number(
			psqlScalar(
				`SELECT e.wing_length FROM "Encounters" e JOIN "Birds" b ON b.id = e.bird_id WHERE b.ring_no = '${ringNo}';`
			)
		),
		captureTime: psqlScalar(
			`SELECT e.capture_time FROM "Encounters" e JOIN "Birds" b ON b.id = e.bird_id WHERE b.ring_no = '${ringNo}';`
		)
	});

	it('merges a chunk holding the same bird/location/date twice into one Encounters row', async () => {
		const { ringNo, rows } = makeDuplicatePair('chunk-dup');

		// The chunk's own bulk upsert still sees the pair deduped to the last
		// payload — Postgres would reject the statement outright otherwise — and
		// `flushRemaining`'s wrap-up pass then rewrites the row with the merge.
		await importChunkThroughWriter(
			rows,
			groupClient,
			lookupRingSequence,
			groupId
		);

		const stored = storedEncounter(ringNo);
		expect(stored.rowCount).toBe(1);
		expect(stored.captureTime).toContain('08:30');
		// The earliest row's own measurement, not the last-written one.
		expect(stored.weight).toBeCloseTo(10.5);
		// Filled in from the later duplicate, which recorded what the first left blank.
		expect(stored.wingLength).toBe(65);
	});

	it('merges a duplicate pair split across two chunks to the same row as one chunk gives', async () => {
		const { ringNo, rows } = makeDuplicatePair('cross-chunk-dup');

		await importChunkThroughWriter(
			rows,
			groupClient,
			lookupRingSequence,
			groupId,
			1
		);

		const stored = storedEncounter(ringNo);
		expect(stored.rowCount).toBe(1);
		expect(stored.captureTime).toContain('08:30');
		expect(stored.weight).toBeCloseTo(10.5);
		expect(stored.wingLength).toBe(65);
	});

	it('re-importing an identical chunk does not duplicate any row', async () => {
		const rows = [1, 2].map((n) =>
			makeRow({
				ring_no: `DEMON-TEST-${suffix}-chunk-reimport-${n}`,
				species_name: `DemonImportSpecies-${suffix}-chunk-reimport`,
				loc_id: `${locationName}-reimport`,
				visit_date: toDemonDate(randomFutureDate())
			})
		);

		await importChunkThroughWriter(
			rows,
			groupClient,
			lookupRingSequence,
			groupId
		);
		await importChunkThroughWriter(
			rows,
			groupClient,
			lookupRingSequence,
			groupId
		);

		expect(
			psqlCount(
				`SELECT COUNT(*) FROM "Birds" WHERE ring_no LIKE 'DEMON-TEST-${suffix}-chunk-reimport-%';`
			)
		).toBe(2);
		expect(
			psqlCount(
				`SELECT COUNT(*) FROM "Encounters" e JOIN "Birds" b ON b.id = e.bird_id WHERE b.ring_no LIKE 'DEMON-TEST-${suffix}-chunk-reimport-%';`
			)
		).toBe(2);
		expect(
			psqlCount(
				`SELECT COUNT(*) FROM "Locations" WHERE location_name = '${locationName}-reimport';`
			)
		).toBe(1);
	});
});
