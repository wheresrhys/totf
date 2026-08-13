/**
 * Integration tests for the Sessions.session_type identity column (#452).
 *
 * Covers the widened (visit_date, location_id, session_type) unique constraint and
 * ringing_group_id derivation on a hand-inserted PULLI row. The one-off backfill
 * data-migration coverage that exercised this alongside the boolean predecessor
 * column lived here temporarily and was removed once that column was dropped (#456).
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

function psqlColumnExists(table: string, column: string): boolean {
	const count = psqlScalar(
		`SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table}' AND column_name = '${column}';`
	);
	return Number(count) > 0;
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

describe('Sessions schema — is_resighting_only removed', () => {
	it('has no is_resighting_only column on the Sessions table', () => {
		expect(psqlColumnExists('Sessions', 'is_resighting_only')).toBe(false);
	});

	it('retains existing Sessions rows and their session_type values unchanged after the drop migration', async () => {
		const suffix = `post-drop-${randomTestSuffix()}`;
		const visitDate = randomFutureDate();
		const { groupId, locationId } = createIsolatedGroupAndLocation(suffix);
		const groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);

		const { error: insertError } = await groupClient.from('Sessions').insert({
			visit_date: visitDate,
			location_id: locationId,
			session_type: 'FIELD_OBSERVATION'
		});
		expect(insertError).toBeNull();

		const { data, error } = await groupClient
			.from('Sessions')
			.select('session_type')
			.eq('location_id', locationId)
			.eq('visit_date', visitDate)
			.single();
		expect(error).toBeNull();
		expect(data?.session_type).toBe('FIELD_OBSERVATION');

		cleanupGroup(groupId, locationId);
	});
});
