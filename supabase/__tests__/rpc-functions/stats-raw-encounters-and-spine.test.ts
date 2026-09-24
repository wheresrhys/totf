/**
 * Integration tests for the shared stats utility RPCs `stats_raw_encounters` and
 * `stats_spine` (#800), covering the resighting/field-observation exclusion added
 * in #874. This is the actual fix point — aggregate_stats, population_stats and
 * biometrics_stats all inherit the exclusion from here — so it gets direct coverage,
 * with thin confirming assertions in each consumer suite.
 *
 * - stats_raw_encounters excludes any Encounters row whose record_type is a
 *   resighting type (public.resighting_record_type: U/F/D) via the LEFT JOIN's ON
 *   clause, preserving NULL-preserving semantics (a bird with only resightings still
 *   appears with encounter_id IS NULL rather than vanishing).
 * - stats_spine's session_date_range excludes FIELD_OBSERVATION sessions so their
 *   dates no longer stretch the month/year spine.
 *
 * Requires local Supabase running and e2e seed data loaded:
 *   npm run db:start:local
 *   npm run db:seed:e2e
 *
 * Run with: npm run test:integration
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { execSync } from 'child_process';
import { getAuthenticatedSupabaseClientForGroup } from '../../../app/lib/auth/group-auth';
import { supabase } from '../../../lib/supabase';
import { addDays, randomFutureDate, randomTestSuffix } from '../test-isolation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getGroupIdByName } from './helpers/seed-lookups';
import {
	insertTestLocation,
	insertTestSession,
	insertTestBird,
	insertTestEncounter
} from './helpers/encounter-fixtures';

async function getSpeciesId(speciesName: string): Promise<number> {
	const { data, error } = await supabase
		.from('Species')
		.select('id')
		.eq('species_name', speciesName)
		.single();
	if (error || !data)
		throw new Error(
			`Species "${speciesName}" not found — run npm run db:seed:e2e first`
		);
	return data.id;
}

describe('stats_raw_encounters — resighting exclusion', () => {
	let deltaId: number;
	let deltaClient: SupabaseClient;

	const locationIds: number[] = [];
	const sessionIds: number[] = [];
	const birdIds: number[] = [];

	const suffix = randomTestSuffix();
	// Ring numbers are globally unique, so we can .eq('ring_no', ...) each RPC call
	// down to a single bird's rows regardless of what else is in the shared table.
	const mixedRing = `RSE-MIX-${suffix}`;
	const resightOnlyRing = `RSE-RES-${suffix}`;

	let normalEncounterId: number;
	let resightingEncounterId: number;

	beforeAll(async () => {
		deltaId = await getGroupIdByName('Delta');
		deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);

		const robinId = await getSpeciesId('Robin');
		const wrenId = await getSpeciesId('Wren');

		const base = randomFutureDate();
		const dNormal = addDays(base, 0);
		const dResight = addDays(base, 1);
		const dResightOnly = addDays(base, 2);

		const locationId = await insertTestLocation(
			deltaClient,
			deltaId,
			`RawEnc Loc ${suffix}`
		);
		locationIds.push(locationId);

		async function makeSession(date: string): Promise<number> {
			const sessionId = await insertTestSession(deltaClient, locationId, date);
			sessionIds.push(sessionId);
			return sessionId;
		}

		async function makeBird(ring: string, speciesId: number): Promise<number> {
			const birdId = await insertTestBird(deltaClient, ring, speciesId);
			birdIds.push(birdId);
			return birdId;
		}

		function makeEncounter(
			birdId: number,
			sessionId: number,
			recordType: string
		): Promise<number> {
			return insertTestEncounter(deltaClient, birdId, sessionId, {
				age_code: 4,
				record_type: recordType,
				weight: 10,
				wing_length: 50
			});
		}

		// mixedBird: one normal 'N' capture and one resighting 'F' for the same bird.
		const mixedBird = await makeBird(mixedRing, robinId);
		normalEncounterId = await makeEncounter(
			mixedBird,
			await makeSession(dNormal),
			'N'
		);
		resightingEncounterId = await makeEncounter(
			mixedBird,
			await makeSession(dResight),
			'F'
		);

		// resightOnlyBird: its only encounter is a resighting 'U'.
		const resightOnlyBird = await makeBird(resightOnlyRing, wrenId);
		await makeEncounter(resightOnlyBird, await makeSession(dResightOnly), 'U');
	});

	afterAll(() => {
		execSync(
			`psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c '` +
				`DELETE FROM "Encounters" WHERE bird_id IN (${birdIds.join(', ')});` +
				`DELETE FROM "Birds" WHERE id IN (${birdIds.join(', ')});` +
				`DELETE FROM "Sessions" WHERE id IN (${sessionIds.join(', ')});` +
				`DELETE FROM "Locations" WHERE id IN (${locationIds.join(', ')});'`
		);
	});

	// Usual
	it('excludes an encounter whose record_type is U/F/D from the result', async () => {
		const { data, error } = await deltaClient
			.rpc('stats_raw_encounters', {})
			.eq('ring_no', mixedRing);
		expect(error).toBeNull();
		// The resighting 'F' encounter must not appear as a row at all.
		expect(data!.some((r) => r.encounter_id === resightingEncounterId)).toBe(
			false
		);
		expect(
			data!.some((r) => ['U', 'F', 'D'].includes(r.record_type as string))
		).toBe(false);
	});

	// Edge — LEFT JOIN semantics preserved
	it('still returns a species/bird with zero non-resighting encounters (encounter_id IS NULL row), not dropped entirely', async () => {
		const { data, error } = await deltaClient
			.rpc('stats_raw_encounters', {})
			.eq('ring_no', resightOnlyRing);
		expect(error).toBeNull();
		// The bird still surfaces exactly once, with its (excluded) resighting
		// leaving encounter_id NULL rather than dropping the bird from the result.
		expect(data).toHaveLength(1);
		expect(data![0].ring_no).toBe(resightOnlyRing);
		expect(data![0].encounter_id).toBeNull();
	});

	// Structure — mixed row set
	it('includes a normal capture record_type (e.g. N or C) alongside an excluded resighting for the same bird', async () => {
		const { data, error } = await deltaClient
			.rpc('stats_raw_encounters', {})
			.eq('ring_no', mixedRing);
		expect(error).toBeNull();
		// Exactly the one normal capture survives; the resighting is gone.
		expect(data).toHaveLength(1);
		expect(data![0].encounter_id).toBe(normalEncounterId);
		expect(data![0].record_type).toBe('N');
	});
});

describe('stats_spine — FIELD_OBSERVATION session exclusion from date range', () => {
	let deltaId: number;
	let deltaClient: SupabaseClient;

	const locationIds: number[] = [];
	const sessionIds: number[] = [];

	// Two independent years so the two windows never overlap each other's sessions.
	// session_date_range is not group-filtered, so tight per-year windows are what
	// isolate each assertion from the rest of the shared Sessions table.
	const yrExclude = 2080 + Math.floor(Math.random() * 18); // 2080–2097
	const yrShared = yrExclude + 1;

	const fullGrownDate = `${yrExclude}-03-15`;
	const fieldObsDate = `${yrExclude}-09-15`;
	const sharedDate = `${yrShared}-06-10`;

	beforeAll(async () => {
		deltaId = await getGroupIdByName('Delta');
		deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);

		const suffix = randomTestSuffix();
		const locationId = await insertTestLocation(
			deltaClient,
			deltaId,
			`Spine Loc ${suffix}`
		);
		locationIds.push(locationId);

		async function makeSession(
			date: string,
			sessionType: 'FULL_GROWN' | 'FIELD_OBSERVATION'
		): Promise<void> {
			const sessionId = await insertTestSession(
				deltaClient,
				locationId,
				date,
				sessionType
			);
			sessionIds.push(sessionId);
		}

		// Exclusion year: a FULL_GROWN session in March and a lone FIELD_OBSERVATION
		// session in September (the later, spine-stretching one under the old bug).
		await makeSession(fullGrownDate, 'FULL_GROWN');
		await makeSession(fieldObsDate, 'FIELD_OBSERVATION');

		// Shared-date year: a FULL_GROWN and a FIELD_OBSERVATION on the same date
		// (allowed — the unique key includes session_type).
		await makeSession(sharedDate, 'FULL_GROWN');
		await makeSession(sharedDate, 'FIELD_OBSERVATION');
	});

	afterAll(() => {
		execSync(
			`psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c '` +
				`DELETE FROM "Sessions" WHERE id IN (${sessionIds.join(', ')});` +
				`DELETE FROM "Locations" WHERE id IN (${locationIds.join(', ')});'`
		);
	});

	// Usual — the bug scenario
	it('a FIELD_OBSERVATION-only session outside the range of any FULL_GROWN/PULLI session does not extend the month/year spine', async () => {
		const { data, error } = await deltaClient.rpc('stats_spine', {
			ringing_group_filter: deltaId,
			from_date: `${yrExclude}-01-01`,
			to_date: `${yrExclude}-12-31`,
			group_by_time_period: 'month'
		});
		expect(error).toBeNull();
		const months = data!.map((r) => r.time_period);
		// The FULL_GROWN March session bounds the spine; September's field-obs session
		// must not stretch it out to September.
		expect(months).toContain(`${yrExclude}-03-01`);
		expect(months).not.toContain(`${yrExclude}-09-01`);
	});

	// Edge — don't over-exclude
	it('a FIELD_OBSERVATION session sharing a date with a real session does not remove that date from the spine', async () => {
		const { data, error } = await deltaClient.rpc('stats_spine', {
			ringing_group_filter: deltaId,
			from_date: `${yrShared}-06-01`,
			to_date: `${yrShared}-06-30`,
			group_by_time_period: 'month'
		});
		expect(error).toBeNull();
		const months = data!.map((r) => r.time_period);
		// The real FULL_GROWN session on that date keeps June in the spine.
		expect(months).toContain(`${yrShared}-06-01`);
	});
});

describe('stats_raw_encounters/stats_spine — no filters supplied', () => {
	let deltaId: number;
	let deltaClient: SupabaseClient;

	const locationIds: number[] = [];
	const sessionIds: number[] = [];
	const birdIds: number[] = [];

	const suffix = randomTestSuffix();
	const resightRing = `RSE-NULL-${suffix}`;
	let resightingEncounterId: number;

	beforeAll(async () => {
		deltaId = await getGroupIdByName('Delta');
		deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);

		const robinId = await getSpeciesId('Robin');
		const date = randomFutureDate();

		const locationId = await insertTestLocation(
			deltaClient,
			deltaId,
			`NullFilter Loc ${suffix}`
		);
		locationIds.push(locationId);

		const sessionId = await insertTestSession(deltaClient, locationId, date);
		sessionIds.push(sessionId);

		const birdId = await insertTestBird(deltaClient, resightRing, robinId);
		birdIds.push(birdId);

		resightingEncounterId = await insertTestEncounter(
			deltaClient,
			birdId,
			sessionId,
			{
				age_code: 4,
				record_type: 'D',
				weight: 10,
				wing_length: 50
			}
		);
	});

	afterAll(() => {
		execSync(
			`psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c '` +
				`DELETE FROM "Encounters" WHERE bird_id IN (${birdIds.join(', ')});` +
				`DELETE FROM "Birds" WHERE id IN (${birdIds.join(', ')});` +
				`DELETE FROM "Sessions" WHERE id IN (${sessionIds.join(', ')});` +
				`DELETE FROM "Locations" WHERE id IN (${locationIds.join(', ')});'`
		);
	});

	// Structure
	it('from_date/to_date/species/ringing_group all NULL still excludes resighting rows for the whole table', async () => {
		const { data, error } = await deltaClient
			.rpc('stats_raw_encounters', {})
			.eq('ring_no', resightRing);
		expect(error).toBeNull();
		// Even with no filters, the 'D' resighting encounter never surfaces; the bird
		// remains as a single encounter_id IS NULL row.
		expect(data).toHaveLength(1);
		expect(data![0].encounter_id).toBeNull();
		expect(data!.some((r) => r.encounter_id === resightingEncounterId)).toBe(
			false
		);
	});
});
