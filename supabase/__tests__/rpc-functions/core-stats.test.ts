/**
 * Integration tests for the `core_stats` Postgres RPC function.
 *
 * Requires local Supabase running and e2e seed data loaded:
 *   npm run db:start:local
 *   npm run db:seed:e2e
 *
 * Run with: npm run test:integration
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { getAuthenticatedSupabaseClientForGroup } from '../../../app/lib/auth/group-auth';
import { supabase } from '../../../lib/supabase';
import { addDays, randomFutureDate, randomTestSuffix } from '../test-isolation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getGroupIdByName } from './helpers/seed-lookups';
import { psql } from '../db-test-helpers';
import { resolveAlphaBetaGammaClients } from './helpers/group-clients';
import {
	PER_SPECIES_AGGREGATES,
	ARRETRAP_DATES
} from './helpers/alpha-seed-constants';
import {
	insertTestLocation,
	insertTestSession,
	createSessionResolver,
	insertTestBird,
	insertTestEncounter,
	createRingNoSequence,
	withSessionDate
} from './helpers/encounter-fixtures';

// Seed has 11 Alpha session dates carrying an in-hand encounter: the 9 ARRETRAP dates (2021-06-20,
// 2022-04-30, 2022-06-15, 2022-08-10, 2022-10-20, 2023-05-12, 2023-07-08,
// 2023-09-14, 2024-05-10) plus 2023-03-15 and 2023-03-20 (Fieldfare/Redwing,
// added by #902's fixture-coverage rows).
const ALPHA_SESSION_COUNT = 11;
// #902 also added a resighting-type ('F') Kingfisher and a resighting-type ('U')
// Wren encounter to the same fixture, to exercise a "resightings" table fixture —
// both are now excluded from core_stats' aggregates by #874's fix, so
// ALPHA_TOTAL_ENCOUNTERS only nets the two new Fieldfare/Redwing captures (57 + 2).
const ALPHA_TOTAL_ENCOUNTERS = 59;
// Blue Tit, Fieldfare, Kingfisher, Reed Warbler, Redwing, Robin, Wren — Fieldfare
// and Redwing added by #902.
const ALPHA_SPECIES_COUNT = 7;
// core_stats' resighting-exclusion-aware bird_count (#874) — 2 fewer than the raw
// total Birds row count for Alpha (see ALPHA_TOTAL_BIRDS in alpha-seed-constants.ts,
// which most_caught_birds uses unfiltered): the #902 Kingfisher/Wren resighting-only
// birds each still have a row in Birds, but never surface in core_stats' per-bird
// aggregation since their only encounter is filtered out upstream.
const ALPHA_TOTAL_BIRDS_EXCLUDING_RESIGHTINGS = 48;
const CES_2022_ENCOUNTERS = 30; // Apr–Aug 2022 only

// Species rows are seed data, readable without a group-authenticated client.
async function getSpeciesId(name: string): Promise<number> {
	const { data, error } = await supabase
		.from('Species')
		.select('id')
		.eq('species_name', name)
		.single();
	if (error || !data) throw new Error(`Species "${name}" not found`);
	return data.id;
}

describe('core_stats', () => {
	let alphaId: number;
	let alphaClient: SupabaseClient;

	beforeAll(async () => {
		({ alphaId, alphaClient } = await resolveAlphaBetaGammaClients());
	});

	it('no filters returns total aggregate across all alpha data', async () => {
		const { data, error } = await alphaClient.rpc('core_stats', {
			ringing_group_filter: alphaId
		});
		expect(error).toBeNull();
		expect(data).toHaveLength(1);
		const row = data![0];
		expect(row.species_name).toBeNull();
		expect(row.time_period).toBeNull();
		expect(row.session_count).toBe(ALPHA_SESSION_COUNT);
		expect(row.encounter_count).toBe(ALPHA_TOTAL_ENCOUNTERS);
		expect(row.bird_count).toBe(ALPHA_TOTAL_BIRDS_EXCLUDING_RESIGHTINGS);
		expect(row.species_count).toBe(ALPHA_SPECIES_COUNT);
	});

	it('species_name_filter=Robin returns single Robin aggregate', async () => {
		const { data, error } = await alphaClient.rpc('core_stats', {
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
		const { data, error } = await alphaClient.rpc('core_stats', {
			ringing_group_filter: alphaId,
			from_date: '2022-04-01',
			to_date: '2022-08-31'
		});
		expect(error).toBeNull();
		expect(data![0].encounter_count).toBe(CES_2022_ENCOUNTERS);
	});

	it('group_by_species returns one row per species with correct counts', async () => {
		const { data, error } = await alphaClient.rpc('core_stats', {
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
		const { data, error } = await alphaClient.rpc('core_stats', {
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
		const { data, error } = await alphaClient.rpc('core_stats', {
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
		// 2023 is 15 + the 2 new Fieldfare/Redwing captures added by #902 (17); the
		// same-year resighting-type Kingfisher/Wren encounters are excluded (#874).
		expect(byYear).toEqual({ 2021: 2, 2022: 35, 2023: 17, 2024: 5 });
	});

	// This replaces a ~490-line `non-FULL_GROWN sessions (FIELD_OBSERVATION and
	// PULLI)` describe block, whose whole subject was that core_stats derived
	// total_effort / effort_per_session / avg_encounters_per_session /
	// max_per_session / max_new_per_session from FULL_GROWN sessions only, while
	// session_count (since #1021) and the per-species/per-bird totals counted every
	// session. #1024 dropped Sessions.session_type, so that split no longer exists
	// to test: every session in a cell contributes to the effort stats, on the same
	// basis session_count already used. The visible consequence — a date that used
	// to report a session_count against zero effort now reports real effort — gets
	// one focused scenario here instead.
	describe('effort stats cover every session in the cell (#1024)', () => {
		let deltaId: number;
		let deltaClient: SupabaseClient;
		let robinId: number;
		let locationId: number;
		let secondLocationId: number;
		let birdIds: number[];
		// A single date, visited at two locations. Before #1024 the nestling
		// (age_code 1) capture at the second location would have been a separate
		// PULLI Session, excluded from every effort column.
		let visitDate: string;

		// Query the single whole-period aggregate row for a bounded date range.
		async function aggregateRow(fromDate: string, toDate: string) {
			const { data, error } = await deltaClient.rpc('core_stats', {
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

			const testSuffix = randomTestSuffix();
			visitDate = randomFutureDate();

			[locationId, secondLocationId] = await Promise.all([
				insertTestLocation(deltaClient, deltaId, `Effort A ${testSuffix}`),
				insertTestLocation(deltaClient, deltaId, `Effort B ${testSuffix}`)
			]);

			// One Session for the whole group-day, whichever location it is asked for.
			const sessionId = await insertTestSession(
				deltaClient,
				locationId,
				visitDate
			);

			const [b1, b2, b3] = await Promise.all([
				insertTestBird(deltaClient, `EFFORT-A1-${testSuffix}`, robinId),
				insertTestBird(deltaClient, `EFFORT-A2-${testSuffix}`, robinId),
				insertTestBird(deltaClient, `EFFORT-B1-${testSuffix}`, robinId)
			]);
			birdIds = [b1, b2, b3];

			// Two full-grown captures at the first location, 09:00–11:00.
			await insertTestEncounter(deltaClient, b1, sessionId, {
				age_code: 4,
				record_type: 'N',
				capture_time: '09:00:00'
			});
			await insertTestEncounter(deltaClient, b2, sessionId, {
				age_code: 4,
				record_type: 'N',
				capture_time: '11:00:00'
			});
			// A nestling at the second location at 14:00 — formerly a PULLI session's
			// encounter, and formerly invisible to every effort column.
			await insertTestEncounter(deltaClient, b3, sessionId, {
				age_code: 1,
				record_type: 'N',
				capture_time: '14:00:00',
				location_id: secondLocationId
			});
		});

		afterAll(() => {
			psql(
				`DELETE FROM "Encounters" WHERE bird_id IN (${birdIds.join(', ')});` +
					`DELETE FROM "Birds" WHERE id IN (${birdIds.join(', ')});` +
					`DELETE FROM "Sessions" WHERE ringing_group_id = ${deltaId} AND visit_date = '${visitDate}';` +
					`DELETE FROM "Locations" WHERE id IN (${locationId}, ${secondLocationId});`
			);
		});

		it('spans the whole day in total_effort, including the formerly-PULLI capture', async () => {
			const row = await aggregateRow(visitDate, visitDate);
			// 09:00 to 14:00 across the one session. The 14:00 nestling used to sit in
			// a separate PULLI session, leaving a 09:00–11:00 / 2h span.
			expect(row.total_effort).toBe('05:00:00');
			expect(row.effort_per_session).toBe('05:00:00');
		});

		it('counts every encounter on the date in the per-session aggregates', async () => {
			const row = await aggregateRow(visitDate, visitDate);
			expect(row.session_count).toBe(1);
			expect(row.max_per_session).toBe(3);
			expect(row.max_new_per_session).toBe(3);
			expect(row.avg_encounters_per_session).toBe(3);
		});

		it('still counts all three birds and encounters in the plain totals', async () => {
			const row = await aggregateRow(visitDate, visitDate);
			expect(row.bird_count).toBe(3);
			expect(row.encounter_count).toBe(3);
			expect(row.new_bird_count).toBe(3);
		});
	});

	// The `session_counts` CTE used to split its per-session tallies by species_id
	// whatever the caller asked for, so on a group-wide call max_per_session
	// ("Busiest session"), max_new_per_session and avg_encounters_per_session
	// described the busiest/average SPECIES WITHIN a session rather than the session
	// itself (#1049 — prod's /summary/sep reported 39, its biggest single species, for
	// a 2026 whose busiest session held 62 birds). Two mixed-species group-days inside
	// a private date window separate the two readings: no single species accounts for
	// a whole session, and a species-split average divides by a different denominator.
	describe('per-session aggregates when not grouping by species (#1049)', () => {
		let deltaId: number;
		let deltaClient: SupabaseClient;
		let locationId: number;
		let sessionIds: number[];
		let birdIds: number[];
		// 5 encounters across two species (3 Robin, 2 Wren), 4 of them new. Its
		// biggest single species is 3, and its biggest single species' new count is 2.
		let busiestDate: string;
		// 2 encounters, both Robin, both new.
		let quieterDate: string;

		// The whole-window aggregate: one ungrouped row covering both dates.
		async function windowRow() {
			const { data, error } = await deltaClient.rpc('core_stats', {
				ringing_group_filter: deltaId,
				from_date: busiestDate,
				to_date: quieterDate
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			return data![0];
		}

		// The same window, broken down per species.
		async function windowRowForSpecies(speciesName: string) {
			const { data, error } = await deltaClient.rpc('core_stats', {
				ringing_group_filter: deltaId,
				from_date: busiestDate,
				to_date: quieterDate,
				group_by_species: true
			});
			expect(error).toBeNull();
			const row = data!.find(
				(candidate: { species_name: string }) =>
					candidate.species_name === speciesName
			);
			expect(row).toBeDefined();
			return row;
		}

		beforeAll(async () => {
			deltaId = await getGroupIdByName('Delta');
			deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);
			const [robinId, wrenId] = await Promise.all([
				getSpeciesId('Robin'),
				getSpeciesId('Wren')
			]);

			const testSuffix = randomTestSuffix();
			busiestDate = randomFutureDate();
			quieterDate = addDays(busiestDate, 1);

			locationId = await insertTestLocation(
				deltaClient,
				deltaId,
				`Busiest ${testSuffix}`
			);
			const [busiestSessionId, quieterSessionId] = await Promise.all([
				insertTestSession(deltaClient, locationId, busiestDate),
				insertTestSession(deltaClient, locationId, quieterDate)
			]);
			sessionIds = [busiestSessionId, quieterSessionId];

			// 3 Robins + 2 Wrens on the busy day, 2 Robins on the quiet one.
			const ringNos = [
				'BUSY-R1',
				'BUSY-R2',
				'BUSY-R3',
				'BUSY-W1',
				'BUSY-W2',
				'QUIET-R1',
				'QUIET-R2'
			];
			const speciesIds = [
				robinId,
				robinId,
				robinId,
				wrenId,
				wrenId,
				robinId,
				robinId
			];
			birdIds = await Promise.all(
				ringNos.map((ringNo, index) =>
					insertTestBird(
						deltaClient,
						`${ringNo}-${testSuffix}`,
						speciesIds[index]
					)
				)
			);

			// One of the three Robins on the busy day is a retrap, so the day's new
			// count (4) is higher than any single species' new count (2 Robin, 2 Wren)
			// but lower than its encounter count (5).
			const recordTypes = ['N', 'N', 'R', 'N', 'N', 'N', 'N'];
			for (const [index, birdId] of birdIds.entries()) {
				await insertTestEncounter(
					deltaClient,
					birdId,
					index < 5 ? busiestSessionId : quieterSessionId,
					{ age_code: 4, record_type: recordTypes[index] }
				);
			}
		});

		afterAll(() => {
			psql(
				`DELETE FROM "Encounters" WHERE bird_id IN (${birdIds.join(', ')});` +
					`DELETE FROM "Birds" WHERE id IN (${birdIds.join(', ')});` +
					`DELETE FROM "Sessions" WHERE id IN (${sessionIds.join(', ')});` +
					`DELETE FROM "Locations" WHERE id = ${locationId};`
			);
		});

		it('reports the busiest session by its whole encounter count, not its biggest single species', async () => {
			const row = await windowRow();
			expect(row.session_count).toBe(2);
			// 3 Robin + 2 Wren on the busy day. The species-split reading was 3.
			expect(row.max_per_session).toBe(5);
		});

		it('counts new encounters across every species in the busiest session', async () => {
			const row = await windowRow();
			// 4 of the busy day's 5 encounters are new. The species-split reading was 2.
			expect(row.max_new_per_session).toBe(4);
		});

		it('averages encounters over sessions, not over species-within-a-session cells', async () => {
			const row = await windowRow();
			// (5 + 2) / 2 sessions. The species-split reading divided 7 by 3 cells.
			expect(Number(row.avg_encounters_per_session)).toBe(3.5);
		});

		it('still reports a species’ own busiest session when grouping by species', async () => {
			const [robinRow, wrenRow] = await Promise.all([
				windowRowForSpecies('Robin'),
				windowRowForSpecies('Wren')
			]);
			expect(robinRow.max_per_session).toBe(3);
			expect(wrenRow.max_per_session).toBe(2);
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
			// date can coexist: Encounters is unique on (bird_id, location_id,
			// visit_date) since #1024, so the differing location is what keeps them
			// apart. They now share one Session row — a group-day is one Session —
			// which makes no difference to the age bucketing under test.
			for (let i = 0; i < 2; i++) {
				const locationId = await insertTestLocation(
					deltaClient,
					deltaId,
					`Age Bucket Test Location ${testSuffix}-${i}`
				);
				locationIds.push(locationId);
			}

			// One shared session per (date, location), reused across birds on that date.
			const getSessionResolver = createSessionResolver();
			const getSession = (date: string, locationId: number) =>
				getSessionResolver(deltaClient, date, locationId, sessionIds);

			const nextRing = createRingNoSequence(`BKT-${testSuffix}`);
			async function addBird(
				date: string,
				speciesId: number,
				encounters: Array<{
					age_code: number;
					is_juv: boolean;
					record_type: string;
				}>
			) {
				const birdId = await insertTestBird(deltaClient, nextRing(), speciesId);
				birdIds.push(birdId);

				const rows = [];
				for (let i = 0; i < encounters.length; i++) {
					const sessionId = await getSession(date, locationIds[i]);
					rows.push({
						capture_time: '10:00:00',
						scheme: 'BTO',
						sex: 'M',
						session_id: sessionId,
						bird_id: birdId,
						location_id: locationIds[i],
						...encounters[i]
					});
				}
				const { error: encountersError } = await deltaClient
					.from('Encounters')
					.insert(await withSessionDate(deltaClient, rows));
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
			psql(
				`DELETE FROM "Encounters" WHERE bird_id IN (${birdIds.join(', ')});` +
					`DELETE FROM "Birds" WHERE id IN (${birdIds.join(', ')});` +
					`DELETE FROM "Sessions" WHERE id IN (${sessionIds.join(', ')});` +
					`DELETE FROM "Locations" WHERE id IN (${locationIds.join(', ')});`
			);
		});

		// An ungrouped single-date aggregate row (covers exactly the one bird on `date`).
		async function bucketRow(date: string) {
			const { data, error } = await deltaClient.rpc('core_stats', {
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
			const { data, error } = await deltaClient.rpc('core_stats', {
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
			const { data, error } = await deltaClient.rpc('core_stats', {
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
			const { data, error } = await deltaClient.rpc('core_stats', {
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
				const { data, error } = await deltaClient.rpc('core_stats', {
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
		// Alpha's 11 visit dates carrying an in-hand encounter (read-only): the 9 ARRETRAP dates
		// (2021-06-20, 2022-04-30, 2022-06-15, 2022-08-10, 2022-10-20, 2023-05-12,
		// 2023-07-08, 2023-09-14, 2024-05-10) plus 2023-03-15/2023-03-20 (Fieldfare/
		// Redwing, added by #902). The 2023-05-10 FIELD_OBSERVATION-only Kingfisher
		// resighting date (also #902) never appears here: the 'day' spine is sparse,
		// built from raw_encounters' own session_day values, and that date's only
		// encounters are resighting record_types stats_raw_encounters drops (#874).
		// That row-level filter is now the sole reason — #1021 removed
		// stats_spine's separate FIELD_OBSERVATION exclusion, which only ever
		// affected the dense month/year spines anyway.
		const ALPHA_ALL_VISIT_DATES = [
			...ARRETRAP_DATES,
			'2023-03-15',
			'2023-03-20'
		];

		// Usual
		it("returns one row per distinct visit date, matching Alpha's known session dates", async () => {
			const { data, error } = await alphaClient.rpc('core_stats', {
				ringing_group_filter: alphaId,
				group_by_time_period: 'day'
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(ALPHA_ALL_VISIT_DATES.length);
			expect(data!.map((r) => r.time_period).sort()).toEqual(
				[...ALPHA_ALL_VISIT_DATES].sort()
			);
		});

		it('day-grouped session_count and encounter_count for a given date match the corresponding month-grouped row filtered to that single day', async () => {
			// 2022-04-30 is the only session in April 2022, so its day row and the
			// April 2022 month row must carry identical session/encounter counts.
			const [dayRes, monthRes] = await Promise.all([
				alphaClient.rpc('core_stats', {
					ringing_group_filter: alphaId,
					group_by_time_period: 'day'
				}),
				alphaClient.rpc('core_stats', {
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
			const { data, error } = await alphaClient.rpc('core_stats', {
				ringing_group_filter: alphaId,
				group_by_time_period: 'day'
			});
			expect(error).toBeNull();
			// 2022-04-15 falls inside Alpha's date range but has no session.
			expect(data!.find((r) => r.time_period === '2022-04-15')).toBeUndefined();
		});

		// Edge
		it('a date range spanning a single day (from_date = to_date) returns exactly one row', async () => {
			const { data, error } = await alphaClient.rpc('core_stats', {
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
			const { data, error } = await alphaClient.rpc('core_stats', {
				ringing_group_filter: alphaId,
				group_by_time_period: 'week'
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			expect(data![0].time_period).toBeNull();
			expect(data![0].encounter_count).toBe(ALPHA_TOTAL_ENCOUNTERS);
		});
	});

	// #827 removed the 8 wing/weight summary columns from core_stats_result
	// now that biometrics_stats is the sole source for them. These guard that the
	// removal holds across every grouping shape core_stats can return.
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
			const { data, error } = await alphaClient.rpc('core_stats', {
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
			const { data, error } = await alphaClient.rpc('core_stats', {
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
			const { data, error } = await alphaClient.rpc('core_stats', {
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

	// Thin confirming assertion — the actual exclusion logic is covered in depth by
	// stats-raw-encounters-and-spine.test.ts, since core_stats inherits it from the
	// shared stats_raw_encounters utility RPC (#874).
	describe('resighting record_type exclusion (#874)', () => {
		let deltaId: number;
		let deltaClient: SupabaseClient;
		let locationId: number;
		let sessionId: number;
		let birdId: number;
		let visitDate: string;

		beforeAll(async () => {
			deltaId = await getGroupIdByName('Delta');
			deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);

			const { data: robin, error: robinError } = await supabase
				.from('Species')
				.select('id')
				.eq('species_name', 'Robin')
				.single();
			if (robinError || !robin)
				throw robinError ?? new Error('Robin not found');

			const suffix = randomTestSuffix();
			visitDate = randomFutureDate();

			const { data: location, error: locationError } = await deltaClient
				.from('Locations')
				.insert({
					location_name: `CoreStats Resighting ${suffix}`,
					ringing_group_id: deltaId
				})
				.select('id')
				.single();
			if (locationError) throw locationError;
			locationId = location!.id;

			const { data: session, error: sessionError } = await deltaClient
				.from('Sessions')
				.insert({ visit_date: visitDate, ringing_group_id: deltaId })
				.select('id')
				.single();
			if (sessionError) throw sessionError;
			sessionId = session!.id;

			const { data: bird, error: birdError } = await deltaClient
				.from('Birds')
				.insert({ ring_no: `CS-RSE-${suffix}`, species_id: robin!.id })
				.select('id')
				.single();
			if (birdError) throw birdError;
			birdId = bird!.id;

			// A single resighting-only encounter — no capture at all this session.
			const { error: encounterError } = await deltaClient
				.from('Encounters')
				.insert({
					capture_time: '10:00:00',
					scheme: 'BTO',
					sex: 'M',
					session_id: sessionId,
					location_id: locationId,
					visit_date: visitDate,
					bird_id: birdId,
					age_code: 4,
					record_type: 'U',
					weight: 10,
					wing_length: 50
				});
			if (encounterError) throw encounterError;
		});

		afterAll(() => {
			psql(
				`DELETE FROM "Encounters" WHERE bird_id = ${birdId};` +
					`DELETE FROM "Birds" WHERE id = ${birdId};` +
					`DELETE FROM "Sessions" WHERE id = ${sessionId};` +
					`DELETE FROM "Locations" WHERE id = ${locationId};`
			);
		});

		it('excludes a resighting-only session/bird from encounter_count and bird_count', async () => {
			const { data, error } = await deltaClient.rpc('core_stats', {
				ringing_group_filter: deltaId,
				from_date: visitDate,
				to_date: visitDate
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			// The resighting-only encounter/bird/session must not surface at all — the
			// row is the all-zero shape a date range with no in-scope captures returns.
			expect(data![0].encounter_count).toBe(0);
			expect(data![0].bird_count).toBe(0);
		});
	});
});
