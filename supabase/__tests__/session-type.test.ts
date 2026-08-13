/**
 * Integration tests for the Sessions.session_type identity column (#452).
 *
 * Covers the widened (visit_date, location_id, session_type) unique constraint,
 * ringing_group_id derivation on a hand-inserted PULLI row, and the one-off backfill
 * data-migration logic that flips resighting rows to FIELD_OBSERVATION, splits mixed
 * pulli/full-grown rows, and flips pure-pulli rows to PULLI.
 *
 * Requires local Supabase running and e2e seed data loaded:
 *   npm run db:start:local
 *   npm run db:seed:e2e
 *
 * Run with: npm run test:integration
 *
 * All rows created here use a run-unique suffix and a random future base date so
 * concurrent worktree runs against the shared local Supabase instance never collide.
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { execSync } from 'child_process';
import { getAuthenticatedSupabaseClientForGroup } from '../../lib/group-auth';
import { supabase } from '../../lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomTestSuffix, randomFutureDate, addDays } from './test-isolation';

const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

function psql(sql: string) {
	execSync(`psql "${LOCAL_DB_URL}" -c "${sql.replace(/"/g, '\\"')}"`);
}

function psqlScalar(sql: string): string {
	return execSync(
		`psql "${LOCAL_DB_URL}" -t -A -c "${sql.replace(/"/g, '\\"')}"`
	)
		.toString()
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)[0];
}

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
			`INSERT INTO "RingingGroups" (group_name) VALUES ('session-type-${suffix}') RETURNING id;`
		)
	);
	const locationId = Number(
		psqlScalar(
			`INSERT INTO "Locations" (location_name, ringing_group_id) VALUES ('session-type-loc-${suffix}', ${groupId}) RETURNING id;`
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

describe('Sessions — session_type identity', () => {
	const suffix = `identity-${randomTestSuffix()}`;
	const visitDate = randomFutureDate();
	let groupId: number;
	let locationId: number;
	let groupClient: SupabaseClient;

	beforeAll(async () => {
		({ groupId, locationId } = createIsolatedGroupAndLocation(suffix));
		groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
	});

	afterAll(() => cleanupGroup(groupId, locationId));

	it('allows all three session_type rows for the same visit_date/location, and rejects a duplicate triple', async () => {
		for (const session_type of [
			'FULL_GROWN',
			'FIELD_OBSERVATION',
			'PULLI'
		] as const) {
			const { error } = await groupClient
				.from('Sessions')
				.insert({
					visit_date: visitDate,
					location_id: locationId,
					session_type
				});
			expect(error).toBeNull();
		}

		const duplicate = await groupClient.from('Sessions').insert({
			visit_date: visitDate,
			location_id: locationId,
			session_type: 'PULLI'
		});
		expect(duplicate.error?.code).toBe('23505');
	});

	it('rejects a session_type outside the allowed set', async () => {
		const { error } = await groupClient.from('Sessions').insert({
			visit_date: addDays(visitDate, 1),
			location_id: locationId,
			session_type: 'NEST_RECORD'
		});
		expect(error?.code).toBe('23514'); // check_violation
	});

	it('derives ringing_group_id for a hand-inserted PULLI Sessions row', async () => {
		const { data, error } = await groupClient
			.from('Sessions')
			.insert({
				visit_date: addDays(visitDate, 2),
				location_id: locationId,
				session_type: 'PULLI'
			})
			.select('ringing_group_id')
			.single();
		expect(error).toBeNull();
		expect(data?.ringing_group_id).toBe(groupId);
	});
});

describe('session_type backfill migration', () => {
	// Mirrors the data steps hand-appended to the #452 migration, scoped by location_id
	// so it only touches this test's isolated fixtures. Post-migration the column is
	// NOT NULL DEFAULT 'FULL_GROWN', so freshly-inserted fixtures arrive as FULL_GROWN;
	// this scoped backfill treats (session_type = 'FULL_GROWN' AND is_resighting_only =
	// FALSE) as the "unclassified" set the real migration keyed off session_type IS NULL.
	// PULLI encounter = age_code = 1 AND NOT is_juv.
	function runBackfillScopedToLocation(loc: number) {
		psql(
			`UPDATE "Sessions" SET session_type = 'FIELD_OBSERVATION' WHERE location_id = ${loc} AND is_resighting_only = TRUE;`
		);
		psql(
			`WITH mixed_sessions AS (
				SELECT s.id AS old_session_id, s.visit_date, s.location_id
				FROM "Sessions" s
				WHERE s.location_id = ${loc}
					AND s.session_type = 'FULL_GROWN' AND s.is_resighting_only = FALSE
					AND EXISTS (SELECT 1 FROM "Encounters" e WHERE e.session_id = s.id AND e.age_code = 1 AND NOT e.is_juv)
					AND EXISTS (SELECT 1 FROM "Encounters" e WHERE e.session_id = s.id AND NOT (e.age_code = 1 AND NOT e.is_juv))
			), inserted_twins AS (
				INSERT INTO "Sessions" (visit_date, location_id, session_type, is_resighting_only)
				SELECT visit_date, location_id, 'PULLI', FALSE FROM mixed_sessions
				RETURNING id AS new_session_id, visit_date, location_id
			)
			UPDATE "Encounters" e
			SET session_id = t.new_session_id
			FROM mixed_sessions m
			JOIN inserted_twins t ON t.visit_date = m.visit_date AND t.location_id = m.location_id
			WHERE e.session_id = m.old_session_id AND e.age_code = 1 AND NOT e.is_juv;`
		);
		psql(
			`UPDATE "Sessions" s SET session_type = 'PULLI'
			WHERE s.location_id = ${loc}
				AND s.session_type = 'FULL_GROWN' AND s.is_resighting_only = FALSE
				AND EXISTS (SELECT 1 FROM "Encounters" e WHERE e.session_id = s.id)
				AND NOT EXISTS (SELECT 1 FROM "Encounters" e WHERE e.session_id = s.id AND NOT (e.age_code = 1 AND NOT e.is_juv));`
		);
	}

	const suffix = `backfill-${randomTestSuffix()}`;
	const baseDate = randomFutureDate();
	let groupId: number;
	let locationId: number;
	let groupClient: SupabaseClient;
	let speciesId: number;

	// Fixtures, inserted at the post-migration default (session_type = 'FULL_GROWN').
	const fieldObsDate = baseDate; // is_resighting_only = TRUE
	const mixedDate = addDays(baseDate, 1); // one pulli + one full-grown encounter
	const pureFullGrownDate = addDays(baseDate, 2); // one non-pulli encounter
	const purePulliDate = addDays(baseDate, 3); // one pulli encounter
	const juv1JDate = addDays(baseDate, 4); // one age-1J encounter (must stay FULL_GROWN)
	const emptyDate = addDays(baseDate, 5); // no encounters

	let fieldObsSessionId: number;
	let mixedSessionId: number;
	let pureFullGrownSessionId: number;
	let purePulliSessionId: number;
	let juv1JSessionId: number;
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

	async function insertSession(
		visitDate: string,
		isResightingOnly = false
	): Promise<number> {
		const { data, error } = await groupClient
			.from('Sessions')
			.insert({
				visit_date: visitDate,
				location_id: locationId,
				is_resighting_only: isResightingOnly
			})
			.select('id')
			.single();
		if (error) throw error;
		return data!.id;
	}

	async function insertEncounter(
		birdId: number,
		sessionId: number,
		ageCode: number,
		isJuv: boolean
	) {
		const { error } = await groupClient.from('Encounters').insert({
			capture_time: '10:00:00',
			scheme: 'BTO',
			sex: 'M',
			record_type: 'N',
			age_code: ageCode,
			is_juv: isJuv,
			bird_id: birdId,
			session_id: sessionId
		});
		if (error) throw error;
	}

	beforeAll(async () => {
		({ groupId, locationId } = createIsolatedGroupAndLocation(suffix));
		groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
		speciesId = await getRobinSpeciesId();

		fieldObsSessionId = await insertSession(fieldObsDate, true);
		mixedSessionId = await insertSession(mixedDate);
		pureFullGrownSessionId = await insertSession(pureFullGrownDate);
		purePulliSessionId = await insertSession(purePulliDate);
		juv1JSessionId = await insertSession(juv1JDate);
		emptySessionId = await insertSession(emptyDate);

		const [birdA, birdB, birdC, birdD, birdE, birdF] = await Promise.all([
			insertBird(`STA-${suffix}`),
			insertBird(`STB-${suffix}`),
			insertBird(`STC-${suffix}`),
			insertBird(`STD-${suffix}`),
			insertBird(`STE-${suffix}`),
			insertBird(`STF-${suffix}`)
		]);

		// field observation: one encounter (its age is irrelevant — the row is flagged
		// is_resighting_only)
		await insertEncounter(birdA, fieldObsSessionId, 3, false);
		// mixed: one full-grown (age 3) + one pulli (age 1, not juv)
		await insertEncounter(birdB, mixedSessionId, 3, false);
		await insertEncounter(birdC, mixedSessionId, 1, false);
		// pure full-grown: one age-3 encounter
		await insertEncounter(birdD, pureFullGrownSessionId, 3, false);
		// pure pulli: one age-1 (not juv) encounter
		await insertEncounter(birdE, purePulliSessionId, 1, false);
		// 1J: age_code 1 but is_juv TRUE — must NOT be treated as pulli
		await insertEncounter(birdF, juv1JSessionId, 1, true);
		// emptySession deliberately has no encounters

		runBackfillScopedToLocation(locationId);
	});

	afterAll(() => cleanupGroup(groupId, locationId));

	async function sessionTypeOf(sessionId: number): Promise<string | undefined> {
		const { data } = await groupClient
			.from('Sessions')
			.select('session_type')
			.eq('id', sessionId)
			.single();
		return data?.session_type;
	}

	it('sets a resighting-only row to FIELD_OBSERVATION in place (no split)', async () => {
		expect(await sessionTypeOf(fieldObsSessionId)).toBe('FIELD_OBSERVATION');
		const { data: rows } = await groupClient
			.from('Sessions')
			.select('id')
			.eq('location_id', locationId)
			.eq('visit_date', fieldObsDate);
		expect(rows).toHaveLength(1);
	});

	it('splits a mixed pulli/full-grown row, repointing the pulli encounter onto a new PULLI row', async () => {
		// original kept in place as FULL_GROWN
		expect(await sessionTypeOf(mixedSessionId)).toBe('FULL_GROWN');

		const { data: rows } = await groupClient
			.from('Sessions')
			.select('id, session_type')
			.eq('location_id', locationId)
			.eq('visit_date', mixedDate);
		expect(rows).toHaveLength(2);
		const twin = rows!.find((r) => r.session_type === 'PULLI');
		expect(twin).toBeDefined();

		const { data: originalEncounters } = await groupClient
			.from('Encounters')
			.select('age_code, is_juv')
			.eq('session_id', mixedSessionId);
		expect(originalEncounters).toEqual([{ age_code: 3, is_juv: false }]);

		const { data: twinEncounters } = await groupClient
			.from('Encounters')
			.select('age_code, is_juv')
			.eq('session_id', twin!.id);
		expect(twinEncounters).toEqual([{ age_code: 1, is_juv: false }]);
	});

	it('leaves a pure full-grown row at FULL_GROWN in place', async () => {
		expect(await sessionTypeOf(pureFullGrownSessionId)).toBe('FULL_GROWN');
	});

	it('flips a pure-pulli row to PULLI in place (no split)', async () => {
		expect(await sessionTypeOf(purePulliSessionId)).toBe('PULLI');
		const { data: rows } = await groupClient
			.from('Sessions')
			.select('id')
			.eq('location_id', locationId)
			.eq('visit_date', purePulliDate);
		expect(rows).toHaveLength(1);
	});

	it('leaves an age-1J row at FULL_GROWN (is_juv guards against nestling misclassification)', async () => {
		expect(await sessionTypeOf(juv1JSessionId)).toBe('FULL_GROWN');
	});

	it('leaves a zero-encounter row at FULL_GROWN (conservative default)', async () => {
		expect(await sessionTypeOf(emptySessionId)).toBe('FULL_GROWN');
	});
});
