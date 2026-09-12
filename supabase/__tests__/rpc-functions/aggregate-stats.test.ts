/**
 * Integration tests for the `aggregate_stats` Postgres RPC function.
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
import { getGroupIdByName } from './helpers/seed-lookups';
import { resolveAlphaBetaGammaClients } from './helpers/group-clients';
import {
	ALPHA_TOTAL_BIRDS,
	PER_SPECIES_AGGREGATES,
	ARRETRAP_DATES
} from './helpers/alpha-seed-constants';

// Seed has 9 Alpha sessions: 2021-06-20, 2022-04-30, 2022-06-15, 2022-08-10,
// 2022-10-20, 2023-05-12, 2023-07-08, 2023-09-14, 2024-05-10
const ALPHA_SESSION_COUNT = 9;
const ALPHA_TOTAL_ENCOUNTERS = 57;
const ALPHA_SPECIES_COUNT = 5; // Blue Tit, Kingfisher, Reed Warbler, Robin, Wren
const CES_2022_ENCOUNTERS = 30; // Apr–Aug 2022 only

describe('aggregate_stats', () => {
	let alphaId: number;
	let alphaClient: SupabaseClient;

	beforeAll(async () => {
		({ alphaId, alphaClient } = await resolveAlphaBetaGammaClients());
	});

	it('no filters returns total aggregate across all alpha data', async () => {
		const { data, error } = await alphaClient.rpc('aggregate_stats', {
			ringing_group_filter: alphaId
		});
		expect(error).toBeNull();
		expect(data).toHaveLength(1);
		const row = data![0];
		expect(row.species_name).toBeNull();
		expect(row.time_period).toBeNull();
		expect(row.session_count).toBe(ALPHA_SESSION_COUNT);
		expect(row.encounter_count).toBe(ALPHA_TOTAL_ENCOUNTERS);
		expect(row.bird_count).toBe(ALPHA_TOTAL_BIRDS);
		expect(row.species_count).toBe(ALPHA_SPECIES_COUNT);
	});

	it('species_name_filter=Robin returns single Robin aggregate', async () => {
		const { data, error } = await alphaClient.rpc('aggregate_stats', {
			ringing_group_filter: alphaId,
			species_name_filter: 'Robin'
		});
		expect(error).toBeNull();
		expect(data).toHaveLength(1);
		const row = data![0];
		expect(row.encounter_count).toBe(
			PER_SPECIES_AGGREGATES['Robin'].encounter_count
		);
		expect(row.bird_count).toBe(PER_SPECIES_AGGREGATES['Robin'].bird_count);
		expect(row.species_count).toBe(1);
	});

	it('date range Apr–Aug 2022 (CES months) returns 30 encounters', async () => {
		const { data, error } = await alphaClient.rpc('aggregate_stats', {
			ringing_group_filter: alphaId,
			from_date: '2022-04-01',
			to_date: '2022-08-31'
		});
		expect(error).toBeNull();
		expect(data![0].encounter_count).toBe(CES_2022_ENCOUNTERS);
	});

	it('group_by_species returns one row per species with correct counts', async () => {
		const { data, error } = await alphaClient.rpc('aggregate_stats', {
			ringing_group_filter: alphaId,
			group_by_species: true
		});
		expect(error).toBeNull();
		expect(data).toHaveLength(ALPHA_SPECIES_COUNT);
		const sorted = data!
			.slice()
			.sort((a, b) => a.species_name.localeCompare(b.species_name));
		expect(
			sorted.map((r) => ({
				sp: r.species_name,
				enc: r.encounter_count,
				birds: r.bird_count
			}))
		).toEqual(
			Object.entries(PER_SPECIES_AGGREGATES)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([sp, { encounter_count, bird_count }]) => ({
					sp,
					enc: encounter_count,
					birds: bird_count
				}))
		);
	});

	it('group_by_time_period=month returns one row per month (36 months Jun 2021–May 2024)', async () => {
		const { data, error } = await alphaClient.rpc('aggregate_stats', {
			ringing_group_filter: alphaId,
			group_by_time_period: 'month'
		});
		expect(error).toBeNull();
		expect(data).toHaveLength(36);
		const apr2022 = data!.find((r) => r.time_period === '2022-04-01');
		expect(apr2022!.encounter_count).toBe(11);
		expect(data!.every((r) => r.time_period !== null)).toBe(true);
	});

	it('group_by_time_period=year returns one row per year with correct totals', async () => {
		const { data, error } = await alphaClient.rpc('aggregate_stats', {
			ringing_group_filter: alphaId,
			group_by_time_period: 'year'
		});
		expect(error).toBeNull();
		expect(data).toHaveLength(4);
		const byYear = Object.fromEntries(
			data!.map((r) => [
				new Date(r.time_period).getFullYear(),
				r.encounter_count
			])
		);
		expect(byYear).toEqual({ 2021: 2, 2022: 35, 2023: 15, 2024: 5 });
	});

	describe('non-FULL_GROWN sessions (FIELD_OBSERVATION and PULLI)', () => {
		// aggregate_stats derives its day/session-level statistics — session_count,
		// effort, and the per-session encounter aggregates — only from FULL_GROWN
		// sessions; FIELD_OBSERVATION and PULLI sessions are excluded from those, but
		// their encounters still count toward the per-species/per-bird totals. PULLI
		// differs from FIELD_OBSERVATION in that it can carry new-ring (record_type =
		// 'N') encounters, so excluding it from session stats must NOT remove those
		// birds from new_bird_count. Fixtures are Delta-group, on random far-future
		// dates, and every query is bounded by an explicit date range so it only ever
		// sees this test's rows (never seed or concurrent-run data).
		let deltaId: number;
		let deltaClient: SupabaseClient;
		let robinId: number;
		let wrenId: number;
		let fieldObsLocationId: number;
		let fieldObsOnlyLocationId: number;
		let pulliLocationId: number;
		let birdIds: number[];
		// FIELD_OBSERVATION mixed range: two FULL_GROWN sessions plus FIELD_OBSERVATION
		// sessions (one sharing a date/location with a FULL_GROWN session, one standalone).
		let fieldObsFrom: string;
		let fieldObsTo: string;
		// FIELD_OBSERVATION-only range: a single FIELD_OBSERVATION session, nothing else.
		let fieldObsOnlyDate: string;
		// PULLI mixed range: mirrors the FIELD_OBSERVATION range but with PULLI sessions.
		let pulliFrom: string;
		let pulliTo: string;
		// PULLI-only range: a single PULLI session, nothing else.
		let pulliOnlyDate: string;

		async function getSpeciesId(name: string): Promise<number> {
			const { data, error } = await supabase
				.from('Species')
				.select('id')
				.eq('species_name', name)
				.single();
			if (error || !data) throw new Error(`Species "${name}" not found`);
			return data.id;
		}

		async function insertSession(
			locationId: number,
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

		async function insertBird(
			ringNo: string,
			speciesId: number
		): Promise<number> {
			const { data, error } = await deltaClient
				.from('Birds')
				.insert({ ring_no: ringNo, species_id: speciesId })
				.select('id')
				.single();
			if (error) throw error;
			return data!.id;
		}

		// Query the single whole-period aggregate row for a bounded date range.
		async function aggregateRow(fromDate: string, toDate: string) {
			const { data, error } = await deltaClient.rpc('aggregate_stats', {
				ringing_group_filter: deltaId,
				from_date: fromDate,
				to_date: toDate
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			return data![0];
		}

		beforeAll(async () => {
			deltaId = await getGroupIdByName('Delta');
			deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);
			robinId = await getSpeciesId('Robin');
			wrenId = await getSpeciesId('Wren');

			const testSuffix = randomTestSuffix();
			const base = randomFutureDate();
			// FIELD_OBSERVATION scenario dates.
			const fo1 = base; // FULL_GROWN session (+ a same-date/location FIELD_OBSERVATION)
			const fo2 = addDays(base, 1); // second FULL_GROWN session
			const fo3 = addDays(base, 2); // standalone FIELD_OBSERVATION session
			fieldObsFrom = fo1;
			fieldObsTo = fo3;
			fieldObsOnlyDate = addDays(base, 100); // disjoint from the mixed range
			// PULLI scenario dates (disjoint from the FIELD_OBSERVATION ranges).
			const pu1 = addDays(base, 200); // FULL_GROWN session (+ a same-date/location PULLI)
			const pu2 = addDays(base, 201); // second FULL_GROWN session
			const pu3 = addDays(base, 202); // standalone PULLI session
			pulliFrom = pu1;
			pulliTo = pu3;
			pulliOnlyDate = addDays(base, 300); // disjoint from the PULLI mixed range

			const [fieldObsLocation, fieldObsOnlyLocation, pulliLocation] =
				await Promise.all([
					deltaClient
						.from('Locations')
						.insert({
							location_name: `NonFG Agg FieldObs ${testSuffix}`,
							ringing_group_id: deltaId
						})
						.select('id')
						.single(),
					deltaClient
						.from('Locations')
						.insert({
							location_name: `NonFG Agg FieldObsOnly ${testSuffix}`,
							ringing_group_id: deltaId
						})
						.select('id')
						.single(),
					deltaClient
						.from('Locations')
						.insert({
							location_name: `NonFG Agg Pulli ${testSuffix}`,
							ringing_group_id: deltaId
						})
						.select('id')
						.single()
				]);
			if (fieldObsLocation.error) throw fieldObsLocation.error;
			if (fieldObsOnlyLocation.error) throw fieldObsOnlyLocation.error;
			if (pulliLocation.error) throw pulliLocation.error;
			fieldObsLocationId = fieldObsLocation.data!.id;
			fieldObsOnlyLocationId = fieldObsOnlyLocation.data!.id;
			pulliLocationId = pulliLocation.data!.id;

			// FIELD_OBSERVATION scenario sessions.
			const foReal1 = await insertSession(
				fieldObsLocationId,
				fo1,
				'FULL_GROWN'
			);
			const foTwin = await insertSession(
				fieldObsLocationId,
				fo1,
				'FIELD_OBSERVATION'
			); // same date/loc as foReal1
			const foReal2 = await insertSession(
				fieldObsLocationId,
				fo2,
				'FULL_GROWN'
			);
			const foStandalone = await insertSession(
				fieldObsLocationId,
				fo3,
				'FIELD_OBSERVATION'
			);
			const foOnly = await insertSession(
				fieldObsOnlyLocationId,
				fieldObsOnlyDate,
				'FIELD_OBSERVATION'
			);
			// PULLI scenario sessions.
			const puReal1 = await insertSession(pulliLocationId, pu1, 'FULL_GROWN');
			const puTwin = await insertSession(pulliLocationId, pu1, 'PULLI'); // same date/loc as puReal1
			const puReal2 = await insertSession(pulliLocationId, pu2, 'FULL_GROWN');
			const puStandalone = await insertSession(pulliLocationId, pu3, 'PULLI');
			const puOnly = await insertSession(
				pulliLocationId,
				pulliOnlyDate,
				'PULLI'
			);

			const [
				b1,
				b2,
				b3,
				b4,
				b5,
				b6,
				b7,
				b8,
				b9,
				b10,
				b11,
				b12,
				b13,
				b14,
				b15,
				b16
			] = await Promise.all([
				insertBird(`RAGG-FO-N1-${testSuffix}`, robinId),
				insertBird(`RAGG-FO-N2-${testSuffix}`, robinId),
				insertBird(`RAGG-FO-N3-${testSuffix}`, robinId),
				insertBird(`RAGG-FO-N4-${testSuffix}`, robinId),
				insertBird(`RAGG-FO-W1-${testSuffix}`, wrenId),
				insertBird(`RAGG-FO-W2-${testSuffix}`, wrenId),
				insertBird(`RAGG-FO-W3-${testSuffix}`, wrenId),
				insertBird(`RAGG-FO-W4-${testSuffix}`, wrenId),
				insertBird(`RAGG-PU-N1-${testSuffix}`, robinId),
				insertBird(`RAGG-PU-N2-${testSuffix}`, robinId),
				insertBird(`RAGG-PU-N3-${testSuffix}`, robinId),
				insertBird(`RAGG-PU-N4-${testSuffix}`, robinId),
				insertBird(`RAGG-PU-W1-${testSuffix}`, wrenId),
				insertBird(`RAGG-PU-W2-${testSuffix}`, wrenId),
				insertBird(`RAGG-PU-W3-${testSuffix}`, wrenId),
				insertBird(`RAGG-PU-W4-${testSuffix}`, wrenId)
			]);
			birdIds = [
				b1,
				b2,
				b3,
				b4,
				b5,
				b6,
				b7,
				b8,
				b9,
				b10,
				b11,
				b12,
				b13,
				b14,
				b15,
				b16
			];

			const base_ = { scheme: 'BTO', sex: 'M', age_code: 1 };
			const { error: encountersError } = await deltaClient
				.from('Encounters')
				.insert([
					// --- FIELD_OBSERVATION scenario ---
					// foReal1 (fo1): three new (N) Robin encounters spanning 09:00–12:00 → 3h effort.
					{
						...base_,
						bird_id: b1,
						session_id: foReal1,
						record_type: 'N',
						capture_time: '09:00:00'
					},
					{
						...base_,
						bird_id: b2,
						session_id: foReal1,
						record_type: 'N',
						capture_time: '10:00:00'
					},
					{
						...base_,
						bird_id: b3,
						session_id: foReal1,
						record_type: 'N',
						capture_time: '12:00:00'
					},
					// foReal2 (fo2): one new (N) Robin encounter → clamped to 2h minimum effort.
					{
						...base_,
						bird_id: b4,
						session_id: foReal2,
						record_type: 'N',
						capture_time: '10:00:00'
					},
					// foTwin (fo1, same location): a passive field observation (C) Wren — an early
					// capture_time that must NOT stretch foReal1's effort span.
					{
						...base_,
						bird_id: b5,
						session_id: foTwin,
						record_type: 'C',
						capture_time: '05:00:00'
					},
					// foStandalone (fo3): a passive field observation (D) Wren on its own date.
					{
						...base_,
						bird_id: b6,
						session_id: foStandalone,
						record_type: 'D',
						capture_time: '20:00:00'
					},
					// foOnly range: two passive field observations (C) Wrens, nothing else.
					{
						...base_,
						bird_id: b7,
						session_id: foOnly,
						record_type: 'C',
						capture_time: '08:00:00'
					},
					{
						...base_,
						bird_id: b8,
						session_id: foOnly,
						record_type: 'C',
						capture_time: '09:00:00'
					},
					// --- PULLI scenario (mirrors the above, but PULLI encounters are new-ring N) ---
					// puReal1 (pu1): three new (N) Robin encounters spanning 09:00–12:00 → 3h effort.
					{
						...base_,
						bird_id: b9,
						session_id: puReal1,
						record_type: 'N',
						capture_time: '09:00:00'
					},
					{
						...base_,
						bird_id: b10,
						session_id: puReal1,
						record_type: 'N',
						capture_time: '10:00:00'
					},
					{
						...base_,
						bird_id: b11,
						session_id: puReal1,
						record_type: 'N',
						capture_time: '12:00:00'
					},
					// puReal2 (pu2): one new (N) Robin encounter → clamped to 2h minimum effort.
					{
						...base_,
						bird_id: b12,
						session_id: puReal2,
						record_type: 'N',
						capture_time: '10:00:00'
					},
					// puTwin (pu1, same location): a PULLI new-ring (N) Wren — an early capture_time
					// that must NOT stretch puReal1's effort span, but DOES count in new_bird_count.
					{
						...base_,
						bird_id: b13,
						session_id: puTwin,
						record_type: 'N',
						capture_time: '05:00:00'
					},
					// puStandalone (pu3): a PULLI new-ring (N) Wren on its own date.
					{
						...base_,
						bird_id: b14,
						session_id: puStandalone,
						record_type: 'N',
						capture_time: '20:00:00'
					},
					// puOnly range: two PULLI new-ring (N) Wrens, nothing else.
					{
						...base_,
						bird_id: b15,
						session_id: puOnly,
						record_type: 'N',
						capture_time: '08:00:00'
					},
					{
						...base_,
						bird_id: b16,
						session_id: puOnly,
						record_type: 'N',
						capture_time: '09:00:00'
					}
				]);
			if (encountersError) throw encountersError;
		});

		afterAll(() => {
			execSync(
				`psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c '` +
					`DELETE FROM "Encounters" WHERE bird_id IN (${birdIds.join(', ')});` +
					`DELETE FROM "Birds" WHERE id IN (${birdIds.join(', ')});` +
					`DELETE FROM "Sessions" WHERE location_id IN (${fieldObsLocationId}, ${fieldObsOnlyLocationId}, ${pulliLocationId});` +
					`DELETE FROM "Locations" WHERE id IN (${fieldObsLocationId}, ${fieldObsOnlyLocationId}, ${pulliLocationId});'`
			);
		});

		describe('FIELD_OBSERVATION excluded from day/session-level stats', () => {
			it('excludes a FIELD_OBSERVATION session from session_count', async () => {
				const row = await aggregateRow(fieldObsFrom, fieldObsTo);
				// Two FULL_GROWN session dates (fo1, fo2); the standalone FIELD_OBSERVATION
				// date (fo3) and the fo1 FIELD_OBSERVATION twin contribute nothing.
				expect(row.session_count).toBe(2);
			});

			it("excludes a FIELD_OBSERVATION session's duration from total_effort and effort_per_session", async () => {
				const row = await aggregateRow(fieldObsFrom, fieldObsTo);
				// foReal1 span = 3h, foReal2 clamped to 2h → 5h total over 2 sessions.
				// The FIELD_OBSERVATION twin's 05:00 capture does not stretch any FULL_GROWN span.
				expect(row.total_effort).toBe('05:00:00');
				expect(row.effort_per_session).toBe('02:30:00');
			});

			it('excludes a FIELD_OBSERVATION session from avg_encounters_per_session and max_per_session', async () => {
				const row = await aggregateRow(fieldObsFrom, fieldObsTo);
				// FULL_GROWN per-session Robin counts: 3 and 1 → avg 2, max 3.
				expect(row.avg_encounters_per_session).toBe(2);
				expect(row.max_per_session).toBe(3);
			});

			it('excludes a FIELD_OBSERVATION session from max_new_per_session', async () => {
				const row = await aggregateRow(fieldObsFrom, fieldObsTo);
				// New (N) encounters per FULL_GROWN session: 3 and 1 → max 3.
				expect(row.max_new_per_session).toBe(3);
			});
		});

		describe('FIELD_OBSERVATION unaffected per-species/per-bird totals', () => {
			it("still counts a FIELD_OBSERVATION session's encounters in species_count, bird_count and encounter_count", async () => {
				const row = await aggregateRow(fieldObsFrom, fieldObsTo);
				// Robin (4 FULL_GROWN) + Wren (2 FIELD_OBSERVATION) across 6 birds / 6 encounters.
				expect(row.species_count).toBe(2);
				expect(row.bird_count).toBe(6);
				expect(row.encounter_count).toBe(6);
			});

			it('leaves new_bird_count unaffected since FIELD_OBSERVATION record_types are never N', async () => {
				const row = await aggregateRow(fieldObsFrom, fieldObsTo);
				// Only the four N Robins are new; the C/D Wren field observations never are.
				expect(row.new_bird_count).toBe(4);
			});
		});

		describe('FIELD_OBSERVATION edge cases', () => {
			it('counts a FULL_GROWN and a same-date/location FIELD_OBSERVATION session as one session, not two', async () => {
				// Restrict to fo1 only, where a FULL_GROWN and a FIELD_OBSERVATION session
				// share the date/location. session_count is 1 (the FULL_GROWN one), never 2.
				const row = await aggregateRow(fieldObsFrom, fieldObsFrom);
				expect(row.session_count).toBe(1);
				// The FIELD_OBSERVATION Wren still shows up in the per-species totals for that day.
				expect(row.species_count).toBe(2);
				expect(row.encounter_count).toBe(4);
			});

			it('returns session_count=0 and zero effort but a nonzero encounter_count for a range of only FIELD_OBSERVATION sessions', async () => {
				const row = await aggregateRow(fieldObsOnlyDate, fieldObsOnlyDate);
				expect(row.session_count).toBe(0);
				expect(row.total_effort).toBe('00:00:00');
				expect(row.encounter_count).toBe(2);
			});
		});

		describe('PULLI excluded from day/session-level stats', () => {
			it('excludes a PULLI session from session_count', async () => {
				const row = await aggregateRow(pulliFrom, pulliTo);
				// Two FULL_GROWN session dates (pu1, pu2); the standalone PULLI date (pu3)
				// and the pu1 PULLI twin contribute nothing.
				expect(row.session_count).toBe(2);
			});

			it("excludes a PULLI session's duration from total_effort and effort_per_session", async () => {
				const row = await aggregateRow(pulliFrom, pulliTo);
				// puReal1 span = 3h, puReal2 clamped to 2h → 5h total over 2 sessions.
				// The PULLI twin's 05:00 capture does not stretch any FULL_GROWN span.
				expect(row.total_effort).toBe('05:00:00');
				expect(row.effort_per_session).toBe('02:30:00');
			});

			it('excludes a PULLI session from avg_encounters_per_session and max_per_session', async () => {
				const row = await aggregateRow(pulliFrom, pulliTo);
				// FULL_GROWN per-session Robin counts: 3 and 1 → avg 2, max 3.
				expect(row.avg_encounters_per_session).toBe(2);
				expect(row.max_per_session).toBe(3);
			});

			it('excludes a PULLI session from max_new_per_session', async () => {
				const row = await aggregateRow(pulliFrom, pulliTo);
				// New (N) encounters per FULL_GROWN session: 3 and 1 → max 3. The PULLI
				// sessions' own N encounters are excluded from the per-session aggregate.
				expect(row.max_new_per_session).toBe(3);
			});
		});

		describe('PULLI unaffected per-species/per-bird totals', () => {
			it("still counts a PULLI session's encounters in species_count, bird_count and encounter_count", async () => {
				const row = await aggregateRow(pulliFrom, pulliTo);
				// Robin (4 FULL_GROWN) + Wren (2 PULLI) across 6 birds / 6 encounters.
				expect(row.species_count).toBe(2);
				expect(row.bird_count).toBe(6);
				expect(row.encounter_count).toBe(6);
			});

			it("counts a PULLI session's N encounters in new_bird_count, exactly as FULL_GROWN ones", async () => {
				const row = await aggregateRow(pulliFrom, pulliTo);
				// All six birds are new-ring (N): the four FULL_GROWN Robins plus the two
				// PULLI Wrens (puTwin, puStandalone). PULLI's exclusion from session stats
				// must not drop its N encounters from new_bird_count.
				expect(row.new_bird_count).toBe(6);
			});
		});

		describe('PULLI edge cases', () => {
			it('counts a FULL_GROWN and a same-date/location PULLI session as one session, not two', async () => {
				// Restrict to pu1 only, where a FULL_GROWN and a PULLI session share the
				// date/location. session_count is 1 (the FULL_GROWN one), never 2.
				const row = await aggregateRow(pulliFrom, pulliFrom);
				expect(row.session_count).toBe(1);
				// The PULLI Wren still shows up in the per-species totals for that day.
				expect(row.species_count).toBe(2);
				expect(row.encounter_count).toBe(4);
			});

			it('returns session_count=0 and zero effort but a nonzero encounter_count for a range of only PULLI sessions', async () => {
				const row = await aggregateRow(pulliOnlyDate, pulliOnlyDate);
				expect(row.session_count).toBe(0);
				expect(row.total_effort).toBe('00:00:00');
				expect(row.encounter_count).toBe(2);
			});
		});
	});

	describe('age bucketing (pullus_bird_count / juv_bird_count / postjuv_bird_count / adult_bird_count / unknown_age_bird_count)', () => {
		// getAgeClass() in app/models/encounter.ts (#527) defines the single-encounter
		// age classes this bird-level bucketing aggregates. The two bird-level
		// precedence rules have no single-encounter equivalent: pullus always wins (a
		// bird with any pullus reading is pullus, even against a conflicting adult
		// reading), and otherwise juv wins over postjuv. Each bird gets its own
		// visit_date so an ungrouped from=to=date query returns an aggregate row
		// covering exactly that one bird — all randomised per run so concurrent
		// worktrees (shared local Supabase) never combine rows.
		let deltaId: number;
		let deltaClient: SupabaseClient;
		const locationIds: number[] = [];
		const sessionIds: number[] = [];
		const birdIds: number[] = [];
		let base: string;
		const dates: Record<string, string> = {};
		let emptyDate: string;
		let speciesDate: string;
		let tpJuvDate: string;
		let tpAdultDate: string;

		// Bare age-3 (postjuv), 3J (juv), 1J (juv), age-1-no-juv (pullus), age >3 (adult).
		const AGE1J = { age_code: 1, is_juv: true };
		const AGE3J = { age_code: 3, is_juv: true };
		const PULLUS = { age_code: 1, is_juv: false };
		const POSTJUV = { age_code: 3, is_juv: false };
		const ADULT = { age_code: 4, is_juv: false };
		const AGE2 = { age_code: 2, is_juv: false };

		beforeAll(async () => {
			deltaId = await getGroupIdByName('Delta');
			deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);

			const testSuffix = randomTestSuffix();
			base = randomFutureDate();
			emptyDate = addDays(base, 500);
			speciesDate = addDays(base, 13);
			tpJuvDate = addDays(base, 300);
			tpAdultDate = addDays(base, 340);

			const { data: robin } = await supabase
				.from('Species')
				.select('id')
				.eq('species_name', 'Robin')
				.single();
			const { data: wren } = await supabase
				.from('Species')
				.select('id')
				.eq('species_name', 'Wren')
				.single();

			// Two locations so a single bird's two (conflicting) encounters on the same
			// date can live in two distinct sessions — Sessions is unique on
			// (visit_date, location_id, session_type) and Encounters on (bird_id,
			// session_id). Both sessions are FULL_GROWN, so both encounters still count.
			for (let i = 0; i < 2; i++) {
				const { data: location, error: locationError } = await deltaClient
					.from('Locations')
					.insert({
						location_name: `Age Bucket Test Location ${testSuffix}-${i}`,
						ringing_group_id: deltaId
					})
					.select('id')
					.single();
				if (locationError) throw locationError;
				locationIds.push(location!.id);
			}

			// One shared session per (date, location), reused across birds on that date.
			const sessionCache = new Map<string, number>();
			async function getSession(date: string, locationId: number) {
				const key = `${date}|${locationId}`;
				const cached = sessionCache.get(key);
				if (cached !== undefined) return cached;
				const { data: session, error: sessionError } = await deltaClient
					.from('Sessions')
					.insert({ visit_date: date, location_id: locationId })
					.select('id')
					.single();
				if (sessionError) throw sessionError;
				sessionCache.set(key, session!.id);
				sessionIds.push(session!.id);
				return session!.id;
			}

			let ringCounter = 0;
			async function addBird(
				date: string,
				speciesId: number,
				encounters: Array<{
					age_code: number;
					is_juv: boolean;
					record_type: string;
				}>
			) {
				const { data: bird, error: birdError } = await deltaClient
					.from('Birds')
					.insert({
						ring_no: `BKT-${testSuffix}-${ringCounter++}`,
						species_id: speciesId
					})
					.select('id')
					.single();
				if (birdError) throw birdError;
				birdIds.push(bird!.id);

				const rows = [];
				for (let i = 0; i < encounters.length; i++) {
					const sessionId = await getSession(date, locationIds[i]);
					rows.push({
						capture_time: '10:00:00',
						scheme: 'BTO',
						sex: 'M',
						session_id: sessionId,
						bird_id: bird!.id,
						...encounters[i]
					});
				}
				const { error: encountersError } = await deltaClient
					.from('Encounters')
					.insert(rows);
				if (encountersError) throw encountersError;
			}

			// Single-bucket birds, each on its own date.
			dates.pullusOnly = addDays(base, 0);
			await addBird(dates.pullusOnly, robin!.id, [
				{ ...PULLUS, record_type: 'N' }
			]);
			dates.juv1J = addDays(base, 1);
			await addBird(dates.juv1J, robin!.id, [{ ...AGE1J, record_type: 'N' }]);
			dates.juv3J = addDays(base, 2);
			await addBird(dates.juv3J, robin!.id, [{ ...AGE3J, record_type: 'N' }]);
			dates.postjuvOnly = addDays(base, 3);
			await addBird(dates.postjuvOnly, robin!.id, [
				{ ...POSTJUV, record_type: 'N' }
			]);
			dates.adultOnly = addDays(base, 4);
			await addBird(dates.adultOnly, robin!.id, [
				{ ...ADULT, record_type: 'R' }
			]);
			dates.onlyTwo = addDays(base, 5);
			await addBird(dates.onlyTwo, robin!.id, [{ ...AGE2, record_type: 'R' }]);

			// Conflict birds resolving via the precedence rules.
			dates.juvWinsPostjuv = addDays(base, 6);
			await addBird(dates.juvWinsPostjuv, robin!.id, [
				{ ...POSTJUV, record_type: 'R' },
				{ ...AGE3J, record_type: 'R' }
			]);
			dates.juvPlusAdult = addDays(base, 7);
			await addBird(dates.juvPlusAdult, robin!.id, [
				{ ...AGE1J, record_type: 'R' },
				{ ...ADULT, record_type: 'R' }
			]);
			dates.postjuvPlusAdult = addDays(base, 8);
			await addBird(dates.postjuvPlusAdult, robin!.id, [
				{ ...POSTJUV, record_type: 'R' },
				{ ...ADULT, record_type: 'R' }
			]);
			dates.pullusPlusAdult = addDays(base, 9);
			await addBird(dates.pullusPlusAdult, robin!.id, [
				{ ...PULLUS, record_type: 'R' },
				{ ...ADULT, record_type: 'R' }
			]);
			dates.pullusPlusJuv = addDays(base, 10);
			await addBird(dates.pullusPlusJuv, robin!.id, [
				{ ...PULLUS, record_type: 'R' },
				{ ...AGE1J, record_type: 'R' }
			]);

			// group_by_species isolation: a Robin juv and a Wren juv on the same date.
			await addBird(speciesDate, robin!.id, [{ ...AGE1J, record_type: 'N' }]);
			await addBird(speciesDate, wren!.id, [{ ...AGE1J, record_type: 'N' }]);

			// group_by_time_period isolation: a juv in one month, an adult ~40 days later
			// (guaranteed a different month), well clear of the base window.
			await addBird(tpJuvDate, robin!.id, [{ ...AGE1J, record_type: 'N' }]);
			await addBird(tpAdultDate, robin!.id, [{ ...ADULT, record_type: 'R' }]);
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

		// An ungrouped single-date aggregate row (covers exactly the one bird on `date`).
		async function bucketRow(date: string) {
			const { data, error } = await deltaClient.rpc('aggregate_stats', {
				ringing_group_filter: deltaId,
				from_date: date,
				to_date: date
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			return data![0];
		}

		const monthOf = (date: string) => `${date.slice(0, 7)}-01`;

		// Usual
		it('a bird with only a pullus-indicating encounter (age_code 1, is_juv false) counts in pullus_bird_count, not juv_bird_count, postjuv_bird_count, adult_bird_count or unknown_age_bird_count', async () => {
			const row = await bucketRow(dates.pullusOnly);
			expect(row).toMatchObject({
				bird_count: 1,
				pullus_bird_count: 1,
				juv_bird_count: 0,
				postjuv_bird_count: 0,
				adult_bird_count: 0,
				unknown_age_bird_count: 0
			});
		});

		it('a bird with only a juv-indicating encounter (age_code 1, is_juv true) counts in juv_bird_count, not pullus_bird_count, postjuv_bird_count, adult_bird_count or unknown_age_bird_count', async () => {
			const row = await bucketRow(dates.juv1J);
			expect(row).toMatchObject({
				bird_count: 1,
				pullus_bird_count: 0,
				juv_bird_count: 1,
				postjuv_bird_count: 0,
				adult_bird_count: 0,
				unknown_age_bird_count: 0
			});
		});

		it('a bird with only a postjuv-indicating encounter (bare age_code 3, is_juv false) counts in postjuv_bird_count, not pullus_bird_count, juv_bird_count, adult_bird_count or unknown_age_bird_count', async () => {
			const row = await bucketRow(dates.postjuvOnly);
			expect(row).toMatchObject({
				bird_count: 1,
				pullus_bird_count: 0,
				juv_bird_count: 0,
				postjuv_bird_count: 1,
				adult_bird_count: 0,
				unknown_age_bird_count: 0
			});
		});

		it('a bird with only an adult-indicating encounter (age_code > 3, e.g. 4) counts in adult_bird_count, not pullus_bird_count, juv_bird_count, postjuv_bird_count or unknown_age_bird_count', async () => {
			const row = await bucketRow(dates.adultOnly);
			expect(row).toMatchObject({
				bird_count: 1,
				pullus_bird_count: 0,
				juv_bird_count: 0,
				postjuv_bird_count: 0,
				adult_bird_count: 1,
				unknown_age_bird_count: 0
			});
		});

		// Structure — one test per bucket-defining branch
		it('a bird with only age_code=2 encounters counts in unknown_age_bird_count, not any other bucket', async () => {
			const row = await bucketRow(dates.onlyTwo);
			expect(row).toMatchObject({
				bird_count: 1,
				pullus_bird_count: 0,
				juv_bird_count: 0,
				postjuv_bird_count: 0,
				adult_bird_count: 0,
				unknown_age_bird_count: 1
			});
		});

		it('a bird recorded as both bare age-3 and 3J in the same group counts in juv_bird_count, not postjuv_bird_count — juv wins over postjuv', async () => {
			const row = await bucketRow(dates.juvWinsPostjuv);
			expect(row).toMatchObject({
				bird_count: 1,
				juv_bird_count: 1,
				postjuv_bird_count: 0
			});
		});

		it('a bird with both a juv-indicating and an adult-indicating encounter in the same group counts in unknown_age_bird_count', async () => {
			const row = await bucketRow(dates.juvPlusAdult);
			expect(row).toMatchObject({
				bird_count: 1,
				juv_bird_count: 0,
				adult_bird_count: 0,
				unknown_age_bird_count: 1
			});
		});

		it('a bird with both a postjuv-indicating and an adult-indicating encounter in the same group counts in unknown_age_bird_count', async () => {
			const row = await bucketRow(dates.postjuvPlusAdult);
			expect(row).toMatchObject({
				bird_count: 1,
				postjuv_bird_count: 0,
				adult_bird_count: 0,
				unknown_age_bird_count: 1
			});
		});

		it('a bird with both a pullus-indicating and an adult-indicating encounter in the same group counts in pullus_bird_count, not unknown_age_bird_count — pullus always wins', async () => {
			const row = await bucketRow(dates.pullusPlusAdult);
			expect(row).toMatchObject({
				bird_count: 1,
				pullus_bird_count: 1,
				adult_bird_count: 0,
				unknown_age_bird_count: 0
			});
		});

		it('a bird with both a pullus-indicating and a juv-indicating encounter in the same group counts in pullus_bird_count, not juv_bird_count — pullus always wins', async () => {
			const row = await bucketRow(dates.pullusPlusJuv);
			expect(row).toMatchObject({
				bird_count: 1,
				pullus_bird_count: 1,
				juv_bird_count: 0
			});
		});

		it('age_code=1 (is_juv true) and age_code=3+is_juv=true both count toward juv_bird_count identically', async () => {
			const oneJ = await bucketRow(dates.juv1J);
			const threeJ = await bucketRow(dates.juv3J);
			expect(oneJ.juv_bird_count).toBe(1);
			expect(threeJ.juv_bird_count).toBe(1);
			expect(oneJ.bird_count).toBe(1);
			expect(threeJ.bird_count).toBe(1);
		});

		// Edge
		it('pullus_bird_count + juv_bird_count + postjuv_bird_count + adult_bird_count + unknown_age_bird_count equals bird_count for a mixed-bucket group', async () => {
			const { data, error } = await deltaClient.rpc('aggregate_stats', {
				ringing_group_filter: deltaId,
				from_date: base,
				to_date: addDays(base, 13)
			});
			expect(error).toBeNull();
			const row = data![0];
			// The window holds all five buckets, so this is genuinely mixed.
			expect(row.pullus_bird_count).toBeGreaterThan(0);
			expect(row.juv_bird_count).toBeGreaterThan(0);
			expect(row.postjuv_bird_count).toBeGreaterThan(0);
			expect(row.adult_bird_count).toBeGreaterThan(0);
			expect(row.unknown_age_bird_count).toBeGreaterThan(0);
			expect(
				row.pullus_bird_count +
					row.juv_bird_count +
					row.postjuv_bird_count +
					row.adult_bird_count +
					row.unknown_age_bird_count
			).toBe(row.bird_count);
		});

		it('an empty group (no encounters) returns zero for pullus_bird_count, juv_bird_count, postjuv_bird_count, adult_bird_count and unknown_age_bird_count', async () => {
			const row = await bucketRow(emptyDate);
			expect(row).toMatchObject({
				bird_count: 0,
				pullus_bird_count: 0,
				juv_bird_count: 0,
				postjuv_bird_count: 0,
				adult_bird_count: 0,
				unknown_age_bird_count: 0
			});
		});

		it("bucket counts respect group_by_species — a juv bird of species A is not counted in species B's row", async () => {
			const { data, error } = await deltaClient.rpc('aggregate_stats', {
				ringing_group_filter: deltaId,
				group_by_species: true,
				from_date: speciesDate,
				to_date: speciesDate
			});
			expect(error).toBeNull();
			const robinRow = data!.find((r) => r.species_name === 'Robin');
			const wrenRow = data!.find((r) => r.species_name === 'Wren');
			expect(robinRow!.juv_bird_count).toBe(1);
			expect(wrenRow!.juv_bird_count).toBe(1);
		});

		it("bucket counts respect group_by_time_period — a juv bird recorded only in month M is not counted in an adjacent month's row", async () => {
			const { data, error } = await deltaClient.rpc('aggregate_stats', {
				ringing_group_filter: deltaId,
				group_by_time_period: 'month',
				from_date: tpJuvDate,
				to_date: tpAdultDate
			});
			expect(error).toBeNull();
			const juvMonth = data!.find((r) => r.time_period === monthOf(tpJuvDate));
			const adultMonth = data!.find(
				(r) => r.time_period === monthOf(tpAdultDate)
			);
			expect(juvMonth!.juv_bird_count).toBe(1);
			expect(adultMonth!.juv_bird_count).toBe(0);
			expect(adultMonth!.adult_bird_count).toBe(1);
		});

		// *_bird_count / *_enc_count sibling columns (#601). The *_bird_count columns
		// are true copies of the deprecated ambiguous bird-level columns; the *_enc_count
		// columns are a purely per-encounter cut, so a bird whose encounters span
		// different ages contributes to more than one *_enc_count bucket.
		describe('*_bird_count / *_enc_count sibling columns', () => {
			// Usual — with nothing multi-encounter to diverge on, the two cuts coincide.
			it('for a window of only single-encounter birds, every *_bird_count equals its *_enc_count sibling for every age bucket', async () => {
				// base+0..base+5 holds six single-encounter birds spanning all five
				// buckets (pullus/juv/juv/postjuv/adult/unknown); none has >1 encounter.
				const { data, error } = await deltaClient.rpc('aggregate_stats', {
					ringing_group_filter: deltaId,
					from_date: dates.pullusOnly,
					to_date: dates.onlyTwo
				});
				expect(error).toBeNull();
				const row = data![0];
				expect(row.pullus_bird_count).toBe(row.pullus_enc_count);
				expect(row.juv_bird_count).toBe(row.juv_enc_count);
				expect(row.postjuv_bird_count).toBe(row.postjuv_enc_count);
				expect(row.adult_bird_count).toBe(row.adult_enc_count);
				expect(row.unknown_age_bird_count).toBe(row.unknown_age_enc_count);
				// Sanity: the window genuinely covers multiple buckets.
				expect(row.bird_count).toBe(6);
			});

			// Edge — a bird ringed as pullus then retrapped as adult: bird-based resolves
			// it to a single bucket (pullus wins), encounter-based splits it across both.
			it('a pullus-then-adult bird counts once in pullus_bird_count (adult_bird_count 0) but increments both pullus_enc_count and adult_enc_count', async () => {
				const row = await bucketRow(dates.pullusPlusAdult);
				expect(row.bird_count).toBe(1);
				expect(row.encounter_count).toBe(2);
				// Bird-based: single resolved bucket (pullus always wins).
				expect(row.pullus_bird_count).toBe(1);
				expect(row.adult_bird_count).toBe(0);
				// Encounter-based: one encounter in each bucket.
				expect(row.pullus_enc_count).toBe(1);
				expect(row.adult_enc_count).toBe(1);
			});

			// Edge — a juv-then-adult bird: bird-based resolves to unknown (no precedence
			// between juv and adult), encounter-based still splits across the two buckets.
			it('a juv-then-adult bird resolves to unknown_age_bird_count but increments both juv_enc_count and adult_enc_count', async () => {
				const row = await bucketRow(dates.juvPlusAdult);
				expect(row.bird_count).toBe(1);
				expect(row.unknown_age_bird_count).toBe(1);
				expect(row.juv_bird_count).toBe(0);
				expect(row.adult_bird_count).toBe(0);
				expect(row.juv_enc_count).toBe(1);
				expect(row.adult_enc_count).toBe(1);
			});

			// Edge — negative check: the New family gets no encounter-based sibling at
			// all, guarding against a future PR accidentally reintroducing them.
			it('the returned row shape has no new_enc_count or new_young_enc_count column', async () => {
				const row = await bucketRow(dates.pullusOnly);
				expect(row).not.toHaveProperty('new_enc_count');
				expect(row).not.toHaveProperty('new_young_enc_count');
			});

			// Edge — negative check: the deprecated ambiguous columns dropped in #607 must
			// not reappear, catching a forgotten SELECT entry.
			it('the returned row shape has none of the deprecated ambiguous age-bucket columns', async () => {
				const row = await bucketRow(dates.pullusOnly);
				expect(row).not.toHaveProperty('pullus_count');
				expect(row).not.toHaveProperty('juv_count');
				expect(row).not.toHaveProperty('postjuv_count');
				expect(row).not.toHaveProperty('adult_count');
				expect(row).not.toHaveProperty('unknown_age_count');
				expect(row).not.toHaveProperty('new_young_count');
			});
		});
	});

	describe('group_by_time_period=day', () => {
		// Alpha's 9 seed sessions (read-only): 2021-06-20, 2022-04-30, 2022-06-15,
		// 2022-08-10, 2022-10-20, 2023-05-12, 2023-07-08, 2023-09-14, 2024-05-10.
		// Usual
		it("returns one row per distinct visit date, matching Alpha's known session dates", async () => {
			const { data, error } = await alphaClient.rpc('aggregate_stats', {
				ringing_group_filter: alphaId,
				group_by_time_period: 'day'
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(ARRETRAP_DATES.length);
			expect(data!.map((r) => r.time_period).sort()).toEqual(
				[...ARRETRAP_DATES].sort()
			);
		});

		it('day-grouped session_count and encounter_count for a given date match the corresponding month-grouped row filtered to that single day', async () => {
			// 2022-04-30 is the only session in April 2022, so its day row and the
			// April 2022 month row must carry identical session/encounter counts.
			const [dayRes, monthRes] = await Promise.all([
				alphaClient.rpc('aggregate_stats', {
					ringing_group_filter: alphaId,
					group_by_time_period: 'day'
				}),
				alphaClient.rpc('aggregate_stats', {
					ringing_group_filter: alphaId,
					group_by_time_period: 'month'
				})
			]);
			expect(dayRes.error).toBeNull();
			expect(monthRes.error).toBeNull();
			const dayRow = dayRes.data!.find((r) => r.time_period === '2022-04-30');
			const monthRow = monthRes.data!.find(
				(r) => r.time_period === '2022-04-01'
			);
			expect(dayRow!.session_count).toBe(monthRow!.session_count);
			expect(dayRow!.encounter_count).toBe(monthRow!.encounter_count);
		});

		// Structure
		it('a date with no session is absent from the results (spine only covers min..max date range, not every calendar day)', async () => {
			const { data, error } = await alphaClient.rpc('aggregate_stats', {
				ringing_group_filter: alphaId,
				group_by_time_period: 'day'
			});
			expect(error).toBeNull();
			// 2022-04-15 falls inside Alpha's date range but has no session.
			expect(data!.find((r) => r.time_period === '2022-04-15')).toBeUndefined();
		});

		// Edge
		it('a date range spanning a single day (from_date = to_date) returns exactly one row', async () => {
			const { data, error } = await alphaClient.rpc('aggregate_stats', {
				ringing_group_filter: alphaId,
				group_by_time_period: 'day',
				from_date: '2022-04-30',
				to_date: '2022-04-30'
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			expect(data![0].time_period).toBe('2022-04-30');
		});

		it('an out-of-range group_by_time_period value (anything other than day/month/year) still falls back to the existing ungrouped NULL time_period behaviour', async () => {
			const { data, error } = await alphaClient.rpc('aggregate_stats', {
				ringing_group_filter: alphaId,
				group_by_time_period: 'week'
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			expect(data![0].time_period).toBeNull();
			expect(data![0].encounter_count).toBe(ALPHA_TOTAL_ENCOUNTERS);
		});
	});

	// #827 removed the 8 wing/weight summary columns from aggregate_stats_result
	// now that biometrics_stats is the sole source for them. These guard that the
	// removal holds across every grouping shape aggregate_stats can return.
	describe('wing/weight columns removed (#827)', () => {
		const REMOVED_BIOMETRIC_COLUMNS = [
			'max_weight',
			'avg_weight',
			'min_weight',
			'median_weight',
			'max_wing',
			'avg_wing',
			'min_wing',
			'median_wing'
		];

		// Usual
		it('the no-filters whole-aggregate row carries none of the 8 wing/weight columns', async () => {
			const { data, error } = await alphaClient.rpc('aggregate_stats', {
				ringing_group_filter: alphaId
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			for (const column of REMOVED_BIOMETRIC_COLUMNS) {
				expect(data![0]).not.toHaveProperty(column);
			}
		});

		// Structure
		it('a group_by_species row carries none of the 8 wing/weight columns', async () => {
			const { data, error } = await alphaClient.rpc('aggregate_stats', {
				ringing_group_filter: alphaId,
				group_by_species: true
			});
			expect(error).toBeNull();
			expect(data!.length).toBeGreaterThan(0);
			for (const row of data!) {
				for (const column of REMOVED_BIOMETRIC_COLUMNS) {
					expect(row).not.toHaveProperty(column);
				}
			}
		});

		// Structure
		it('a group_by_time_period=month row carries none of the 8 wing/weight columns', async () => {
			const { data, error } = await alphaClient.rpc('aggregate_stats', {
				ringing_group_filter: alphaId,
				group_by_time_period: 'month'
			});
			expect(error).toBeNull();
			expect(data!.length).toBeGreaterThan(0);
			for (const row of data!) {
				for (const column of REMOVED_BIOMETRIC_COLUMNS) {
					expect(row).not.toHaveProperty(column);
				}
			}
		});
	});
});
