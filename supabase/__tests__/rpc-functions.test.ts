/**
 * Integration tests for Postgres RPC functions.
 *
 * Requires local Supabase running and e2e seed data loaded:
 *   npm run db:start:local
 *   npm run db:seed:e2e
 *
 * Run with: npm run test:integration
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { execSync } from 'child_process';
import { getAuthenticatedSupabaseClientForGroup } from '../../lib/group-auth';
import { supabase } from '../../lib/supabase';
import { addDays, randomFutureDate, randomTestSuffix } from './test-isolation';
import type { SupabaseClient } from '@supabase/supabase-js';

async function getGroupIdByName(name: string): Promise<number> {
	const { data, error } = await supabase
		.from('RingingGroups')
		.select('id')
		.eq('group_name', name)
		.single();
	if (error || !data) throw new Error(`Group "${name}" not found — run npm run db:seed:e2e first`);
	return data.id;
}

// Locations are RLS-scoped to their owning group, so this must be queried with a
// group-authenticated client rather than the anon `supabase` client used above.
async function getLocationIdByName(
	client: SupabaseClient,
	name: string,
	ringingGroupId: number
): Promise<number> {
	const { data, error } = await client
		.from('Locations')
		.select('id')
		.eq('location_name', name)
		.eq('ringing_group_id', ringingGroupId)
		.single();
	if (error || !data) throw new Error(`Location "${name}" not found — run npm run db:seed:e2e first`);
	return data.id;
}

// Seed has 9 Alpha sessions: 2021-06-20, 2022-04-30, 2022-06-15, 2022-08-10,
// 2022-10-20, 2023-05-12, 2023-07-08, 2023-09-14, 2024-05-10
const ALPHA_SESSION_COUNT = 9;
const ALPHA_TOTAL_ENCOUNTERS = 57;
const ALPHA_TOTAL_BIRDS = 46;
const ALPHA_SPECIES_COUNT = 5; // Blue Tit, Kingfisher, Reed Warbler, Robin, Wren
const CES_2022_ENCOUNTERS = 30; // Apr–Aug 2022 only

// Per-species aggregates for Alpha — reused across multiple tests
const PER_SPECIES_AGGREGATES = {
	'Blue Tit':     { encounter_count: 7,  bird_count: 6  },
	'Kingfisher':   { encounter_count: 2,  bird_count: 1  },
	'Reed Warbler': { encounter_count: 15, bird_count: 15 },
	'Robin':        { encounter_count: 31, bird_count: 23 },
	'Wren':         { encounter_count: 2,  bird_count: 1  },
} as const;

const ARRETRAP_ENCOUNTERS = 9;
const ARRETRAP_DATES = [
	'2021-06-20', '2022-04-30', '2022-06-15', '2022-08-10',
	'2022-10-20', '2023-05-12', '2023-07-08', '2023-09-14', '2024-05-10',
];
const ARRETRAP_PROVEN_AGE = 3;

describe('Postgres RPC integration tests', () => {
	let alphaId: number;
	let betaId: number;
	let gammaId: number;
	let alphaClient: SupabaseClient;
	let betaClient: SupabaseClient;
	let gammaClient: SupabaseClient;

	beforeAll(async () => {
		alphaId = await getGroupIdByName('Alpha');
		betaId = await getGroupIdByName('Beta');
		gammaId = await getGroupIdByName('Gamma');

		[alphaClient, betaClient, gammaClient] = await Promise.all([
			getAuthenticatedSupabaseClientForGroup(alphaId),
			getAuthenticatedSupabaseClientForGroup(betaId),
			getAuthenticatedSupabaseClientForGroup(gammaId),
		]);
	});

	describe('aggregate_stats', () => {
		it('no filters returns total aggregate across all alpha data', async () => {
			const { data, error } = await alphaClient.rpc('aggregate_stats', {
				ringing_group_filter: alphaId,
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
				species_name_filter: 'Robin',
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			const row = data![0];
			expect(row.encounter_count).toBe(PER_SPECIES_AGGREGATES['Robin'].encounter_count);
			expect(row.bird_count).toBe(PER_SPECIES_AGGREGATES['Robin'].bird_count);
			expect(row.species_count).toBe(1);
		});

		it('date range Apr–Aug 2022 (CES months) returns 30 encounters', async () => {
			const { data, error } = await alphaClient.rpc('aggregate_stats', {
				ringing_group_filter: alphaId,
				from_date: '2022-04-01',
				to_date: '2022-08-31',
			});
			expect(error).toBeNull();
			expect(data![0].encounter_count).toBe(CES_2022_ENCOUNTERS);
		});

		it('group_by_species returns one row per species with correct counts', async () => {
			const { data, error } = await alphaClient.rpc('aggregate_stats', {
				ringing_group_filter: alphaId,
				group_by_species: true,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(ALPHA_SPECIES_COUNT);
			const sorted = data!.slice().sort((a, b) => a.species_name.localeCompare(b.species_name));
			expect(
				sorted.map((r) => ({ sp: r.species_name, enc: r.encounter_count, birds: r.bird_count }))
			).toEqual(
				Object.entries(PER_SPECIES_AGGREGATES)
					.sort(([a], [b]) => a.localeCompare(b))
					.map(([sp, { encounter_count, bird_count }]) => ({ sp, enc: encounter_count, birds: bird_count }))
			);
		});

		it('group_by_time_period=month returns one row per month (36 months Jun 2021–May 2024)', async () => {
			const { data, error } = await alphaClient.rpc('aggregate_stats', {
				ringing_group_filter: alphaId,
				group_by_time_period: 'month',
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
				group_by_time_period: 'year',
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(4);
			const byYear = Object.fromEntries(
				data!.map((r) => [new Date(r.time_period).getFullYear(), r.encounter_count])
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

			async function insertBird(ringNo: string, speciesId: number): Promise<number> {
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
					to_date: toDate,
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

				const [fieldObsLocation, fieldObsOnlyLocation, pulliLocation] = await Promise.all([
					deltaClient
						.from('Locations')
						.insert({
							location_name: `NonFG Agg FieldObs ${testSuffix}`,
							ringing_group_id: deltaId,
						})
						.select('id')
						.single(),
					deltaClient
						.from('Locations')
						.insert({
							location_name: `NonFG Agg FieldObsOnly ${testSuffix}`,
							ringing_group_id: deltaId,
						})
						.select('id')
						.single(),
					deltaClient
						.from('Locations')
						.insert({
							location_name: `NonFG Agg Pulli ${testSuffix}`,
							ringing_group_id: deltaId,
						})
						.select('id')
						.single(),
				]);
				if (fieldObsLocation.error) throw fieldObsLocation.error;
				if (fieldObsOnlyLocation.error) throw fieldObsOnlyLocation.error;
				if (pulliLocation.error) throw pulliLocation.error;
				fieldObsLocationId = fieldObsLocation.data!.id;
				fieldObsOnlyLocationId = fieldObsOnlyLocation.data!.id;
				pulliLocationId = pulliLocation.data!.id;

				// FIELD_OBSERVATION scenario sessions.
				const foReal1 = await insertSession(fieldObsLocationId, fo1, 'FULL_GROWN');
				const foTwin = await insertSession(fieldObsLocationId, fo1, 'FIELD_OBSERVATION'); // same date/loc as foReal1
				const foReal2 = await insertSession(fieldObsLocationId, fo2, 'FULL_GROWN');
				const foStandalone = await insertSession(fieldObsLocationId, fo3, 'FIELD_OBSERVATION');
				const foOnly = await insertSession(fieldObsOnlyLocationId, fieldObsOnlyDate, 'FIELD_OBSERVATION');
				// PULLI scenario sessions.
				const puReal1 = await insertSession(pulliLocationId, pu1, 'FULL_GROWN');
				const puTwin = await insertSession(pulliLocationId, pu1, 'PULLI'); // same date/loc as puReal1
				const puReal2 = await insertSession(pulliLocationId, pu2, 'FULL_GROWN');
				const puStandalone = await insertSession(pulliLocationId, pu3, 'PULLI');
				const puOnly = await insertSession(pulliLocationId, pulliOnlyDate, 'PULLI');

				const [b1, b2, b3, b4, b5, b6, b7, b8, b9, b10, b11, b12, b13, b14, b15, b16] =
					await Promise.all([
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
						insertBird(`RAGG-PU-W4-${testSuffix}`, wrenId),
					]);
				birdIds = [b1, b2, b3, b4, b5, b6, b7, b8, b9, b10, b11, b12, b13, b14, b15, b16];

				const base_ = { scheme: 'BTO', sex: 'M', age_code: 1, weight: 15 };
				const { error: encountersError } = await deltaClient
					.from('Encounters')
					.insert([
						// --- FIELD_OBSERVATION scenario ---
						// foReal1 (fo1): three new (N) Robin encounters spanning 09:00–12:00 → 3h effort.
						{ ...base_, bird_id: b1, session_id: foReal1, record_type: 'N', capture_time: '09:00:00' },
						{ ...base_, bird_id: b2, session_id: foReal1, record_type: 'N', capture_time: '10:00:00' },
						{ ...base_, bird_id: b3, session_id: foReal1, record_type: 'N', capture_time: '12:00:00' },
						// foReal2 (fo2): one new (N) Robin encounter → clamped to 2h minimum effort.
						{ ...base_, bird_id: b4, session_id: foReal2, record_type: 'N', capture_time: '10:00:00' },
						// foTwin (fo1, same location): a passive field observation (C) Wren — an early
						// capture_time that must NOT stretch foReal1's effort span.
						{ ...base_, bird_id: b5, session_id: foTwin, record_type: 'C', capture_time: '05:00:00' },
						// foStandalone (fo3): a passive field observation (D) Wren on its own date.
						{ ...base_, bird_id: b6, session_id: foStandalone, record_type: 'D', capture_time: '20:00:00' },
						// foOnly range: two passive field observations (C) Wrens, nothing else.
						{ ...base_, bird_id: b7, session_id: foOnly, record_type: 'C', capture_time: '08:00:00' },
						{ ...base_, bird_id: b8, session_id: foOnly, record_type: 'C', capture_time: '09:00:00' },
						// --- PULLI scenario (mirrors the above, but PULLI encounters are new-ring N) ---
						// puReal1 (pu1): three new (N) Robin encounters spanning 09:00–12:00 → 3h effort.
						{ ...base_, bird_id: b9, session_id: puReal1, record_type: 'N', capture_time: '09:00:00' },
						{ ...base_, bird_id: b10, session_id: puReal1, record_type: 'N', capture_time: '10:00:00' },
						{ ...base_, bird_id: b11, session_id: puReal1, record_type: 'N', capture_time: '12:00:00' },
						// puReal2 (pu2): one new (N) Robin encounter → clamped to 2h minimum effort.
						{ ...base_, bird_id: b12, session_id: puReal2, record_type: 'N', capture_time: '10:00:00' },
						// puTwin (pu1, same location): a PULLI new-ring (N) Wren — an early capture_time
						// that must NOT stretch puReal1's effort span, but DOES count in new_bird_count.
						{ ...base_, bird_id: b13, session_id: puTwin, record_type: 'N', capture_time: '05:00:00' },
						// puStandalone (pu3): a PULLI new-ring (N) Wren on its own date.
						{ ...base_, bird_id: b14, session_id: puStandalone, record_type: 'N', capture_time: '20:00:00' },
						// puOnly range: two PULLI new-ring (N) Wrens, nothing else.
						{ ...base_, bird_id: b15, session_id: puOnly, record_type: 'N', capture_time: '08:00:00' },
						{ ...base_, bird_id: b16, session_id: puOnly, record_type: 'N', capture_time: '09:00:00' },
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

		describe('age bucketing (juv_count / adult_count / unknown_age_count / new_juv_count)', () => {
			// Insert Delta-group birds across distinct random future dates so a single-date
			// (from=to) query sees only this run's rows. Each scenario gets its own date;
			// multi-encounter birds (conflict / new-juv-split) use two locations on one date.
			let deltaId: number;
			let deltaClient: SupabaseClient;
			let robinId: number;
			let blueTitId: number;
			let locationAId: number;
			let locationBId: number;
			const birdIds: number[] = [];
			const sessionIds: number[] = [];

			// Scenario dates.
			let base: string; // dJuv
			let dAdult: string;
			let dNewJuv: string;
			let dOnly2: string;
			let dConflict: string;
			let dJ3: string;
			let dNewJuvSplit: string;
			let dSpecies: string;
			let dMonth2: string;
			let dEmpty: string;

			async function getSpeciesId(name: string): Promise<number> {
				const { data, error } = await supabase
					.from('Species')
					.select('id')
					.eq('species_name', name)
					.single();
				if (error || !data) throw new Error(`Species "${name}" not found`);
				return data.id;
			}

			async function makeSession(locationId: number, visitDate: string): Promise<number> {
				const { data, error } = await deltaClient
					.from('Sessions')
					.insert({ visit_date: visitDate, location_id: locationId })
					.select('id')
					.single();
				if (error) throw error;
				sessionIds.push(data!.id);
				return data!.id;
			}

			async function makeBird(ringNo: string, speciesId: number): Promise<number> {
				const { data, error } = await deltaClient
					.from('Birds')
					.insert({ ring_no: ringNo, species_id: speciesId })
					.select('id')
					.single();
				if (error) throw error;
				birdIds.push(data!.id);
				return data!.id;
			}

			async function makeEncounter(
				birdId: number,
				sessionId: number,
				fields: { age_code: number | null; record_type: string; is_juv?: boolean }
			): Promise<void> {
				const { error } = await deltaClient.from('Encounters').insert({
					bird_id: birdId,
					session_id: sessionId,
					scheme: 'BTO',
					sex: 'M',
					capture_time: '10:00:00',
					age_code: fields.age_code,
					record_type: fields.record_type,
					is_juv: fields.is_juv ?? false,
				});
				if (error) throw error;
			}

			// The single ungrouped whole-group aggregate row for a bounded date range.
			async function bucketRow(fromDate: string, toDate: string) {
				const { data, error } = await deltaClient.rpc('aggregate_stats', {
					ringing_group_filter: deltaId,
					from_date: fromDate,
					to_date: toDate,
				});
				expect(error).toBeNull();
				expect(data).toHaveLength(1);
				return data![0];
			}

			beforeAll(async () => {
				deltaId = await getGroupIdByName('Delta');
				deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);
				robinId = await getSpeciesId('Robin');
				blueTitId = await getSpeciesId('Blue Tit');

				const testSuffix = randomTestSuffix();
				base = randomFutureDate();
				dAdult = addDays(base, 1);
				dNewJuv = addDays(base, 2);
				dOnly2 = addDays(base, 3);
				dConflict = addDays(base, 4);
				dJ3 = addDays(base, 5);
				dNewJuvSplit = addDays(base, 6);
				dSpecies = addDays(base, 7);
				dMonth2 = addDays(base, 45); // guaranteed a different month from the base cluster
				dEmpty = addDays(base, 9000); // far outside any session date

				const [locationA, locationB] = await Promise.all([
					deltaClient
						.from('Locations')
						.insert({ location_name: `AgeBucket A ${testSuffix}`, ringing_group_id: deltaId })
						.select('id')
						.single(),
					deltaClient
						.from('Locations')
						.insert({ location_name: `AgeBucket B ${testSuffix}`, ringing_group_id: deltaId })
						.select('id')
						.single(),
				]);
				if (locationA.error) throw locationA.error;
				if (locationB.error) throw locationB.error;
				locationAId = locationA.data!.id;
				locationBId = locationB.data!.id;

				// dJuv (base): juv-only Robin, retrap (R) so it is NOT new.
				const bJuv = await makeBird(`AB-JUV-${testSuffix}`, robinId);
				await makeEncounter(bJuv, await makeSession(locationAId, base), {
					age_code: 1,
					is_juv: true,
					record_type: 'R',
				});

				// dAdult: adult-only Robin (age_code 4).
				const bAdult = await makeBird(`AB-AD-${testSuffix}`, robinId);
				await makeEncounter(bAdult, await makeSession(locationAId, dAdult), {
					age_code: 4,
					record_type: 'R',
				});

				// dNewJuv: juv Robin ringed new (N).
				const bNewJuv = await makeBird(`AB-NJUV-${testSuffix}`, robinId);
				await makeEncounter(bNewJuv, await makeSession(locationAId, dNewJuv), {
					age_code: 1,
					record_type: 'N',
				});

				// dOnly2: Robin with only an age_code=2 encounter → unknown.
				const bOnly2 = await makeBird(`AB-TWO-${testSuffix}`, robinId);
				await makeEncounter(bOnly2, await makeSession(locationAId, dOnly2), {
					age_code: 2,
					record_type: 'N',
				});

				// dConflict: one Robin with a juv (age 1) and an adult (age 4) encounter on the
				// same date at two locations → conflict → unknown.
				const bConflict = await makeBird(`AB-CONF-${testSuffix}`, robinId);
				await makeEncounter(bConflict, await makeSession(locationAId, dConflict), {
					age_code: 1,
					is_juv: true,
					record_type: 'R',
				});
				await makeEncounter(bConflict, await makeSession(locationBId, dConflict), {
					age_code: 4,
					record_type: 'R',
				});

				// dJ3: two juv Robins — age_code 1 (is_juv true) and age_code 3 (is_juv false).
				const bJ3a = await makeBird(`AB-J3A-${testSuffix}`, robinId);
				const bJ3b = await makeBird(`AB-J3B-${testSuffix}`, robinId);
				const sJ3 = await makeSession(locationAId, dJ3);
				await makeEncounter(bJ3a, sJ3, { age_code: 1, is_juv: true, record_type: 'R' });
				await makeEncounter(bJ3b, sJ3, { age_code: 3, is_juv: false, record_type: 'R' });

				// dNewJuvSplit: one Robin whose juv encounter (age 1, R) and New encounter
				// (age 2, N) are different rows → still juv bucket AND new_juv.
				const bSplit = await makeBird(`AB-SPLIT-${testSuffix}`, robinId);
				await makeEncounter(bSplit, await makeSession(locationAId, dNewJuvSplit), {
					age_code: 1,
					is_juv: true,
					record_type: 'R',
				});
				await makeEncounter(bSplit, await makeSession(locationBId, dNewJuvSplit), {
					age_code: 2,
					record_type: 'N',
				});

				// dSpecies: a juv Robin and a juv Blue Tit for the group_by_species test.
				const sSpecies = await makeSession(locationAId, dSpecies);
				const bSpRobin = await makeBird(`AB-SPR-${testSuffix}`, robinId);
				const bSpBlueTit = await makeBird(`AB-SPB-${testSuffix}`, blueTitId);
				await makeEncounter(bSpRobin, sSpecies, { age_code: 1, is_juv: true, record_type: 'R' });
				await makeEncounter(bSpBlueTit, sSpecies, { age_code: 1, is_juv: true, record_type: 'R' });

				// dMonth2: a single juv Robin in a later month for the group_by_time_period test.
				const bMonth2 = await makeBird(`AB-M2-${testSuffix}`, robinId);
				await makeEncounter(bMonth2, await makeSession(locationAId, dMonth2), {
					age_code: 1,
					is_juv: true,
					record_type: 'R',
				});
			});

			afterAll(() => {
				execSync(
					`psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c '` +
						`DELETE FROM "Encounters" WHERE bird_id IN (${birdIds.join(', ')});` +
						`DELETE FROM "Birds" WHERE id IN (${birdIds.join(', ')});` +
						`DELETE FROM "Sessions" WHERE id IN (${sessionIds.join(', ')});` +
						`DELETE FROM "Locations" WHERE id IN (${locationAId}, ${locationBId});'`
				);
			});

			// Usual
			it('a bird with only a juv-indicating encounter (age_code 1) counts in juv_count, not adult_count or unknown_age_count', async () => {
				const row = await bucketRow(base, base);
				expect(row).toMatchObject({
					bird_count: 1,
					juv_count: 1,
					adult_count: 0,
					unknown_age_count: 0,
				});
			});

			it('a bird with only an adult-indicating encounter (age_code > 3, e.g. 4) counts in adult_count, not juv_count or unknown_age_count', async () => {
				const row = await bucketRow(dAdult, dAdult);
				expect(row).toMatchObject({
					bird_count: 1,
					adult_count: 1,
					juv_count: 0,
					unknown_age_count: 0,
				});
			});

			it('a New (record_type=N) juv-bucket bird is counted in new_juv_count', async () => {
				const row = await bucketRow(dNewJuv, dNewJuv);
				expect(row).toMatchObject({ juv_count: 1, new_juv_count: 1 });
			});

			// Structure — one test per bucket-defining branch
			it('a bird with only age_code=2 encounters counts in unknown_age_count, not juv_count or adult_count', async () => {
				const row = await bucketRow(dOnly2, dOnly2);
				expect(row).toMatchObject({
					bird_count: 1,
					unknown_age_count: 1,
					juv_count: 0,
					adult_count: 0,
				});
			});

			it('a bird with both a juv-indicating and an adult-indicating encounter in the same group counts in unknown_age_count, not juv_count or adult_count', async () => {
				const row = await bucketRow(dConflict, dConflict);
				expect(row).toMatchObject({
					bird_count: 1,
					unknown_age_count: 1,
					juv_count: 0,
					adult_count: 0,
				});
			});

			it('a retrap (record_type != N) juv-bucket bird is excluded from new_juv_count despite being in juv_count', async () => {
				const row = await bucketRow(base, base);
				expect(row).toMatchObject({ juv_count: 1, new_juv_count: 0 });
			});

			it('a bird whose New encounter and juv-indicating encounter are different rows still counts in new_juv_count (bucket membership and New membership checked independently)', async () => {
				const row = await bucketRow(dNewJuvSplit, dNewJuvSplit);
				expect(row).toMatchObject({
					bird_count: 1,
					juv_count: 1,
					new_juv_count: 1,
					adult_count: 0,
					unknown_age_count: 0,
				});
			});

			it('age_code=1 (J-suffix flag true) and age_code=3 with is_juv=false both count toward juv_count identically, regardless of is_juv', async () => {
				const row = await bucketRow(dJ3, dJ3);
				expect(row).toMatchObject({
					bird_count: 2,
					juv_count: 2,
					adult_count: 0,
					unknown_age_count: 0,
				});
			});

			// Edge
			it('juv_count + adult_count + unknown_age_count equals bird_count for a mixed-bucket group', async () => {
				const row = await bucketRow(base, dMonth2);
				expect(row.juv_count + row.adult_count + row.unknown_age_count).toBe(row.bird_count);
			});

			it('an empty group (no encounters) returns zero for juv_count, adult_count, unknown_age_count and new_juv_count', async () => {
				const row = await bucketRow(dEmpty, dEmpty);
				expect(row).toMatchObject({
					bird_count: 0,
					juv_count: 0,
					adult_count: 0,
					unknown_age_count: 0,
					new_juv_count: 0,
				});
			});

			it("bucket counts respect group_by_species — a juv bird of species A is not counted in species B's row", async () => {
				const { data, error } = await deltaClient.rpc('aggregate_stats', {
					ringing_group_filter: deltaId,
					from_date: dSpecies,
					to_date: dSpecies,
					group_by_species: true,
				});
				expect(error).toBeNull();
				const robin = data!.find((r) => r.species_name === 'Robin');
				const blueTit = data!.find((r) => r.species_name === 'Blue Tit');
				expect(robin).toMatchObject({ bird_count: 1, juv_count: 1 });
				expect(blueTit).toMatchObject({ bird_count: 1, juv_count: 1 });
			});

			it("bucket counts respect group_by_time_period — a juv bird recorded only in month M is not counted in an adjacent month's row", async () => {
				const { data, error } = await deltaClient.rpc('aggregate_stats', {
					ringing_group_filter: deltaId,
					from_date: base,
					to_date: dMonth2,
					group_by_time_period: 'month',
				});
				expect(error).toBeNull();
				const month2 = `${dMonth2.slice(0, 7)}-01`;
				const row = data!.find((r) => r.time_period === month2);
				expect(row).toMatchObject({
					bird_count: 1,
					juv_count: 1,
					adult_count: 0,
					unknown_age_count: 0,
				});
			});
		});

		describe('group_by_time_period=day', () => {
			// Read-only assertions against stable Alpha seed data (safe under concurrency).
			// Usual
			it("returns one row per distinct visit date, matching Alpha's known session dates", async () => {
				const { data, error } = await alphaClient.rpc('aggregate_stats', {
					ringing_group_filter: alphaId,
					group_by_time_period: 'day',
				});
				expect(error).toBeNull();
				expect(data).toHaveLength(ARRETRAP_DATES.length);
				expect(data!.map((r) => r.time_period).sort()).toEqual([...ARRETRAP_DATES].sort());
			});

			it('day-grouped session_count and encounter_count for a given date match the corresponding month-grouped row filtered to that single day', async () => {
				// 2021-06-20 is Alpha's only June-2021 session, so its day row equals the month row.
				const [dayRes, monthRes] = await Promise.all([
					alphaClient.rpc('aggregate_stats', {
						ringing_group_filter: alphaId,
						group_by_time_period: 'day',
					}),
					alphaClient.rpc('aggregate_stats', {
						ringing_group_filter: alphaId,
						group_by_time_period: 'month',
					}),
				]);
				const dayRow = dayRes.data!.find((r) => r.time_period === '2021-06-20');
				const monthRow = monthRes.data!.find((r) => r.time_period === '2021-06-01');
				expect(dayRow!.session_count).toBe(monthRow!.session_count);
				expect(dayRow!.encounter_count).toBe(monthRow!.encounter_count);
			});

			// Structure
			it('a date with no session is absent from the results (spine only covers session dates, not every calendar day)', async () => {
				const { data, error } = await alphaClient.rpc('aggregate_stats', {
					ringing_group_filter: alphaId,
					group_by_time_period: 'day',
				});
				expect(error).toBeNull();
				// 2023-01-01 lies within Alpha's 2021–2024 range but has no session.
				expect(data!.some((r) => r.time_period === '2023-01-01')).toBe(false);
			});

			// Edge
			it('a date range spanning a single day (from_date = to_date) returns exactly one row', async () => {
				const { data, error } = await alphaClient.rpc('aggregate_stats', {
					ringing_group_filter: alphaId,
					group_by_time_period: 'day',
					from_date: '2022-04-30',
					to_date: '2022-04-30',
				});
				expect(error).toBeNull();
				expect(data).toHaveLength(1);
				expect(data![0].time_period).toBe('2022-04-30');
			});

			it('an out-of-range group_by_time_period value (anything other than day/month/year) still falls back to the existing ungrouped NULL time_period behaviour', async () => {
				const { data, error } = await alphaClient.rpc('aggregate_stats', {
					ringing_group_filter: alphaId,
					group_by_time_period: 'week',
				});
				expect(error).toBeNull();
				expect(data).toHaveLength(1);
				expect(data![0].time_period).toBeNull();
				expect(data![0].encounter_count).toBe(ALPHA_TOTAL_ENCOUNTERS);
			});
		});
	});

	describe('top_metrics_by_period', () => {
		// Default params used unless overridden within a describe block:
		//   metric_name='encounters', result_limit=3, temporal_unit='day'

		describe('temporal_unit parameter', () => {
			it('day groups results by individual session date', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
					temporal_unit: 'day',
					metric_name: 'encounters',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				expect(data).toHaveLength(3);
				// Top 2 days tie at 11 encounters (secondary sort: visit_date DESC → 2022-06-15 wins)
				expect(data![0]).toEqual({ visit_date: '2022-06-15', metric_value: 11 });
				expect(data![1]).toEqual({ visit_date: '2022-04-30', metric_value: 11 });
				expect(data![2]).toEqual({ visit_date: '2023-05-12', metric_value: 10 });
			});

			it('month aggregates results into calendar months', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
					temporal_unit: 'month',
					metric_name: 'encounters',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				expect(data).toHaveLength(3);
				expect(data![0]).toEqual({ visit_date: '2022-06-01', metric_value: 11 });
				expect(data![1]).toEqual({ visit_date: '2022-04-01', metric_value: 11 });
				expect(data![2]).toEqual({ visit_date: '2023-05-01', metric_value: 10 });
			});

			it('year aggregates results into calendar years', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
					temporal_unit: 'year',
					metric_name: 'encounters',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				expect(data).toHaveLength(3);
				expect(data![0]).toEqual({ visit_date: '2022-01-01', metric_value: 35 });
				expect(data![1]).toEqual({ visit_date: '2023-01-01', metric_value: 15 });
				expect(data![2]).toEqual({ visit_date: '2024-01-01', metric_value: 5 });
			});
		});

		describe('metric_name parameter', () => {
			it('encounters counts all encounter records per day', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
					temporal_unit: 'day',
					metric_name: 'encounters',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				expect(data![0]).toEqual({ visit_date: '2022-06-15', metric_value: 11 });
			});

			it('individuals counts distinct rings per day', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
					temporal_unit: 'day',
					metric_name: 'individuals',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				// Each bird is caught once per session in seed data → same as encounters
				expect(data![0]).toEqual({ visit_date: '2022-06-15', metric_value: 11 });
			});

			it('species counts distinct species present per day', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
					temporal_unit: 'day',
					metric_name: 'species',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				// Several days had 3 species; tie broken by visit_date DESC
				expect(data![0].metric_value).toBe(3);
				expect(data!.every((r) => r.metric_value === 3)).toBe(true);
			});
		});

		describe('result_limit parameter', () => {
			it('result_limit=1 returns only the single top result', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
					temporal_unit: 'day',
					metric_name: 'encounters',
					result_limit: 1,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				expect(data).toHaveLength(1);
				expect(data![0]).toEqual({ visit_date: '2022-06-15', metric_value: 11 });
			});

			it('result_limit=3 returns top 3 results', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
					temporal_unit: 'day',
					metric_name: 'encounters',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				expect(data).toHaveLength(3);
			});
		});
	});

	describe('top_metrics_by_species_and_period', () => {
		// Default params: metric_name='encounters', result_limit=3, temporal_unit='day'

		describe('temporal_unit parameter', () => {
			it('day groups results by individual session date', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_species_and_period', {
					temporal_unit: 'day',
					metric_name: 'encounters',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				expect(data).toHaveLength(3);
				expect(data![0]).toEqual({ species_name: 'Robin', visit_date: '2023-05-12', metric_value: 7 });
				expect(data![1]).toEqual({ species_name: 'Robin', visit_date: '2022-04-30', metric_value: 7 });
				expect(data![2]).toEqual({ species_name: 'Robin', visit_date: '2022-06-15', metric_value: 6 });
			});

			it('month aggregates results into calendar months', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_species_and_period', {
					temporal_unit: 'month',
					metric_name: 'encounters',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				expect(data).toHaveLength(3);
				expect(data![0]).toEqual({ species_name: 'Robin', visit_date: '2023-05-01', metric_value: 7 });
				expect(data![1]).toEqual({ species_name: 'Robin', visit_date: '2022-04-01', metric_value: 7 });
				expect(data![2]).toEqual({ species_name: 'Robin', visit_date: '2022-06-01', metric_value: 6 });
			});

			it('year aggregates results into calendar years', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_species_and_period', {
					temporal_unit: 'year',
					metric_name: 'encounters',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				expect(data).toHaveLength(3);
				expect(data![0]).toEqual({ species_name: 'Robin', visit_date: '2022-01-01', metric_value: 20 });
				expect(data![1]).toEqual({ species_name: 'Robin', visit_date: '2023-01-01', metric_value: 9 });
				expect(data![2]).toEqual({ species_name: 'Reed Warbler', visit_date: '2022-01-01', metric_value: 8 });
			});
		});

		describe('metric_name parameter', () => {
			it('encounters counts all encounter records per species per day', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_species_and_period', {
					temporal_unit: 'day',
					metric_name: 'encounters',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				expect(data![0]).toEqual({ species_name: 'Robin', visit_date: '2023-05-12', metric_value: 7 });
			});

			it('individuals counts distinct rings per species per day', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_species_and_period', {
					temporal_unit: 'day',
					metric_name: 'individuals',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				// Each bird is caught once per session in seed data → same as encounters
				expect(data![0]).toEqual({ species_name: 'Robin', visit_date: '2023-05-12', metric_value: 7 });
			});
		});

		describe('result_limit parameter', () => {
			it('result_limit=1 returns only the top result', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_species_and_period', {
					temporal_unit: 'day',
					metric_name: 'encounters',
					result_limit: 1,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				expect(data).toHaveLength(1);
				expect(data![0]).toEqual({ species_name: 'Robin', visit_date: '2023-05-12', metric_value: 7 });
			});

			it('result_limit=3 returns top 3 results', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_species_and_period', {
					temporal_unit: 'day',
					metric_name: 'encounters',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				expect(data).toHaveLength(3);
			});
		});
	});

	describe('metrics_by_period_and_species', () => {
		it('temporal_unit=month returns 23 species-month rows', async () => {
			const { data, error } = await alphaClient.rpc('metrics_by_period_and_species', {
				temporal_unit: 'month',
				metric_name: 'encounters',
				filters: { ringing_group_filter: alphaId },
			} as never);
			expect(error).toBeNull();
			expect(data).toHaveLength(23);
			const robin2021 = data!.find(
				(r) => r.species_name === 'Robin' && r.visit_date === '2021-06-01'
			);
			expect(robin2021!.metric_value).toBe(1);
			const robinApr2022 = data!.find(
				(r) => r.species_name === 'Robin' && r.visit_date === '2022-04-01'
			);
			expect(robinApr2022!.metric_value).toBe(7);
		});

		it('temporal_unit=year returns 13 species-year rows spanning 2021–2024', async () => {
			const { data, error } = await alphaClient.rpc('metrics_by_period_and_species', {
				temporal_unit: 'year',
				metric_name: 'encounters',
				filters: { ringing_group_filter: alphaId },
			} as never);
			expect(error).toBeNull();
			expect(data).toHaveLength(13);
			const years = [...new Set(data!.map((r) => new Date(r.visit_date).getFullYear()))].sort();
			expect(years).toEqual([2021, 2022, 2023, 2024]);
			const robin2022 = data!.find(
				(r) => r.species_name === 'Robin' && new Date(r.visit_date).getFullYear() === 2022
			);
			expect(robin2022!.metric_value).toBe(20);
		});
	});

	describe('fuzzy_search_rings', () => {
		it('exact match returns ring with closeness_score 0 and correct species', async () => {
			const { data, error } = await alphaClient.rpc('fuzzy_search_rings', { q: 'ARRETRAP' });
			expect(error).toBeNull();
			expect(data).toEqual([{ ring_no: 'ARRETRAP', closeness_score: 0, species_name: 'Robin' }]);
		});

		it('off-by-one match returns ARRETRAP with closeness_score 1', async () => {
			const { data, error } = await alphaClient.rpc('fuzzy_search_rings', { q: 'ARRETR' });
			expect(error).toBeNull();
			// ARRETR is 2 chars shorter → levenshtein=2, score = 2 - 0.5*(8-6) = 1
			const match = data!.find((r) => r.ring_no === 'ARRETRAP');
			expect(match).toBeDefined();
			expect(match!.closeness_score).toBe(1);
		});

		it('no match returns empty array', async () => {
			const { data, error } = await alphaClient.rpc('fuzzy_search_rings', { q: 'ZZZZZZZZZ' });
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});
	});

	describe('most_caught_birds', () => {
		describe('significance_threshold parameter', () => {
			it('default threshold=3 returns only ARRETRAP (only bird with ≥3 encounters)', async () => {
				const { data, error } = await alphaClient.rpc('most_caught_birds', {
					ringing_group_filter: alphaId,
				});
				expect(error).toBeNull();
				expect(data).toHaveLength(1);
				expect(data![0]).toMatchObject({
					species_name: 'Robin',
					ring_no: 'ARRETRAP',
					encounter_count: ARRETRAP_ENCOUNTERS,
					encounter_dates: ARRETRAP_DATES,
				});
			});

			it('threshold=1 returns all 46 birds with at least 1 encounter', async () => {
				const { data, error } = await alphaClient.rpc('most_caught_birds', {
					ringing_group_filter: alphaId,
					significance_threshold: 1,
				});
				expect(error).toBeNull();
				expect(data).toHaveLength(ALPHA_TOTAL_BIRDS);
				expect(data![0].ring_no).toBe('ARRETRAP');
			});

			it('threshold=10 returns no birds (max encounters is 9 for ARRETRAP)', async () => {
				const { data, error } = await alphaClient.rpc('most_caught_birds', {
					ringing_group_filter: alphaId,
					significance_threshold: 10,
				});
				expect(error).toBeNull();
				expect(data).toHaveLength(0);
			});
		});

		it('species_filter=Robin returns only ARRETRAP (only Robin with ≥3 encounters)', async () => {
			const { data, error } = await alphaClient.rpc('most_caught_birds', {
				ringing_group_filter: alphaId,
				species_filter: 'Robin',
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			expect(data![0].ring_no).toBe('ARRETRAP');
		});

		it('year_filter=2022 returns ARRETRAP with exactly 4 encounters in 2022', async () => {
			const { data, error } = await alphaClient.rpc('most_caught_birds', {
				ringing_group_filter: alphaId,
				year_filter: 2022,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			expect(data![0]).toMatchObject({
				ring_no: 'ARRETRAP',
				encounter_count: 4,
				encounter_dates: ['2022-04-30', '2022-06-15', '2022-08-10', '2022-10-20'],
			});
		});

		it('max_per_species=1 returns at most 1 row per species (ARRETRAP is only result)', async () => {
			const { data, error } = await alphaClient.rpc('most_caught_birds', {
				ringing_group_filter: alphaId,
				max_per_species: 1,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			expect(data![0].ring_no).toBe('ARRETRAP');
		});
	});

	describe('notable_retraps', () => {
		it('min_encounter_count=6 returns only ARRETRAP (9 encounters)', async () => {
			const { data, error } = await alphaClient.rpc('notable_retraps', {
				ringing_group_filter: alphaId,
				min_encounter_count: 6,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			expect(data![0]).toMatchObject({
				species_name: 'Robin',
				ring_no: 'ARRETRAP',
				encounter_count: ARRETRAP_ENCOUNTERS,
				encounter_dates: ARRETRAP_DATES,
				proven_age: ARRETRAP_PROVEN_AGE,
			});
		});

		it('min_proven_age=3 returns ARRETRAP and the long-absence Wren (both proven_age=3)', async () => {
			// AWREN001 was ringed as a juvenile in 2021 and recaught in 2024, so it is
			// also a proven-age-3 bird. Ordered by encounter_count DESC → ARRETRAP first.
			const { data, error } = await alphaClient.rpc('notable_retraps', {
				ringing_group_filter: alphaId,
				min_proven_age: 3,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(2);
			expect(data![0]).toMatchObject({
				ring_no: 'ARRETRAP',
				encounter_count: ARRETRAP_ENCOUNTERS,
				proven_age: ARRETRAP_PROVEN_AGE,
			});
			expect(data![1]).toMatchObject({
				ring_no: 'AWREN001',
				species_name: 'Wren',
				encounter_count: 2,
				proven_age: 3,
			});
		});

		it('species_filter=Robin returns all 23 Robin birds with min_encounter_count=1', async () => {
			const { data, error } = await alphaClient.rpc('notable_retraps', {
				ringing_group_filter: alphaId,
				species_filter: 'Robin',
				min_encounter_count: 1,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(PER_SPECIES_AGGREGATES['Robin'].bird_count);
			expect(data!.every((r) => r.species_name === 'Robin')).toBe(true);
			expect(data![0].ring_no).toBe('ARRETRAP');
		});

		it('min_encounter_count=100 returns no birds', async () => {
			const { data, error } = await alphaClient.rpc('notable_retraps', {
				ringing_group_filter: alphaId,
				min_encounter_count: 100,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});
	});

	describe('find_discrepencies', () => {
		it('alpha group returns 5 discrepancy rows across 3 birds', async () => {
			const { data, error } = await alphaClient.rpc('find_discrepencies', {
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			const rows = data!
				.map((r) => ({
					ring_no: r.ring_no,
					type: r.discrepency_type,
					last_encounter_date: r.last_encounter_date,
				}))
				.sort((a, b) => a.ring_no.localeCompare(b.ring_no) || a.type.localeCompare(b.type));
			expect(rows).toEqual([
				{ ring_no: 'ABTITMIS',  type: 'age',         last_encounter_date: '2022-06-15' },
				{ ring_no: 'ABTITMIS',  type: 'sex',         last_encounter_date: '2022-06-15' },
				{ ring_no: 'AKINGF001', type: 'age',         last_encounter_date: '2023-07-08' },
				{ ring_no: 'ARRETRAP',  type: 'age',         last_encounter_date: '2024-05-10' },
				{ ring_no: 'ARRETRAP',  type: 'wing_length', last_encounter_date: '2024-05-10' },
			]);
		});

		it('beta group returns empty (clean data, no discrepancies)', async () => {
			const { data, error } = await betaClient.rpc('find_discrepencies', {
				ringing_group_filter: betaId,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});
	});

	describe('long_absence_retraps', () => {
		// Seed: AWREN001 (Wren) was ringed on 2021-06-20 and only recaught on
		// 2024-05-10 — a 1055-day gap, the sole ≥730-day retrap in the seed.
		it('returns the long-absence bird with correct previous_date and gap_days', async () => {
			const { data, error } = await alphaClient.rpc('long_absence_retraps', {
				session_date: '2024-05-10',
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			expect(data).toEqual([
				{
					ring_no: 'AWREN001',
					species_name: 'Wren',
					previous_date: '2021-06-20',
					gap_days: 1055,
				},
			]);
		});

		it('excludes retraps with gaps under min_gap_days', async () => {
			// On 2024-05-10, ARRETRAP was last seen 2023-09-14 (239 days) — under the
			// 730-day default, so only the Wren (1055 days) qualifies.
			const { data, error } = await alphaClient.rpc('long_absence_retraps', {
				session_date: '2024-05-10',
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			expect(data!.map((r) => r.ring_no)).toEqual(['AWREN001']);
		});

		it('excludes birds ringed for the first time this session', async () => {
			// 2021-06-20 is the group's first session: every bird is newly ringed,
			// so none has a prior visit to compare against.
			const { data, error } = await alphaClient.rpc('long_absence_retraps', {
				session_date: '2021-06-20',
				ringing_group_filter: alphaId,
				min_gap_days: 1,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});

		it('honours a custom min_gap_days', async () => {
			// Lowering the threshold to 200 days lets ARRETRAP (239 days) through
			// alongside the Wren, ordered by gap_days DESC.
			const { data, error } = await alphaClient.rpc('long_absence_retraps', {
				session_date: '2024-05-10',
				ringing_group_filter: alphaId,
				min_gap_days: 200,
			});
			expect(error).toBeNull();
			expect(data!.map((r) => ({ ring_no: r.ring_no, gap_days: r.gap_days }))).toEqual([
				{ ring_no: 'AWREN001', gap_days: 1055 },
				{ ring_no: 'ARRETRAP', gap_days: 239 },
			]);
		});

		it('returns empty for a date with no session', async () => {
			const { data, error } = await alphaClient.rpc('long_absence_retraps', {
				session_date: '2099-01-01',
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});
	});

	describe('stats_per_day_and_species', () => {
		it('returns encounter count, weighed birds count and weight extremes per day and species', async () => {
			// Seed 2021-06-20: ARRETRAP (Robin, 18.5) and AWREN001 (Wren, 9.0).
			const { data, error } = await alphaClient.rpc('stats_per_day_and_species', {
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			const dayRows = data!.filter((row) => row.visit_date === '2021-06-20');
			expect(dayRows).toHaveLength(2);
			expect(dayRows).toContainEqual({
				species_name: 'Robin',
				visit_date: '2021-06-20',
				encounter_count: 1,
				juv_count: 0,
				weighed_birds_count: 1,
				min_weight: 18.5,
				max_weight: 18.5,
			});
			expect(dayRows).toContainEqual({
				species_name: 'Wren',
				visit_date: '2021-06-20',
				encounter_count: 1,
				juv_count: 0,
				weighed_birds_count: 1,
				min_weight: 9,
				max_weight: 9,
			});
		});

		it('aggregates multiple weighed encounters on one day into a single row', async () => {
			// Seed 2022-06-15 Robins: 19.0, 17.2, 16.5, 20.5, 19.5, 17.0 — six encounters.
			const { data, error } = await alphaClient.rpc('stats_per_day_and_species', {
				ringing_group_filter: alphaId,
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
				weighed_birds_count: 6,
				min_weight: 16.5,
				max_weight: 20.5,
			});
		});

		it("excludes other groups' data", async () => {
			// Beta's only session is 2023-06-01 (two Chaffinches + its own SHARED01
			// Robin encounter). None of Alpha's sessions appear despite Alpha→Beta
			// sharing, because both Encounters and Sessions are group-filtered.
			const { data, error } = await betaClient.rpc('stats_per_day_and_species', {
				ringing_group_filter: betaId,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(2);
			expect(data).toContainEqual({
				species_name: 'Chaffinch',
				visit_date: '2023-06-01',
				encounter_count: 2,
				juv_count: 0,
				weighed_birds_count: 2,
				min_weight: 18.5,
				max_weight: 20,
			});
			expect(data).toContainEqual({
				species_name: 'Robin',
				visit_date: '2023-06-01',
				encounter_count: 1,
				juv_count: 0,
				weighed_birds_count: 1,
				min_weight: 18.5,
				max_weight: 18.5,
			});
		});

		it('returns no rows for a group with no encounters', async () => {
			const { data, error } = await gammaClient.rpc('stats_per_day_and_species', {
				ringing_group_filter: gammaId,
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
						ringing_group_id: deltaId,
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
					[`STATSTEST1-${testSuffix}`, `STATSTEST2-${testSuffix}`, `STATSTEST3-${testSuffix}`].map((ringNo) =>
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
				};
				const { error: encountersError } = await deltaClient
					.from('Encounters')
					.insert([
						// visitDates[0]: one weighed + one unweighed encounter
						{ ...baseEncounter, bird_id: birdIds[0], session_id: sessionIds[0], weight: 15 },
						{ ...baseEncounter, bird_id: birdIds[1], session_id: sessionIds[0] },
						// visitDates[1]: only an unweighed encounter
						{ ...baseEncounter, bird_id: birdIds[2], session_id: sessionIds[1] },
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
				const { data, error } = await deltaClient.rpc('stats_per_day_and_species', {
					ringing_group_filter: deltaId,
				});
				expect(error).toBeNull();
				expect(
					data!.find((row) => row.visit_date === visitDates[0])
				).toEqual({
					species_name: 'Robin',
					visit_date: visitDates[0],
					encounter_count: 2,
					juv_count: 0,
					weighed_birds_count: 1,
					min_weight: 15,
					max_weight: 15,
				});
			});

			it('returns null weight extremes and zero weighed_birds_count for a day with only unweighed encounters', async () => {
				const { data, error } = await deltaClient.rpc('stats_per_day_and_species', {
					ringing_group_filter: deltaId,
				});
				expect(error).toBeNull();
				expect(
					data!.find((row) => row.visit_date === visitDates[1])
				).toEqual({
					species_name: 'Robin',
					visit_date: visitDates[1],
					encounter_count: 1,
					juv_count: 0,
					weighed_birds_count: 0,
					min_weight: null,
					max_weight: null,
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
						ringing_group_id: deltaId,
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
						`JUVTEST5-${testSuffix}`,
					].map(
						(ringNo) =>
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
					session_id: sessionId,
				};
				const { error: encountersError } = await deltaClient
					.from('Encounters')
					.insert([
						{ ...baseEncounter, bird_id: birdIds[0], is_juv: true },
						{ ...baseEncounter, bird_id: birdIds[1], is_juv: true },
						{ ...baseEncounter, bird_id: birdIds[2], is_juv: true },
						{ ...baseEncounter, bird_id: birdIds[3], is_juv: false },
						{ ...baseEncounter, bird_id: birdIds[4], is_juv: false },
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
				const { data, error } = await deltaClient.rpc('stats_per_day_and_species', {
					ringing_group_filter: deltaId,
				});
				expect(error).toBeNull();
				const row = data!.find((row) => row.visit_date === visitDate);
				expect(row).toMatchObject({
					species_name: 'Robin',
					visit_date: visitDate,
					encounter_count: 5,
					juv_count: 3,
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
						ringing_group_id: deltaId,
					})
					.select('id')
					.single();
				if (locationError) throw locationError;
				locationId = location!.id;

				const fieldObsOnlySessionId = await insertSession(fieldObsOnlyDate, 'FIELD_OBSERVATION');
				const fieldObsRealSessionId = await insertSession(fieldObsMixedDate, 'FULL_GROWN');
				const fieldObsMixedTwinId = await insertSession(fieldObsMixedDate, 'FIELD_OBSERVATION');
				const pulliOnlySessionId = await insertSession(pulliOnlyDate, 'PULLI');
				const pulliRealSessionId = await insertSession(pulliMixedDate, 'FULL_GROWN');
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
						`NFGSTAT8-${testSuffix}`,
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
					weight: 15,
				};
				const { error: encountersError } = await deltaClient
					.from('Encounters')
					.insert([
						// fieldObsOnlyDate: only a passive field-observation (C) encounter.
						{
							...baseEncounter,
							bird_id: birdIds[0],
							session_id: fieldObsOnlySessionId,
							record_type: 'C',
						},
						// fieldObsMixedDate FULL_GROWN session: two proper ringing (N) encounters.
						{
							...baseEncounter,
							bird_id: birdIds[1],
							session_id: fieldObsRealSessionId,
							record_type: 'N',
						},
						{
							...baseEncounter,
							bird_id: birdIds[2],
							session_id: fieldObsRealSessionId,
							record_type: 'N',
						},
						// fieldObsMixedDate FIELD_OBSERVATION session: a passive observation on the
						// same date/location that must not merge into the FULL_GROWN session's row.
						{
							...baseEncounter,
							bird_id: birdIds[3],
							session_id: fieldObsMixedTwinId,
							record_type: 'D',
						},
						// pulliOnlyDate: only a PULLI new-ring (N) encounter.
						{
							...baseEncounter,
							bird_id: birdIds[4],
							session_id: pulliOnlySessionId,
							record_type: 'N',
						},
						// pulliMixedDate FULL_GROWN session: two proper ringing (N) encounters.
						{
							...baseEncounter,
							bird_id: birdIds[5],
							session_id: pulliRealSessionId,
							record_type: 'N',
						},
						{
							...baseEncounter,
							bird_id: birdIds[6],
							session_id: pulliRealSessionId,
							record_type: 'N',
						},
						// pulliMixedDate PULLI session: a pulli ringing (N) on the same
						// date/location that must not merge into the FULL_GROWN session's row.
						{
							...baseEncounter,
							bird_id: birdIds[7],
							session_id: pulliMixedTwinId,
							record_type: 'N',
						},
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
				const { data, error } = await deltaClient.rpc('stats_per_day_and_species', {
					ringing_group_filter: deltaId,
				});
				expect(error).toBeNull();
				expect(
					data!.filter((row) => row.visit_date === fieldObsOnlyDate)
				).toHaveLength(0);
			});

			it('excludes a PULLI session entirely, returning no rows for a date whose only session is PULLI', async () => {
				const { data, error } = await deltaClient.rpc('stats_per_day_and_species', {
					ringing_group_filter: deltaId,
				});
				expect(error).toBeNull();
				expect(
					data!.filter((row) => row.visit_date === pulliOnlyDate)
				).toHaveLength(0);
			});

			it('returns rows only for the FULL_GROWN session when a FULL_GROWN and a FIELD_OBSERVATION session share the same date and location', async () => {
				const { data, error } = await deltaClient.rpc('stats_per_day_and_species', {
					ringing_group_filter: deltaId,
				});
				expect(error).toBeNull();
				const mixedRows = data!.filter((row) => row.visit_date === fieldObsMixedDate);
				expect(mixedRows).toHaveLength(1);
				// encounter_count is 2 (the two FULL_GROWN N encounters), not 3 — the
				// FIELD_OBSERVATION on the same date/location is excluded.
				expect(mixedRows[0]).toMatchObject({
					species_name: 'Robin',
					visit_date: fieldObsMixedDate,
					encounter_count: 2,
				});
			});

			it('returns rows only for the FULL_GROWN session when a FULL_GROWN and a PULLI session share the same date and location', async () => {
				const { data, error } = await deltaClient.rpc('stats_per_day_and_species', {
					ringing_group_filter: deltaId,
				});
				expect(error).toBeNull();
				const mixedRows = data!.filter((row) => row.visit_date === pulliMixedDate);
				expect(mixedRows).toHaveLength(1);
				// encounter_count is 2 (the two FULL_GROWN N encounters), not 3 — the PULLI
				// ringing on the same date/location is excluded.
				expect(mixedRows[0]).toMatchObject({
					species_name: 'Robin',
					visit_date: pulliMixedDate,
					encounter_count: 2,
				});
			});
		});
	});

	describe('group_ticks', () => {
		// Alpha species first-encounter dates (across all locations, all record types):
		//   Reed Warbler 2022-06-15, Blue Tit 2022-04-30, Kingfisher 2022-04-30,
		//   Robin 2021-06-20, Wren 2021-06-20
		let alphaSiteBLocationId: number;

		beforeAll(async () => {
			alphaSiteBLocationId = await getLocationIdByName(alphaClient, 'Alpha Site B', alphaId);
		});

		it('a group with multiple species returns them ordered by most recent first_encounter_date first', async () => {
			const { data, error } = await alphaClient.rpc('group_ticks', {
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			expect(data).toEqual([
				{ species_name: 'Reed Warbler', first_encounter_date: '2022-06-15' },
				{ species_name: 'Blue Tit', first_encounter_date: '2022-04-30' },
				{ species_name: 'Kingfisher', first_encounter_date: '2022-04-30' },
				{ species_name: 'Robin', first_encounter_date: '2021-06-20' },
				{ species_name: 'Wren', first_encounter_date: '2021-06-20' },
			]);
		});

		describe('ringing_group_filter parameter', () => {
			it('scopes to that group only — a species encountered by a different group is excluded', async () => {
				const { data, error } = await betaClient.rpc('group_ticks', {
					ringing_group_filter: betaId,
				});
				expect(error).toBeNull();
				expect(data).toEqual([
					{ species_name: 'Chaffinch', first_encounter_date: '2023-06-01' },
					{ species_name: 'Robin', first_encounter_date: '2023-06-01' },
				]);
				// Alpha-only species (e.g. Kingfisher) never appear when filtered to Beta
				expect(data!.some((r) => r.species_name === 'Kingfisher')).toBe(false);
			});
		});

		describe('location_filter parameter', () => {
			it('scopes to that location only — a species first encountered at a different location is excluded', async () => {
				const { data, error } = await alphaClient.rpc('group_ticks', {
					ringing_group_filter: alphaId,
					location_filter: alphaSiteBLocationId,
				});
				expect(error).toBeNull();
				expect(data).toEqual([
					{ species_name: 'Reed Warbler', first_encounter_date: '2023-09-14' },
					{ species_name: 'Blue Tit', first_encounter_date: '2022-10-20' },
					{ species_name: 'Robin', first_encounter_date: '2022-10-20' },
				]);
				// Kingfisher and Wren were only ever encountered at Alpha Site A (CES)
				expect(data!.some((r) => r.species_name === 'Kingfisher')).toBe(false);
				expect(data!.some((r) => r.species_name === 'Wren')).toBe(false);
			});
		});

		describe('result_limit parameter', () => {
			it('truncates the returned rows to N', async () => {
				const { data, error } = await alphaClient.rpc('group_ticks', {
					ringing_group_filter: alphaId,
					result_limit: 2,
				});
				expect(error).toBeNull();
				expect(data).toEqual([
					{ species_name: 'Reed Warbler', first_encounter_date: '2022-06-15' },
					{ species_name: 'Blue Tit', first_encounter_date: '2022-04-30' },
				]);
			});
		});

		it('a group with zero encounters returns an empty array', async () => {
			const { data, error } = await gammaClient.rpc('group_ticks', {
				ringing_group_filter: gammaId,
			});
			expect(error).toBeNull();
			expect(data).toEqual([]);
		});

		it('two species sharing the same first_encounter_date are tie-broken by species_name ASC', async () => {
			const { data, error } = await alphaClient.rpc('group_ticks', {
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			const tiedAtJune2021 = data!.filter((r) => r.first_encounter_date === '2021-06-20');
			expect(tiedAtJune2021.map((r) => r.species_name)).toEqual(['Robin', 'Wren']);
			const tiedAtApril2022 = data!.filter((r) => r.first_encounter_date === '2022-04-30');
			expect(tiedAtApril2022.map((r) => r.species_name)).toEqual(['Blue Tit', 'Kingfisher']);
		});

		it("a species' first-ever encounter logged with a non-'N' record_type still sets first_encounter_date", async () => {
			// Beta's only Robin encounter is SHARED01, logged as record_type 'S' (a retrap-type
			// record — the bird was originally ringed by Alpha). group_ticks must not filter to
			// record_type = 'N' only, or Robin would be missing from Beta's results entirely.
			const { data, error } = await betaClient.rpc('group_ticks', {
				ringing_group_filter: betaId,
			});
			expect(error).toBeNull();
			const robinRow = data!.find((r) => r.species_name === 'Robin');
			expect(robinRow).toEqual({ species_name: 'Robin', first_encounter_date: '2023-06-01' });
		});
	});
});
