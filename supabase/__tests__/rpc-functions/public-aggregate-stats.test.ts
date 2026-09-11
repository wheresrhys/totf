/**
 * Integration tests for the `public_aggregate_stats` Postgres RPC function.
 *
 * Requires local Supabase running and e2e seed data loaded:
 *   npm run db:start:local
 *   npm run db:seed:e2e
 *
 * Run with: npm run test:integration
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { execSync } from 'child_process';
import { getAuthenticatedSupabaseClientForGroup } from '../../../lib/group-auth';
import { supabase } from '../../../lib/supabase';
import { addDays, randomFutureDate, randomTestSuffix } from '../test-isolation';
import type { SupabaseClient } from '@supabase/supabase-js';

// public_aggregate_stats (#768) — a SECURITY DEFINER wrapper around aggregate_stats that
// only returns data for a group that has published its summary area ('summary' = ANY
// public_areas), and is executable by PUBLIC (anonymous, no-JWT clients). We prove three
// things: it mirrors aggregate_stats exactly for a published group, it returns nothing
// otherwise, and it exposes no raw base-table rows to the anon role. Every row created here
// is on a random far-future date under two run-unique isolated groups, so concurrent
// worktree runs against the shared local Supabase instance never collide (see CLAUDE.md's
// "DB integration tests" section). `supabase` is the anon client (anon key, no JWT).
describe('public_aggregate_stats', () => {
	const LOCAL_DB_URL =
		'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
	const suffix = randomTestSuffix();

	// Two isolated groups: one that publishes 'summary', one that publishes nothing. Each
	// owns its own public_areas flag, so no test mutates a shared seed group's flag.
	let publicGroupId: number;
	let privateGroupId: number;
	let publicGroupClient: SupabaseClient;
	// Anon client used to call the RPC exactly as an unauthenticated web visitor would.
	const anonClient = supabase;

	const createdLocationIds: number[] = [];
	const createdSessionIds: number[] = [];
	const createdBirdIds: number[] = [];

	// Month 1 holds a two-species FULL_GROWN session; month 2 (~40 days later, a guaranteed
	// different calendar month) holds a second FULL_GROWN session, so group_by_time_period
	// has two months to split across.
	let month1Date: string;
	let month2Date: string;

	function psqlScalar(sql: string): string {
		return execSync(
			`psql "${LOCAL_DB_URL}" -t -A -c "${sql.replace(/"/g, '\\"')}"`
		)
			.toString()
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)[0];
	}

	function createGroup(name: string, publicAreas: 'summary'[] = []): number {
		const areasLiteral =
			publicAreas.length === 0
				? "'{}'"
				: `ARRAY[${publicAreas.map((a) => `'${a}'`).join(', ')}]`;
		return Number(
			psqlScalar(
				`INSERT INTO "RingingGroups" (group_name, slug, public_areas) ` +
					`VALUES ('${name}', '${name.toLowerCase().replace(/ /g, '-')}', ${areasLiteral}) RETURNING id;`
			)
		);
	}

	async function getSpeciesId(name: string): Promise<number> {
		const { data, error } = await supabase
			.from('Species')
			.select('id')
			.eq('species_name', name)
			.single();
		if (error || !data)
			throw new Error(
				`Species "${name}" not found — run npm run db:seed:e2e first`
			);
		return data.id;
	}

	// Insert one FULL_GROWN session with the given encounters for a group, via that group's
	// authenticated client (so RLS insert policies and the ringing_group_id trigger apply).
	async function insertSessionWithEncounters(
		client: SupabaseClient,
		groupId: number,
		locationId: number,
		visitDate: string,
		encounters: Array<{
			speciesId: number;
			recordType: string;
			captureTime: string;
		}>
	): Promise<void> {
		const { data: session, error: sessionError } = await client
			.from('Sessions')
			.insert({
				visit_date: visitDate,
				location_id: locationId,
				session_type: 'FULL_GROWN'
			})
			.select('id')
			.single();
		if (sessionError) throw sessionError;
		createdSessionIds.push(session!.id);

		for (let i = 0; i < encounters.length; i++) {
			const { speciesId, recordType, captureTime } = encounters[i];
			const { data: bird, error: birdError } = await client
				.from('Birds')
				.insert({
					ring_no: `PAS-${suffix}-${groupId}-${createdBirdIds.length}`,
					species_id: speciesId
				})
				.select('id')
				.single();
			if (birdError) throw birdError;
			createdBirdIds.push(bird!.id);

			const { error: encounterError } = await client.from('Encounters').insert({
				bird_id: bird!.id,
				session_id: session!.id,
				scheme: 'BTO',
				sex: 'M',
				age_code: 4,
				weight: 15,
				record_type: recordType,
				capture_time: captureTime
			});
			if (encounterError) throw encounterError;
		}
	}

	async function createLocation(
		client: SupabaseClient,
		groupId: number,
		label: string
	): Promise<number> {
		const { data, error } = await client
			.from('Locations')
			.insert({
				location_name: `Public Agg ${label} ${suffix}`,
				ringing_group_id: groupId
			})
			.select('id')
			.single();
		if (error) throw error;
		createdLocationIds.push(data!.id);
		return data!.id;
	}

	beforeAll(async () => {
		publicGroupId = createGroup(`PublicAggPublic-${suffix}`, ['summary']);
		privateGroupId = createGroup(`PublicAggPrivate-${suffix}`, []);
		publicGroupClient =
			await getAuthenticatedSupabaseClientForGroup(publicGroupId);
		const privateGroupClient =
			await getAuthenticatedSupabaseClientForGroup(privateGroupId);

		const robinId = await getSpeciesId('Robin');
		const wrenId = await getSpeciesId('Wren');

		month1Date = randomFutureDate();
		month2Date = addDays(month1Date, 40);

		// Public group: month 1 = 2 Robins + 1 Wren (all New); month 2 = 1 Robin.
		const publicLocationId = await createLocation(
			publicGroupClient,
			publicGroupId,
			'Public'
		);
		await insertSessionWithEncounters(
			publicGroupClient,
			publicGroupId,
			publicLocationId,
			month1Date,
			[
				{ speciesId: robinId, recordType: 'N', captureTime: '09:00:00' },
				{ speciesId: robinId, recordType: 'N', captureTime: '10:00:00' },
				{ speciesId: wrenId, recordType: 'N', captureTime: '11:00:00' }
			]
		);
		await insertSessionWithEncounters(
			publicGroupClient,
			publicGroupId,
			publicLocationId,
			month2Date,
			[{ speciesId: robinId, recordType: 'N', captureTime: '09:00:00' }]
		);

		// Private group: has data too, so "returns nothing" reflects the flag, not empty data.
		const privateLocationId = await createLocation(
			privateGroupClient,
			privateGroupId,
			'Private'
		);
		await insertSessionWithEncounters(
			privateGroupClient,
			privateGroupId,
			privateLocationId,
			month1Date,
			[{ speciesId: robinId, recordType: 'N', captureTime: '09:00:00' }]
		);
	});

	afterAll(() => {
		execSync(
			`psql "${LOCAL_DB_URL}" -c '` +
				`DELETE FROM "Encounters" WHERE bird_id IN (${createdBirdIds.join(', ')});` +
				`DELETE FROM "Birds" WHERE id IN (${createdBirdIds.join(', ')});` +
				`DELETE FROM "Sessions" WHERE id IN (${createdSessionIds.join(', ')});` +
				`DELETE FROM "Locations" WHERE id IN (${createdLocationIds.join(', ')});` +
				`DELETE FROM "RingingGroups" WHERE id IN (${publicGroupId}, ${privateGroupId});'`
		);
	});

	// Usual
	it("returns the same rows as aggregate_stats for a group with 'summary' in public_areas", async () => {
		const params = {
			ringing_group_filter: publicGroupId,
			from_date: month1Date,
			to_date: month1Date
		};
		const [publicRes, authRes] = await Promise.all([
			anonClient.rpc('public_aggregate_stats', params),
			publicGroupClient.rpc('aggregate_stats', params)
		]);
		expect(publicRes.error).toBeNull();
		expect(authRes.error).toBeNull();
		expect(authRes.data).toHaveLength(1);
		// month 1 = 3 encounters / 3 birds / 2 species, and the public wrapper mirrors it exactly.
		expect(authRes.data![0]).toMatchObject({
			encounter_count: 3,
			bird_count: 3,
			species_count: 2
		});
		expect(publicRes.data).toEqual(authRes.data);
	});

	// Structure
	it('returns nothing for a group whose public_areas is empty', async () => {
		const { data, error } = await anonClient.rpc('public_aggregate_stats', {
			ringing_group_filter: privateGroupId,
			from_date: month1Date,
			to_date: month1Date
		});
		expect(error).toBeNull();
		// The private group has a real encounter on this date; the empty flag, not empty data,
		// is what yields no rows.
		expect(data).toEqual([]);
	});

	it('respects group_by_species identically to aggregate_stats when public', async () => {
		const params = {
			ringing_group_filter: publicGroupId,
			from_date: month1Date,
			to_date: month1Date,
			group_by_species: true
		};
		const [publicRes, authRes] = await Promise.all([
			anonClient.rpc('public_aggregate_stats', params),
			publicGroupClient.rpc('aggregate_stats', params)
		]);
		expect(publicRes.error).toBeNull();
		expect(authRes.error).toBeNull();
		expect(authRes.data!.map((r) => r.species_name).sort()).toEqual([
			'Robin',
			'Wren'
		]);
		expect(publicRes.data).toEqual(authRes.data);
	});

	it('respects group_by_time_period identically to aggregate_stats when public', async () => {
		const params = {
			ringing_group_filter: publicGroupId,
			from_date: month1Date,
			to_date: month2Date,
			group_by_time_period: 'month'
		};
		const [publicRes, authRes] = await Promise.all([
			anonClient.rpc('public_aggregate_stats', params),
			publicGroupClient.rpc('aggregate_stats', params)
		]);
		expect(publicRes.error).toBeNull();
		expect(authRes.error).toBeNull();
		// Two FULL_GROWN sessions across two distinct calendar months.
		expect(authRes.data!.filter((r) => r.session_count > 0)).toHaveLength(2);
		expect(publicRes.data).toEqual(authRes.data);
	});

	// Edge
	it('returns nothing for a non-existent ringing_group_filter id', async () => {
		const { data, error } = await anonClient.rpc('public_aggregate_stats', {
			ringing_group_filter: 2_000_000_000
		});
		expect(error).toBeNull();
		expect(data).toEqual([]);
	});

	it('returns nothing when no ringing_group_filter is given', async () => {
		const { data, error } = await anonClient.rpc('public_aggregate_stats', {});
		expect(error).toBeNull();
		expect(data).toEqual([]);
	});

	it('an anon-role client can call public_aggregate_stats directly (no JWT/app_metadata needed)', async () => {
		// anonClient carries only the anon key — no signed group JWT — yet still receives the
		// published group's aggregate rows, proving the PUBLIC execute grant is in effect.
		const { data, error } = await anonClient.rpc('public_aggregate_stats', {
			ringing_group_filter: publicGroupId,
			from_date: month1Date,
			to_date: month1Date
		});
		expect(error).toBeNull();
		expect(data).toHaveLength(1);
		expect(data![0].encounter_count).toBe(3);
	});

	it('an anon-role client still cannot SELECT directly from Sessions/Encounters/Birds regardless of public_areas', async () => {
		// The published-summary flag opens only the aggregate RPC, never the base tables: RLS
		// on Sessions/Encounters/Birds still returns nothing to a client with no group JWT,
		// even for the very group that published its summary.
		const [sessions, encounters, birds] = await Promise.all([
			anonClient
				.from('Sessions')
				.select('id')
				.eq('ringing_group_id', publicGroupId),
			anonClient
				.from('Encounters')
				.select('id')
				.eq('ringing_group_id', publicGroupId),
			anonClient
				.from('Birds')
				.select('id')
				.contains('ringing_group_ids', [publicGroupId])
		]);
		expect(sessions.error).toBeNull();
		expect(encounters.error).toBeNull();
		expect(birds.error).toBeNull();
		expect(sessions.data).toEqual([]);
		expect(encounters.data).toEqual([]);
		expect(birds.data).toEqual([]);
	});
});
