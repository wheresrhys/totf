/**
 * Integration tests for the `stats_per_day_and_species` Postgres RPC function.
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
import { resolveAlphaBetaGammaClients } from './helpers/group-clients';

describe('stats_per_day_and_species', () => {
	let alphaId: number;
	let betaId: number;
	let gammaId: number;
	let alphaClient: SupabaseClient;
	let betaClient: SupabaseClient;
	let gammaClient: SupabaseClient;

	beforeAll(async () => {
		({ alphaId, betaId, gammaId, alphaClient, betaClient, gammaClient } =
			await resolveAlphaBetaGammaClients());
	});

	it('returns encounter count, weighed birds count and weight extremes per day and species', async () => {
		// Seed 2021-06-20: ARRETRAP (Robin, 18.5) and AWREN001 (Wren, 9.0).
		const { data, error } = await alphaClient.rpc('stats_per_day_and_species', {
			ringing_group_filter: alphaId
		});
		expect(error).toBeNull();
		const dayRows = data!.filter((row) => row.visit_date === '2021-06-20');
		expect(dayRows).toHaveLength(2);
		expect(dayRows).toContainEqual({
			species_name: 'Robin',
			visit_date: '2021-06-20',
			encounter_count: 1,
			juv_count: 0,
			postjuv_count: 1,
			pullus_count: 0,
			weighed_birds_count: 1,
			min_weight: 18.5,
			max_weight: 18.5
		});
		expect(dayRows).toContainEqual({
			species_name: 'Wren',
			visit_date: '2021-06-20',
			encounter_count: 1,
			juv_count: 0,
			postjuv_count: 1,
			pullus_count: 0,
			weighed_birds_count: 1,
			min_weight: 9,
			max_weight: 9
		});
	});

	it('aggregates multiple weighed encounters on one day into a single row', async () => {
		// Seed 2022-06-15 Robins: 19.0, 17.2, 16.5, 20.5, 19.5, 17.0 — six encounters.
		const { data, error } = await alphaClient.rpc('stats_per_day_and_species', {
			ringing_group_filter: alphaId
		});
		expect(error).toBeNull();
		const robinRow = data!.find(
			(row) => row.visit_date === '2022-06-15' && row.species_name === 'Robin'
		);
		expect(robinRow).toEqual({
			species_name: 'Robin',
			visit_date: '2022-06-15',
			encounter_count: 6,
			juv_count: 0,
			postjuv_count: 3,
			pullus_count: 0,
			weighed_birds_count: 6,
			min_weight: 16.5,
			max_weight: 20.5
		});
	});

	it("excludes other groups' data", async () => {
		// Beta's only session is 2023-06-01 (two Chaffinches + its own SHARED01
		// Robin encounter). None of Alpha's sessions appear despite Alpha→Beta
		// sharing, because both Encounters and Sessions are group-filtered.
		const { data, error } = await betaClient.rpc('stats_per_day_and_species', {
			ringing_group_filter: betaId
		});
		expect(error).toBeNull();
		expect(data).toHaveLength(2);
		expect(data).toContainEqual({
			species_name: 'Chaffinch',
			visit_date: '2023-06-01',
			encounter_count: 2,
			juv_count: 0,
			postjuv_count: 2,
			pullus_count: 0,
			weighed_birds_count: 2,
			min_weight: 18.5,
			max_weight: 20
		});
		expect(data).toContainEqual({
			species_name: 'Robin',
			visit_date: '2023-06-01',
			encounter_count: 1,
			juv_count: 0,
			postjuv_count: 0,
			pullus_count: 0,
			weighed_birds_count: 1,
			min_weight: 18.5,
			max_weight: 18.5
		});
	});

	it('returns no rows for a group with no encounters', async () => {
		const { data, error } = await gammaClient.rpc('stats_per_day_and_species', {
			ringing_group_filter: gammaId
		});
		expect(error).toBeNull();
		expect(data).toHaveLength(0);
	});

	describe('unweighed encounters', () => {
		// Seed encounters all carry a weight, so insert Delta-group encounters
		// (one weighed, two unweighed) across two sessions and clean up after.
		let deltaId: number;
		let deltaClient: SupabaseClient;
		let locationId: number;
		let sessionIds: number[];
		let birdIds: number[];
		let visitDates: string[];

		beforeAll(async () => {
			deltaId = await getGroupIdByName('Delta');
			deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);

			const testSuffix = randomTestSuffix();
			// Randomised so concurrent test runs (separate worktrees, same shared local
			// Supabase instance) never combine their rows into the same
			// stats_per_day_and_species aggregate row.
			const firstVisitDate = randomFutureDate();
			visitDates = [firstVisitDate, addDays(firstVisitDate, 1)];

			const { data: species } = await supabase
				.from('Species')
				.select('id')
				.eq('species_name', 'Robin')
				.single();

			const { data: location, error: locationError } = await deltaClient
				.from('Locations')
				.insert({
					location_name: `Stats Per Day Test Location ${testSuffix}`,
					ringing_group_id: deltaId
				})
				.select('id')
				.single();
			if (locationError) throw locationError;
			locationId = location!.id;

			const sessions = await Promise.all(
				visitDates.map((visitDate) =>
					deltaClient
						.from('Sessions')
						.insert({ visit_date: visitDate, location_id: locationId })
						.select('id')
						.single()
				)
			);
			sessions.forEach(({ error }) => {
				if (error) throw error;
			});
			sessionIds = sessions.map(({ data }) => data!.id);

			const birds = await Promise.all(
				[
					`STATSTEST1-${testSuffix}`,
					`STATSTEST2-${testSuffix}`,
					`STATSTEST3-${testSuffix}`
				].map((ringNo) =>
					deltaClient
						.from('Birds')
						.insert({ ring_no: ringNo, species_id: species!.id })
						.select('id')
						.single()
				)
			);
			birds.forEach(({ error }) => {
				if (error) throw error;
			});
			birdIds = birds.map(({ data }) => data!.id);

			const baseEncounter = {
				capture_time: '10:00:00',
				scheme: 'BTO',
				sex: 'M',
				age_code: 1,
				record_type: 'N'
			};
			const { error: encountersError } = await deltaClient
				.from('Encounters')
				.insert([
					// visitDates[0]: one weighed + one unweighed encounter
					{
						...baseEncounter,
						bird_id: birdIds[0],
						session_id: sessionIds[0],
						weight: 15
					},
					{
						...baseEncounter,
						bird_id: birdIds[1],
						session_id: sessionIds[0]
					},
					// visitDates[1]: only an unweighed encounter
					{ ...baseEncounter, bird_id: birdIds[2], session_id: sessionIds[1] }
				]);
			if (encountersError) throw encountersError;
		});

		afterAll(() => {
			execSync(
				`psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c '` +
					`DELETE FROM "Encounters" WHERE bird_id IN (${birdIds.join(', ')});` +
					`DELETE FROM "Birds" WHERE id IN (${birdIds.join(', ')});` +
					`DELETE FROM "Sessions" WHERE id IN (${sessionIds.join(', ')});` +
					`DELETE FROM "Locations" WHERE id = ${locationId};'`
			);
		});

		it('counts unweighed encounters in encounter_count but not weighed_birds_count', async () => {
			const { data, error } = await deltaClient.rpc(
				'stats_per_day_and_species',
				{
					ringing_group_filter: deltaId
				}
			);
			expect(error).toBeNull();
			expect(data!.find((row) => row.visit_date === visitDates[0])).toEqual({
				species_name: 'Robin',
				visit_date: visitDates[0],
				encounter_count: 2,
				juv_count: 0,
				postjuv_count: 0,
				pullus_count: 2,
				weighed_birds_count: 1,
				min_weight: 15,
				max_weight: 15
			});
		});

		it('returns null weight extremes and zero weighed_birds_count for a day with only unweighed encounters', async () => {
			const { data, error } = await deltaClient.rpc(
				'stats_per_day_and_species',
				{
					ringing_group_filter: deltaId
				}
			);
			expect(error).toBeNull();
			expect(data!.find((row) => row.visit_date === visitDates[1])).toEqual({
				species_name: 'Robin',
				visit_date: visitDates[1],
				encounter_count: 1,
				juv_count: 0,
				postjuv_count: 0,
				pullus_count: 1,
				weighed_birds_count: 0,
				min_weight: null,
				max_weight: null
			});
		});
	});

	describe('juvenile encounters', () => {
		// Seed encounters carry no juveniles, so insert Delta-group encounters
		// (three juvenile + two adult Robins on one day) and clean up after.
		let deltaId: number;
		let deltaClient: SupabaseClient;
		let locationId: number;
		let sessionId: number;
		let birdIds: number[];
		let visitDate: string;

		beforeAll(async () => {
			deltaId = await getGroupIdByName('Delta');
			deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);

			const testSuffix = randomTestSuffix();
			// Randomised so concurrent test runs (separate worktrees, same shared local
			// Supabase instance) never combine their rows into the same
			// stats_per_day_and_species aggregate row.
			visitDate = randomFutureDate();

			const { data: species } = await supabase
				.from('Species')
				.select('id')
				.eq('species_name', 'Robin')
				.single();

			const { data: location, error: locationError } = await deltaClient
				.from('Locations')
				.insert({
					location_name: `Juv Stats Test Location ${testSuffix}`,
					ringing_group_id: deltaId
				})
				.select('id')
				.single();
			if (locationError) throw locationError;
			locationId = location!.id;

			const { data: session, error: sessionError } = await deltaClient
				.from('Sessions')
				.insert({ visit_date: visitDate, location_id: locationId })
				.select('id')
				.single();
			if (sessionError) throw sessionError;
			sessionId = session!.id;

			const birds = await Promise.all(
				[
					`JUVTEST1-${testSuffix}`,
					`JUVTEST2-${testSuffix}`,
					`JUVTEST3-${testSuffix}`,
					`JUVTEST4-${testSuffix}`,
					`JUVTEST5-${testSuffix}`
				].map((ringNo) =>
					deltaClient
						.from('Birds')
						.insert({ ring_no: ringNo, species_id: species!.id })
						.select('id')
						.single()
				)
			);
			birds.forEach(({ error }) => {
				if (error) throw error;
			});
			birdIds = birds.map(({ data }) => data!.id);

			const baseEncounter = {
				capture_time: '10:00:00',
				scheme: 'BTO',
				sex: 'M',
				age_code: 1,
				record_type: 'N',
				session_id: sessionId
			};
			const { error: encountersError } = await deltaClient
				.from('Encounters')
				.insert([
					{ ...baseEncounter, bird_id: birdIds[0], is_juv: true },
					{ ...baseEncounter, bird_id: birdIds[1], is_juv: true },
					{ ...baseEncounter, bird_id: birdIds[2], is_juv: true },
					{ ...baseEncounter, bird_id: birdIds[3], is_juv: false },
					{ ...baseEncounter, bird_id: birdIds[4], is_juv: false }
				]);
			if (encountersError) throw encountersError;
		});

		afterAll(() => {
			execSync(
				`psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c '` +
					`DELETE FROM "Encounters" WHERE bird_id IN (${birdIds.join(', ')});` +
					`DELETE FROM "Birds" WHERE id IN (${birdIds.join(', ')});` +
					`DELETE FROM "Sessions" WHERE id = ${sessionId};` +
					`DELETE FROM "Locations" WHERE id = ${locationId};'`
			);
		});

		it('counts only juvenile encounters in juv_count, all encounters in encounter_count', async () => {
			const { data, error } = await deltaClient.rpc(
				'stats_per_day_and_species',
				{
					ringing_group_filter: deltaId
				}
			);
			expect(error).toBeNull();
			const row = data!.find((row) => row.visit_date === visitDate);
			expect(row).toMatchObject({
				species_name: 'Robin',
				visit_date: visitDate,
				encounter_count: 5,
				juv_count: 3
			});
		});
	});

	describe('juv_count/postjuv_count/pullus_count age-class split', () => {
		// Mirrors getAgeClass() in app/models/encounter.ts (#527): juv = age 1 or 3 with
		// is_juv true (1J/3J), postjuv = bare age 3 (is_juv false), pullus = age 1 with
		// is_juv false. Insert one Delta-group Robin encounter per bucket, plus an age-5
		// (adult) encounter with is_juv true to guard against the old "any is_juv truthy"
		// bug re-appearing, and clean up after.
		let deltaId: number;
		let deltaClient: SupabaseClient;
		let locationId: number;
		let sessionId: number;
		let birdIds: number[];
		let visitDate: string;

		beforeAll(async () => {
			deltaId = await getGroupIdByName('Delta');
			deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);

			const testSuffix = randomTestSuffix();
			// Randomised so concurrent test runs (separate worktrees, same shared local
			// Supabase instance) never combine their rows into the same
			// stats_per_day_and_species aggregate row.
			visitDate = randomFutureDate();

			const { data: species } = await supabase
				.from('Species')
				.select('id')
				.eq('species_name', 'Robin')
				.single();

			const { data: location, error: locationError } = await deltaClient
				.from('Locations')
				.insert({
					location_name: `Age Class Stats Test Location ${testSuffix}`,
					ringing_group_id: deltaId
				})
				.select('id')
				.single();
			if (locationError) throw locationError;
			locationId = location!.id;

			const { data: session, error: sessionError } = await deltaClient
				.from('Sessions')
				.insert({ visit_date: visitDate, location_id: locationId })
				.select('id')
				.single();
			if (sessionError) throw sessionError;
			sessionId = session!.id;

			const birds = await Promise.all(
				[
					`AGECLASSTEST1-${testSuffix}`, // age 1, is_juv true (1J) -> juv
					`AGECLASSTEST2-${testSuffix}`, // age 3, is_juv true (3J) -> juv
					`AGECLASSTEST3-${testSuffix}`, // age 1, is_juv false (pulli) -> pullus
					`AGECLASSTEST4-${testSuffix}`, // age 3, is_juv false (bare 3) -> postjuv
					`AGECLASSTEST5-${testSuffix}` // age 5, is_juv true -> none of the three
				].map((ringNo) =>
					deltaClient
						.from('Birds')
						.insert({ ring_no: ringNo, species_id: species!.id })
						.select('id')
						.single()
				)
			);
			birds.forEach(({ error }) => {
				if (error) throw error;
			});
			birdIds = birds.map(({ data }) => data!.id);

			const baseEncounter = {
				capture_time: '10:00:00',
				scheme: 'BTO',
				sex: 'M',
				record_type: 'N',
				session_id: sessionId
			};
			const { error: encountersError } = await deltaClient
				.from('Encounters')
				.insert([
					{
						...baseEncounter,
						bird_id: birdIds[0],
						age_code: 1,
						is_juv: true
					},
					{
						...baseEncounter,
						bird_id: birdIds[1],
						age_code: 3,
						is_juv: true
					},
					{
						...baseEncounter,
						bird_id: birdIds[2],
						age_code: 1,
						is_juv: false
					},
					{
						...baseEncounter,
						bird_id: birdIds[3],
						age_code: 3,
						is_juv: false
					},
					{ ...baseEncounter, bird_id: birdIds[4], age_code: 5, is_juv: true }
				]);
			if (encountersError) throw encountersError;
		});

		afterAll(() => {
			execSync(
				`psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c '` +
					`DELETE FROM "Encounters" WHERE bird_id IN (${birdIds.join(', ')});` +
					`DELETE FROM "Birds" WHERE id IN (${birdIds.join(', ')});` +
					`DELETE FROM "Sessions" WHERE id = ${sessionId};` +
					`DELETE FROM "Locations" WHERE id = ${locationId};'`
			);
		});

		async function fetchRow() {
			const { data, error } = await deltaClient.rpc(
				'stats_per_day_and_species',
				{
					ringing_group_filter: deltaId
				}
			);
			expect(error).toBeNull();
			const row = data!.find((row) => row.visit_date === visitDate);
			if (!row) throw new Error(`No row found for visit_date ${visitDate}`);
			return row;
		}

		describe('juv_count', () => {
			it('counts an age-1 encounter with is_juv true (1J)', async () => {
				const row = await fetchRow();
				expect(row.juv_count).toBeGreaterThanOrEqual(1);
			});

			it('counts an age-3 encounter with is_juv true (3J)', async () => {
				const row = await fetchRow();
				// Both the 1J and 3J encounters land in juv_count.
				expect(row.juv_count).toBe(2);
			});

			it('excludes an age-1 encounter with is_juv false (pulli) — counted in pullus_count instead', async () => {
				const row = await fetchRow();
				expect(row.juv_count).toBe(2);
				expect(row.pullus_count).toBe(1);
			});

			it('excludes an age-3 encounter with is_juv false (bare 3) — counted in postjuv_count instead', async () => {
				const row = await fetchRow();
				expect(row.juv_count).toBe(2);
				expect(row.postjuv_count).toBe(1);
			});

			it('excludes non-1/3 age codes even when is_juv is true', async () => {
				const row = await fetchRow();
				// AGECLASSTEST5 is age 5 with is_juv true — must not inflate juv_count.
				expect(row.juv_count).toBe(2);
			});

			it('aggregates a mix of juv and non-juv encounters on the same day/species into one row', async () => {
				const row = await fetchRow();
				expect(row).toMatchObject({
					species_name: 'Robin',
					visit_date: visitDate,
					encounter_count: 5,
					juv_count: 2,
					postjuv_count: 1,
					pullus_count: 1
				});
			});
		});

		describe('postjuv_count', () => {
			it('counts a bare age-3 encounter (is_juv false)', async () => {
				const row = await fetchRow();
				expect(row.postjuv_count).toBe(1);
			});

			it('excludes an age-3 encounter with is_juv true (3J) — counted in juv_count instead', async () => {
				const row = await fetchRow();
				expect(row.postjuv_count).toBe(1);
				expect(row.juv_count).toBe(2);
			});

			it('excludes non-3 age codes', async () => {
				const row = await fetchRow();
				// Only AGECLASSTEST4 (age 3, is_juv false) counts — age 1 and age 5
				// encounters, regardless of is_juv, are excluded.
				expect(row.postjuv_count).toBe(1);
			});

			it('aggregates a mix of postjuv and juv encounters on the same day/species into separate columns on one row', async () => {
				const row = await fetchRow();
				expect(row).toMatchObject({
					species_name: 'Robin',
					visit_date: visitDate,
					juv_count: 2,
					postjuv_count: 1
				});
			});
		});

		describe('pullus_count', () => {
			it('counts an age-1 encounter with is_juv false (pulli)', async () => {
				const row = await fetchRow();
				expect(row.pullus_count).toBe(1);
			});

			it('excludes an age-1 encounter with is_juv true — counted in juv_count instead', async () => {
				const row = await fetchRow();
				expect(row.pullus_count).toBe(1);
				expect(row.juv_count).toBe(2);
			});

			it('excludes non-1 age codes', async () => {
				const row = await fetchRow();
				// Only AGECLASSTEST3 (age 1, is_juv false) counts — age 3 and age 5
				// encounters, regardless of is_juv, are excluded.
				expect(row.pullus_count).toBe(1);
			});

			it('aggregates alongside juv_count and postjuv_count on the same day/species row', async () => {
				const row = await fetchRow();
				expect(row).toMatchObject({
					species_name: 'Robin',
					visit_date: visitDate,
					encounter_count: 5,
					juv_count: 2,
					postjuv_count: 1,
					pullus_count: 1
				});
			});
		});
	});

	describe('non-FULL_GROWN sessions (FIELD_OBSERVATION and PULLI)', () => {
		// stats_per_day_and_species is entirely day-level, so any non-FULL_GROWN
		// Sessions row (FIELD_OBSERVATION or PULLI) must contribute no rows at all.
		// Insert Delta-group fixtures across four dates: for each of FIELD_OBSERVATION
		// and PULLI, one date whose only session is that type, and one date carrying
		// both a FULL_GROWN ringing session and a same-date/location session of that type.
		let deltaId: number;
		let deltaClient: SupabaseClient;
		let locationId: number;
		let birdIds: number[];
		let fieldObsOnlyDate: string;
		let fieldObsMixedDate: string;
		let pulliOnlyDate: string;
		let pulliMixedDate: string;

		async function insertSession(
			visitDate: string,
			sessionType: 'FULL_GROWN' | 'FIELD_OBSERVATION' | 'PULLI'
		): Promise<number> {
			const { data, error } = await deltaClient
				.from('Sessions')
				.insert({
					visit_date: visitDate,
					location_id: locationId,
					session_type: sessionType
				})
				.select('id')
				.single();
			if (error) throw error;
			return data!.id;
		}

		beforeAll(async () => {
			deltaId = await getGroupIdByName('Delta');
			deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);

			const testSuffix = randomTestSuffix();
			// Randomised, on distinct dates, so concurrent worktree runs against the
			// shared local Supabase instance never combine their rows into the same
			// stats_per_day_and_species aggregate row.
			const base = randomFutureDate();
			fieldObsOnlyDate = base;
			fieldObsMixedDate = addDays(base, 1);
			pulliOnlyDate = addDays(base, 2);
			pulliMixedDate = addDays(base, 3);

			const { data: species } = await supabase
				.from('Species')
				.select('id')
				.eq('species_name', 'Robin')
				.single();

			const { data: location, error: locationError } = await deltaClient
				.from('Locations')
				.insert({
					location_name: `NonFG Stats Test Location ${testSuffix}`,
					ringing_group_id: deltaId
				})
				.select('id')
				.single();
			if (locationError) throw locationError;
			locationId = location!.id;

			const fieldObsOnlySessionId = await insertSession(
				fieldObsOnlyDate,
				'FIELD_OBSERVATION'
			);
			const fieldObsRealSessionId = await insertSession(
				fieldObsMixedDate,
				'FULL_GROWN'
			);
			const fieldObsMixedTwinId = await insertSession(
				fieldObsMixedDate,
				'FIELD_OBSERVATION'
			);
			const pulliOnlySessionId = await insertSession(pulliOnlyDate, 'PULLI');
			const pulliRealSessionId = await insertSession(
				pulliMixedDate,
				'FULL_GROWN'
			);
			const pulliMixedTwinId = await insertSession(pulliMixedDate, 'PULLI');

			const birds = await Promise.all(
				[
					`NFGSTAT1-${testSuffix}`,
					`NFGSTAT2-${testSuffix}`,
					`NFGSTAT3-${testSuffix}`,
					`NFGSTAT4-${testSuffix}`,
					`NFGSTAT5-${testSuffix}`,
					`NFGSTAT6-${testSuffix}`,
					`NFGSTAT7-${testSuffix}`,
					`NFGSTAT8-${testSuffix}`
				].map((ringNo) =>
					deltaClient
						.from('Birds')
						.insert({ ring_no: ringNo, species_id: species!.id })
						.select('id')
						.single()
				)
			);
			birds.forEach(({ error }) => {
				if (error) throw error;
			});
			birdIds = birds.map(({ data }) => data!.id);

			const baseEncounter = {
				capture_time: '10:00:00',
				scheme: 'BTO',
				sex: 'M',
				age_code: 1,
				weight: 15
			};
			const { error: encountersError } = await deltaClient
				.from('Encounters')
				.insert([
					// fieldObsOnlyDate: only a passive field-observation (C) encounter.
					{
						...baseEncounter,
						bird_id: birdIds[0],
						session_id: fieldObsOnlySessionId,
						record_type: 'C'
					},
					// fieldObsMixedDate FULL_GROWN session: two proper ringing (N) encounters.
					{
						...baseEncounter,
						bird_id: birdIds[1],
						session_id: fieldObsRealSessionId,
						record_type: 'N'
					},
					{
						...baseEncounter,
						bird_id: birdIds[2],
						session_id: fieldObsRealSessionId,
						record_type: 'N'
					},
					// fieldObsMixedDate FIELD_OBSERVATION session: a passive observation on the
					// same date/location that must not merge into the FULL_GROWN session's row.
					{
						...baseEncounter,
						bird_id: birdIds[3],
						session_id: fieldObsMixedTwinId,
						record_type: 'D'
					},
					// pulliOnlyDate: only a PULLI new-ring (N) encounter.
					{
						...baseEncounter,
						bird_id: birdIds[4],
						session_id: pulliOnlySessionId,
						record_type: 'N'
					},
					// pulliMixedDate FULL_GROWN session: two proper ringing (N) encounters.
					{
						...baseEncounter,
						bird_id: birdIds[5],
						session_id: pulliRealSessionId,
						record_type: 'N'
					},
					{
						...baseEncounter,
						bird_id: birdIds[6],
						session_id: pulliRealSessionId,
						record_type: 'N'
					},
					// pulliMixedDate PULLI session: a pulli ringing (N) on the same
					// date/location that must not merge into the FULL_GROWN session's row.
					{
						...baseEncounter,
						bird_id: birdIds[7],
						session_id: pulliMixedTwinId,
						record_type: 'N'
					}
				]);
			if (encountersError) throw encountersError;
		});

		afterAll(() => {
			execSync(
				`psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c '` +
					`DELETE FROM "Encounters" WHERE bird_id IN (${birdIds.join(', ')});` +
					`DELETE FROM "Birds" WHERE id IN (${birdIds.join(', ')});` +
					`DELETE FROM "Sessions" WHERE location_id = ${locationId};` +
					`DELETE FROM "Locations" WHERE id = ${locationId};'`
			);
		});

		it('excludes a FIELD_OBSERVATION session entirely, returning no rows for a date whose only session is FIELD_OBSERVATION', async () => {
			const { data, error } = await deltaClient.rpc(
				'stats_per_day_and_species',
				{
					ringing_group_filter: deltaId
				}
			);
			expect(error).toBeNull();
			expect(
				data!.filter((row) => row.visit_date === fieldObsOnlyDate)
			).toHaveLength(0);
		});

		it('excludes a PULLI session entirely, returning no rows for a date whose only session is PULLI', async () => {
			const { data, error } = await deltaClient.rpc(
				'stats_per_day_and_species',
				{
					ringing_group_filter: deltaId
				}
			);
			expect(error).toBeNull();
			expect(
				data!.filter((row) => row.visit_date === pulliOnlyDate)
			).toHaveLength(0);
		});

		it('returns rows only for the FULL_GROWN session when a FULL_GROWN and a FIELD_OBSERVATION session share the same date and location', async () => {
			const { data, error } = await deltaClient.rpc(
				'stats_per_day_and_species',
				{
					ringing_group_filter: deltaId
				}
			);
			expect(error).toBeNull();
			const mixedRows = data!.filter(
				(row) => row.visit_date === fieldObsMixedDate
			);
			expect(mixedRows).toHaveLength(1);
			// encounter_count is 2 (the two FULL_GROWN N encounters), not 3 — the
			// FIELD_OBSERVATION on the same date/location is excluded.
			expect(mixedRows[0]).toMatchObject({
				species_name: 'Robin',
				visit_date: fieldObsMixedDate,
				encounter_count: 2
			});
		});

		it('returns rows only for the FULL_GROWN session when a FULL_GROWN and a PULLI session share the same date and location', async () => {
			const { data, error } = await deltaClient.rpc(
				'stats_per_day_and_species',
				{
					ringing_group_filter: deltaId
				}
			);
			expect(error).toBeNull();
			const mixedRows = data!.filter(
				(row) => row.visit_date === pulliMixedDate
			);
			expect(mixedRows).toHaveLength(1);
			// encounter_count is 2 (the two FULL_GROWN N encounters), not 3 — the PULLI
			// ringing on the same date/location is excluded.
			expect(mixedRows[0]).toMatchObject({
				species_name: 'Robin',
				visit_date: pulliMixedDate,
				encounter_count: 2
			});
		});
	});
});
