/**
 * Integration tests for the `stats_cache_basic_session_metrics` Postgres RPC
 * function (#1146).
 *
 * One of the small, read-only "metric-group" RPCs the stats-cache refresh
 * pipeline calls to populate the `SimpleStatsCache` tables. Originally written
 * as a direct port of the since-deleted group-wide aggregate RPC's basic-count
 * and session CTE chain, keyed on `species_id` rather than that RPC's
 * display-oriented `species_name` and carrying none of its age-dimension
 * columns.
 *
 * Because it was a port, this suite used to establish its expectations by
 * calling that RPC alongside this one and comparing the two cell for cell — a
 * reasonable oracle while it was the trusted baseline. It was dropped from the
 * schema in #1359, so every block below now derives its expectations from its
 * own purpose-built fixture instead (#1363): an isolated group whose entire
 * encounter history is the handful of rows the block's arrange step lists, and
 * literal expected numbers a reader can check straight off that list. This file
 * is now the only value oracle these ten columns have.
 *
 * Requires local Supabase running and e2e seed data loaded (for the `Species`
 * reference rows the fixtures below look species ids up in):
 *   npm run db:start:local
 *   npm run db:seed:e2e
 *
 * Run with: npm run test:integration
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { getAuthenticatedSupabaseClientForGroup } from '../../../app/lib/auth/group-auth';
import { supabase } from '../../../lib/supabase';
import { randomTestSuffix, randomFutureDate, addDays } from '../test-isolation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createIsolatedGroup, psql } from '../db-test-helpers';
import {
	insertTestLocation,
	createSessionResolver,
	insertTestBird,
	insertTestEncounter,
	createRingNoSequence
} from './helpers/encounter-fixtures';

// numeric-typed columns can come back as a JS number or a stringified numeric
// depending on the driver; coerce before comparing.
const num = (value: unknown): number => Number(value);

/** The ten result columns these tests assert on. */
type MetricsRow = {
	species_id: number | null;
	time_period: string | null;
	species_count: unknown;
	bird_count: unknown;
	encounter_count: unknown;
	new_bird_count: unknown;
	session_count: unknown;
	avg_encounters_per_session: unknown;
	max_per_session: unknown;
	max_new_per_session: unknown;
};

/** Fields an `addBird`/`addEncounter` call may set on the Encounters row it writes. */
type FixtureEncounterFields = {
	record_type: string;
	capture_time?: string;
};

/**
 * A throwaway group with one location, an `addBird`/`addEncounter` pair for
 * writing its entire encounter history by hand, a `callMetrics` bound to it, and
 * the teardown for everything it wrote.
 *
 * Every block below wants exactly this shape: an isolated group holding nothing
 * but the rows the block's arrange step lists, so each expected number can be
 * read straight off that list rather than off shared seed data. A dedicated
 * group rather than one of the `Alpha`..`Delta` seed groups because a Sessions
 * row is keyed on `(visit_date, ringing_group_id)`, and the dates below are
 * drawn from the same narrow random-year band several other RPC integration
 * files draw from — an isolated group's id is unique, so no collision with a
 * concurrent worktree's run is possible.
 */
async function createFixtureGroup(label: string): Promise<{
	groupId: number;
	groupClient: SupabaseClient;
	addBird: (
		speciesId: number,
		date: string,
		fields: FixtureEncounterFields
	) => Promise<number>;
	addEncounter: (
		birdId: number,
		date: string,
		fields: FixtureEncounterFields
	) => Promise<void>;
	callMetrics: (args: Record<string, unknown>) => Promise<MetricsRow[]>;
	cleanUp: () => void;
}> {
	const testSuffix = randomTestSuffix();
	const groupId = createIsolatedGroup(
		`StatsCacheBasicSession ${label} ${testSuffix}`
	);
	const groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
	const locationId = await insertTestLocation(
		groupClient,
		groupId,
		`StatsCacheBasicSession ${label} Loc ${testSuffix}`
	);

	const sessionIds: number[] = [];
	const birdIds: number[] = [];
	const getSession = createSessionResolver();
	const nextRing = createRingNoSequence(`SCBS${label.toUpperCase()}-${testSuffix}`);

	/** Adds one encounter for an existing bird, on that group-day's shared session. */
	async function addEncounter(
		birdId: number,
		date: string,
		fields: FixtureEncounterFields
	): Promise<void> {
		const sessionId = await getSession(
			groupClient,
			date,
			locationId,
			sessionIds
		);
		// age_code 4 (adult) throughout: this RPC carries no age dimension at all,
		// so the fixtures never need to vary it.
		await insertTestEncounter(groupClient, birdId, sessionId, {
			age_code: 4,
			...fields
		});
	}

	return {
		groupId,
		groupClient,
		async addBird(speciesId, date, fields) {
			const birdId = await insertTestBird(groupClient, nextRing(), speciesId);
			birdIds.push(birdId);
			await addEncounter(birdId, date, fields);
			return birdId;
		},
		addEncounter,
		async callMetrics(args) {
			const { data, error } = await groupClient.rpc(
				'stats_cache_basic_session_metrics',
				{ ringing_group_filter: groupId, ...args }
			);
			expect(error).toBeNull();
			return data!;
		},
		cleanUp() {
			psql(
				`DELETE FROM "Encounters" WHERE bird_id IN (${birdIds.join(', ')});` +
					`DELETE FROM "Birds" WHERE id IN (${birdIds.join(', ')});` +
					`DELETE FROM "Sessions" WHERE id IN (${sessionIds.join(', ')});` +
					`DELETE FROM "Locations" WHERE id = ${locationId};` +
					`DELETE FROM "RingingGroups" WHERE id = ${groupId};`
			);
		}
	};
}

type FixtureGroup = Awaited<ReturnType<typeof createFixtureGroup>>;

/** Keys a result on the `(species_id, time_period)` cell identity it reports. */
function byCell(rows: MetricsRow[]): Map<string, MetricsRow> {
	return new Map(
		rows.map((row) => [
			`${row.species_id ?? 'all'}|${row.time_period ?? 'all'}`,
			row
		])
	);
}

/** The cells a result covers, sorted so an expected list can be written in any order. */
function cellsOf(rows: MetricsRow[]): string[] {
	return [...byCell(rows).keys()].sort();
}

/** A random year well clear of the 2021–2024 seed range, with room for `yr + 1`. */
function randomFixtureYear(): number {
	return 2080 + Math.floor(Math.random() * 18);
}

describe('stats_cache_basic_session_metrics', () => {
	/** species_name -> species_id, for the fixtures below to hang encounters off. */
	let speciesIdByName: Map<string, number>;

	beforeAll(async () => {
		const { data, error } = await supabase
			.from('Species')
			.select('id, species_name');
		if (error) throw error;
		speciesIdByName = new Map(
			data!.map((species) => [species.species_name, species.id])
		);
	});

	// Two species over three calendar months, with encounters in only the first
	// and last of them — so the middle month exercises the spine's
	// COALESCE-to-0 path (an in-range cell with nothing joined to it must report
	// zeroes, not vanish). Every count is known by construction: one Robin is
	// caught twice in March (so bird_count < encounter_count there) and another
	// returns in May as a retrap (so bird_count > new_bird_count there).
	describe('basic counts', () => {
		let fixture: FixtureGroup;
		let robinId: number;
		let wrenId: number;
		let yr: number;
		/** March: Robin A (new) + Robin B (new). */
		let marFirst: string;
		/** March, 7 days later: Robin A again, as a retrap. */
		let marSecond: string;
		/** May: Wren C (new) + Robin B again, as a retrap. The April between is empty. */
		let may: string;

		beforeAll(async () => {
			fixture = await createFixtureGroup('Counts');
			robinId = speciesIdByName.get('Robin')!;
			wrenId = speciesIdByName.get('Wren')!;

			yr = randomFixtureYear();
			marFirst = `${yr}-03-05`;
			marSecond = `${yr}-03-12`;
			may = `${yr}-05-08`;

			const robinA = await fixture.addBird(robinId, marFirst, {
				record_type: 'N'
			});
			const robinB = await fixture.addBird(robinId, marFirst, {
				record_type: 'N'
			});
			await fixture.addEncounter(robinA, marSecond, { record_type: 'R' });
			await fixture.addBird(wrenId, may, { record_type: 'N' });
			await fixture.addEncounter(robinB, may, { record_type: 'R' });
		});

		afterAll(() => fixture.cleanUp());

		/** The six (species, month) cells the March–May window's dense spine covers. */
		async function callGroupedBySpeciesAndMonth(): Promise<
			Map<string, MetricsRow>
		> {
			return byCell(
				await fixture.callMetrics({
					from_date: `${yr}-03-01`,
					to_date: `${yr}-05-31`,
					group_by_species: true,
					group_by_time_period: 'month'
				})
			);
		}

		it('reports species_count/bird_count/encounter_count/new_bird_count matching a known small fixture, grouped by species and month', async () => {
			const cells = await callGroupedBySpeciesAndMonth();

			// Robin in March: 3 encounters of 2 birds (A twice, B once), both first
			// ringed there — so encounter_count exceeds bird_count, which equals
			// new_bird_count.
			const robinMarch = cells.get(`${robinId}|${yr}-03-01`)!;
			expect(num(robinMarch.species_count)).toBe(1);
			expect(num(robinMarch.bird_count)).toBe(2);
			expect(num(robinMarch.encounter_count)).toBe(3);
			expect(num(robinMarch.new_bird_count)).toBe(2);
			// Two distinct March dates carried those 3 encounters.
			expect(num(robinMarch.session_count)).toBe(2);

			// Robin in May: B's retrap alone — a bird that counts towards
			// bird_count but not new_bird_count.
			const robinMay = cells.get(`${robinId}|${yr}-05-01`)!;
			expect(num(robinMay.bird_count)).toBe(1);
			expect(num(robinMay.encounter_count)).toBe(1);
			expect(num(robinMay.new_bird_count)).toBe(0);

			// Wren in May: its single newly-ringed bird.
			const wrenMay = cells.get(`${wrenId}|${yr}-05-01`)!;
			expect(num(wrenMay.species_count)).toBe(1);
			expect(num(wrenMay.bird_count)).toBe(1);
			expect(num(wrenMay.encounter_count)).toBe(1);
			expect(num(wrenMay.new_bird_count)).toBe(1);

			// The Wren was never caught in March, so its March cell is empty even
			// though the month itself is not.
			const wrenMarch = cells.get(`${wrenId}|${yr}-03-01`)!;
			expect(num(wrenMarch.species_count)).toBe(0);
			expect(num(wrenMarch.encounter_count)).toBe(0);
		});

		it('reports zeroes, not a missing row, for a month with no encounters at all', async () => {
			const cells = await callGroupedBySpeciesAndMonth();

			// The month spine is dense between the fixture's first and last session
			// date, so April appears for both species despite holding nothing.
			expect(cellsOf([...cells.values()])).toEqual(
				[
					`${robinId}|${yr}-03-01`,
					`${robinId}|${yr}-04-01`,
					`${robinId}|${yr}-05-01`,
					`${wrenId}|${yr}-03-01`,
					`${wrenId}|${yr}-04-01`,
					`${wrenId}|${yr}-05-01`
				].sort()
			);

			for (const speciesId of [robinId, wrenId]) {
				const april = cells.get(`${speciesId}|${yr}-04-01`)!;
				expect(num(april.species_count)).toBe(0);
				expect(num(april.bird_count)).toBe(0);
				expect(num(april.encounter_count)).toBe(0);
				expect(num(april.new_bird_count)).toBe(0);
				expect(num(april.session_count)).toBe(0);
			}
		});
	});

	describe('session metrics', () => {
		// Two consecutive group-days whose encounter mix keeps every session
		// metric on a distinct value arithmetic alone reaches — in particular
		// holding max_per_session and max_new_per_session apart.
		describe('across a two-session window', () => {
			let fixture: FixtureGroup;
			let yr: number;
			/** 3 encounters, 2 of them new. */
			let busyDay: string;
			/** 2 encounters, both new. */
			let briefDay: string;

			beforeAll(async () => {
				fixture = await createFixtureGroup('SessionMetrics');
				const robinId = speciesIdByName.get('Robin')!;

				yr = randomFixtureYear();
				busyDay = `${yr}-06-10`;
				briefDay = `${yr}-06-11`;

				await fixture.addBird(robinId, busyDay, {
					record_type: 'N',
					capture_time: '08:00:00'
				});
				await fixture.addBird(robinId, busyDay, {
					record_type: 'N',
					capture_time: '09:30:00'
				});
				await fixture.addBird(robinId, busyDay, {
					record_type: 'R',
					capture_time: '12:00:00'
				});
				await fixture.addBird(robinId, briefDay, {
					record_type: 'N',
					capture_time: '10:00:00'
				});
				await fixture.addBird(robinId, briefDay, {
					record_type: 'N',
					capture_time: '10:30:00'
				});
			});

			afterAll(() => fixture.cleanUp());

			it('reports session_count/avg_encounters_per_session/max_per_session/max_new_per_session matching a known small fixture', async () => {
				const rows = await fixture.callMetrics({
					from_date: busyDay,
					to_date: briefDay
				});
				expect(rows).toHaveLength(1);
				const row = rows[0];
				expect(row.species_id).toBeNull();
				expect(row.time_period).toBeNull();

				// Two distinct dates carried the window's 5 encounters.
				expect(num(row.session_count)).toBe(2);
				expect(num(row.encounter_count)).toBe(5);

				// (3 + 2) / 2 encounters per session.
				expect(num(row.avg_encounters_per_session)).toBeCloseTo(2.5, 6);
				// The busy day's 3 encounters...
				expect(num(row.max_per_session)).toBe(3);
				// ...of which only 2 were new, the same as the brief day's total.
				expect(num(row.max_new_per_session)).toBe(2);
			});
		});

		// The `session_counts` CTE must group by species only when the caller asked
		// for a per-species breakdown. Grouping by a bare species_id regardless
		// (#1049) makes a group-wide call's max_per_session ("Busiest session"),
		// max_new_per_session and avg_encounters_per_session describe the busiest/
		// average SPECIES WITHIN a session rather than the session itself — prod's
		// /summary/sep reported 39, its biggest single species, for a 2026 whose
		// busiest session held 62 birds. Two mixed-species group-days separate the
		// two readings: no single species accounts for a whole session, and a
		// species-split average divides by a different denominator.
		describe('honouring group_by_species in session_counts (the #1049 regression)', () => {
			let groupId: number;
			let groupClient: SupabaseClient;
			const locationIds: number[] = [];
			const sessionIds: number[] = [];
			const birdIds: number[] = [];
			// 5 encounters over two species (3 Robin, 2 Wren), 4 of them new. Its
			// biggest single species is 3, whose new count is 3.
			let busiestDate: string;
			// 2 encounters, both Robin, both new.
			let quieterDate: string;

			beforeAll(async () => {
				const testSuffix = randomTestSuffix();
				groupId = createIsolatedGroup(
					`StatsCacheBasicSession GroupBySpecies ${testSuffix}`
				);
				groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);

				busiestDate = randomFutureDate();
				quieterDate = addDays(busiestDate, 1);

				const robinId = speciesIdByName.get('Robin')!;
				const wrenId = speciesIdByName.get('Wren')!;

				const locationId = await insertTestLocation(
					groupClient,
					groupId,
					`StatsCacheBasicSession GBS Loc ${testSuffix}`
				);
				locationIds.push(locationId);

				const getSession = createSessionResolver();
				const nextRing = createRingNoSequence(`SCBSGBS-${testSuffix}`);
				async function addBird(
					speciesId: number,
					date: string,
					recordType: string
				): Promise<void> {
					const birdId = await insertTestBird(
						groupClient,
						nextRing(),
						speciesId
					);
					birdIds.push(birdId);
					const sessionId = await getSession(
						groupClient,
						date,
						locationId,
						sessionIds
					);
					await insertTestEncounter(groupClient, birdId, sessionId, {
						age_code: 4,
						record_type: recordType
					});
				}

				await addBird(robinId, busiestDate, 'N');
				await addBird(robinId, busiestDate, 'N');
				await addBird(robinId, busiestDate, 'N');
				await addBird(wrenId, busiestDate, 'N');
				await addBird(wrenId, busiestDate, 'R');
				await addBird(robinId, quieterDate, 'N');
				await addBird(robinId, quieterDate, 'N');
			});

			afterAll(() => {
				psql(
					`DELETE FROM "Encounters" WHERE bird_id IN (${birdIds.join(', ')});` +
						`DELETE FROM "Birds" WHERE id IN (${birdIds.join(', ')});` +
						`DELETE FROM "Sessions" WHERE id IN (${sessionIds.join(', ')});` +
						`DELETE FROM "Locations" WHERE id IN (${locationIds.join(', ')});` +
						`DELETE FROM "RingingGroups" WHERE id = ${groupId};`
				);
			});

			it('describes the busiest SESSION, not the busiest species within it, on a group-wide call', async () => {
				const { data, error } = await groupClient.rpc(
					'stats_cache_basic_session_metrics',
					{
						ringing_group_filter: groupId,
						from_date: busiestDate,
						to_date: quieterDate
					}
				);
				expect(error).toBeNull();
				expect(data).toHaveLength(1);
				const row = data![0];
				expect(row.species_id).toBeNull();
				// 5, not the 3 a bare species_id grouping would report.
				expect(num(row.max_per_session)).toBe(5);
				// 4, not 3.
				expect(num(row.max_new_per_session)).toBe(4);
				// (5 + 2) / 2, not (3 + 2 + 2) / 3.
				expect(num(row.avg_encounters_per_session)).toBeCloseTo(3.5, 6);
			});

			it('still describes the busiest species-within-a-session when group_by_species is true', async () => {
				const { data, error } = await groupClient.rpc(
					'stats_cache_basic_session_metrics',
					{
						ringing_group_filter: groupId,
						from_date: busiestDate,
						to_date: quieterDate,
						group_by_species: true
					}
				);
				expect(error).toBeNull();
				expect(data).toHaveLength(2);
				const bySpecies = new Map(data!.map((row) => [row.species_id, row]));
				const robin = bySpecies.get(speciesIdByName.get('Robin')!)!;
				const wren = bySpecies.get(speciesIdByName.get('Wren')!)!;
				// Robin: 3 on the busiest date, 2 on the quieter one.
				expect(num(robin.max_per_session)).toBe(3);
				expect(num(robin.avg_encounters_per_session)).toBeCloseTo(2.5, 6);
				// Wren: 2 on the busiest date only, 1 of them new.
				expect(num(wren.max_per_session)).toBe(2);
				expect(num(wren.max_new_per_session)).toBe(1);
			});
		});

		// No CTE here carries a session-type-equivalent filter (#1021/#1024):
		// Sessions.session_type is gone, and stats_raw_encounters' record_type
		// exclusion (#874) is the only thing deciding what counts as real data.
		// So a nestling-only group-day counts as a session like any other, while
		// a resighting-only date contributes nothing at all — for the row-level
		// #874 reason, not a session-type one.
		describe('session-type-blind session counting (the #1021/#1024 behaviour)', () => {
			let groupId: number;
			let groupClient: SupabaseClient;
			const locationIds: number[] = [];
			const sessionIds: number[] = [];
			const birdIds: number[] = [];
			// Two nestling (age_code 1) captures.
			let pulliOnlyDate: string;
			// One resighting-record_type encounter and nothing else.
			let fieldObservationOnlyDate: string;

			beforeAll(async () => {
				const testSuffix = randomTestSuffix();
				groupId = createIsolatedGroup(
					`StatsCacheBasicSession SessionTypeBlind ${testSuffix}`
				);
				groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);

				pulliOnlyDate = randomFutureDate();
				fieldObservationOnlyDate = addDays(pulliOnlyDate, 1);

				const robinId = speciesIdByName.get('Robin')!;

				const locationId = await insertTestLocation(
					groupClient,
					groupId,
					`StatsCacheBasicSession SessionTypeBlind Loc ${testSuffix}`
				);
				locationIds.push(locationId);

				const getSession = createSessionResolver();
				const nextRing = createRingNoSequence(`SCBSEFF-${testSuffix}`);
				async function addBird(
					date: string,
					fields: { age_code: number; record_type: string; capture_time: string }
				): Promise<void> {
					const birdId = await insertTestBird(groupClient, nextRing(), robinId);
					birdIds.push(birdId);
					const sessionId = await getSession(
						groupClient,
						date,
						locationId,
						sessionIds
					);
					await insertTestEncounter(groupClient, birdId, sessionId, fields);
				}

				await addBird(pulliOnlyDate, {
					age_code: 1,
					record_type: 'N',
					capture_time: '09:00:00'
				});
				await addBird(pulliOnlyDate, {
					age_code: 1,
					record_type: 'N',
					capture_time: '13:00:00'
				});
				await addBird(fieldObservationOnlyDate, {
					age_code: 4,
					record_type: 'U',
					capture_time: '10:00:00'
				});
			});

			afterAll(() => {
				psql(
					`DELETE FROM "Encounters" WHERE bird_id IN (${birdIds.join(', ')});` +
						`DELETE FROM "Birds" WHERE id IN (${birdIds.join(', ')});` +
						`DELETE FROM "Sessions" WHERE id IN (${sessionIds.join(', ')});` +
						`DELETE FROM "Locations" WHERE id IN (${locationIds.join(', ')});` +
						`DELETE FROM "RingingGroups" WHERE id = ${groupId};`
				);
			});

			it('counts a pulli-only session like any other, and leaves a field-observation-only date out entirely', async () => {
				const { data, error } = await groupClient.rpc(
					'stats_cache_basic_session_metrics',
					{
						ringing_group_filter: groupId,
						from_date: pulliOnlyDate,
						to_date: fieldObservationOnlyDate
					}
				);
				expect(error).toBeNull();
				expect(data).toHaveLength(1);
				const row = data![0];
				// Only the nestling date counts — the resighting-only date has no
				// in-hand encounter for stats_raw_encounters to surface (#874).
				expect(num(row.session_count)).toBe(1);
				expect(num(row.encounter_count)).toBe(2);
				// Before #1021/#1024 a pulli-only date contributed to none of these.
				expect(num(row.max_per_session)).toBe(2);
				expect(num(row.max_new_per_session)).toBe(2);
				expect(num(row.avg_encounters_per_session)).toBe(2);
			});
		});
	});

	// One dataset, two species, four group-days spread over two calendar years
	// with a gap month between the first two — enough for every grouping mode's
	// cell set to be a short, explicit list. These assert cell shape only: which
	// (species_id, time_period) cells a mode's species_id/time_period projection
	// and spine join produce. The per-column values in those cells are pinned by
	// the two blocks above.
	describe('grouping shapes', () => {
		let fixture: FixtureGroup;
		let robinId: number;
		let wrenId: number;
		let yr: number;
		let robinMar: string;
		let wrenMar: string;
		/** The April between this and `robinMar` is the month spine's empty cell. */
		let robinMay: string;
		/** The following January, so the year spine spans two cells. */
		let robinNextJan: string;

		beforeAll(async () => {
			fixture = await createFixtureGroup('Shapes');
			robinId = speciesIdByName.get('Robin')!;
			wrenId = speciesIdByName.get('Wren')!;

			yr = randomFixtureYear();
			robinMar = `${yr}-03-10`;
			wrenMar = `${yr}-03-15`;
			robinMay = `${yr}-05-10`;
			robinNextJan = `${yr + 1}-01-20`;

			await fixture.addBird(robinId, robinMar, { record_type: 'N' });
			await fixture.addBird(wrenId, wrenMar, { record_type: 'N' });
			await fixture.addBird(robinId, robinMay, { record_type: 'N' });
			await fixture.addBird(robinId, robinNextJan, { record_type: 'N' });
		});

		afterAll(() => fixture.cleanUp());

		it('ungrouped', async () => {
			const rows = await fixture.callMetrics({});
			expect(cellsOf(rows)).toEqual(['all|all']);
		});

		it('grouped per species', async () => {
			// species_spine is built from the encounters themselves, so only the two
			// species the group actually caught appear.
			const rows = await fixture.callMetrics({ group_by_species: true });
			expect(cellsOf(rows)).toEqual([`${robinId}|all`, `${wrenId}|all`].sort());
		});

		it('grouped per day', async () => {
			// The day spine is sparse: one cell per date that actually has an
			// encounter, never the empty days between them.
			const rows = await fixture.callMetrics({ group_by_time_period: 'day' });
			expect(cellsOf(rows)).toEqual(
				[
					`all|${robinMar}`,
					`all|${wrenMar}`,
					`all|${robinMay}`,
					`all|${robinNextJan}`
				].sort()
			);
		});

		it('grouped per month', async () => {
			// The month spine is dense between the window's first and last session
			// date, so the encounter-free April appears between March and May.
			const rows = await fixture.callMetrics({
				from_date: `${yr}-03-01`,
				to_date: `${yr}-05-31`,
				group_by_time_period: 'month'
			});
			expect(cellsOf(rows)).toEqual(
				[`all|${yr}-03-01`, `all|${yr}-04-01`, `all|${yr}-05-01`].sort()
			);
		});

		it('grouped per year', async () => {
			const rows = await fixture.callMetrics({ group_by_time_period: 'year' });
			expect(cellsOf(rows)).toEqual(
				[`all|${yr}-01-01`, `all|${yr + 1}-01-01`].sort()
			);
		});

		it('grouped per month-squashed', async () => {
			const rows = await fixture.callMetrics({
				group_by_time_period: 'month-squashed'
			});
			// Always exactly twelve year-agnostic month buckets (#996), on the
			// 2000-<mm>-01 sentinel-year convention — independent of the four
			// calendar months this fixture's dates actually touch.
			expect(cellsOf(rows)).toEqual(
				Array.from(
					{ length: 12 },
					(_, index) => `all|2000-${String(index + 1).padStart(2, '0')}-01`
				).sort()
			);
			expect(rows).toHaveLength(12);
		});
	});

	// Every block above exercises a cache-aligned window (a whole year/month/
	// month-squashed, or no window at all). An ungrouped-by-time, grouped-by-
	// species, arbitrary (non-calendar-aligned) from_date/to_date window is the
	// shape the /species list page's free-text date inputs used to ask for
	// before #1434 deleted that page, and the one the RPC still has to answer, so
	// it gets its own fixture: five group-days straddling the window, two of them
	// landing exactly on its boundaries and two a single day outside.
	describe('arbitrary (non-cache-aligned) date window', () => {
		let fixture: FixtureGroup;
		let robinId: number;
		let wrenId: number;
		let yr: number;
		/** One day before `fromDate` — a Robin that must not be counted. */
		let dayBefore: string;
		/** Exactly `fromDate` — one newly-ringed Robin at 10:00. */
		let fromDate: string;
		/** Mid-window: 2 Robins (one new, one retrap) and a Wren, 09:00–12:00. */
		let midWindow: string;
		/** Exactly `toDate` — one newly-ringed Wren at 10:00. */
		let toDate: string;
		/** One day after `toDate` — a Wren that must not be counted. */
		let dayAfter: string;

		beforeAll(async () => {
			fixture = await createFixtureGroup('Window');
			robinId = speciesIdByName.get('Robin')!;
			wrenId = speciesIdByName.get('Wren')!;

			yr = randomFixtureYear();
			// The same non-calendar-aligned shape the app's old "CES only" preset
			// used (`${year}-04-25`..`${year}-09-05`): neither bound is a month
			// boundary, so no whole-month or whole-year cache cell can stand in for
			// this window.
			fromDate = `${yr}-04-25`;
			toDate = `${yr}-09-05`;
			dayBefore = addDays(fromDate, -1);
			dayAfter = addDays(toDate, 1);
			midWindow = `${yr}-06-15`;

			await fixture.addBird(robinId, dayBefore, { record_type: 'N' });
			await fixture.addBird(robinId, fromDate, { record_type: 'N' });
			await fixture.addBird(robinId, midWindow, {
				record_type: 'N',
				capture_time: '09:00:00'
			});
			await fixture.addBird(robinId, midWindow, {
				record_type: 'R',
				capture_time: '11:00:00'
			});
			await fixture.addBird(wrenId, midWindow, {
				record_type: 'N',
				capture_time: '12:00:00'
			});
			await fixture.addBird(wrenId, toDate, { record_type: 'N' });
			await fixture.addBird(wrenId, dayAfter, { record_type: 'N' });
		});

		afterAll(() => fixture.cleanUp());

		it('reports basic counts and session metrics matching a known fixture for a non-calendar-aligned date range, grouped by species', async () => {
			const rows = await fixture.callMetrics({
				from_date: fromDate,
				to_date: toDate,
				group_by_species: true
			});
			const bySpecies = new Map(rows.map((row) => [row.species_id, row]));
			expect([...bySpecies.keys()].sort()).toEqual([robinId, wrenId].sort());

			// Robin in window: the fromDate bird plus the two mid-window ones — the
			// day-before bird is excluded.
			const robin = bySpecies.get(robinId)!;
			expect(num(robin.species_count)).toBe(1);
			expect(num(robin.bird_count)).toBe(3);
			expect(num(robin.encounter_count)).toBe(3);
			// Two of those three were newly ringed; the third is a retrap.
			expect(num(robin.new_bird_count)).toBe(2);
			expect(num(robin.session_count)).toBe(2);
			// Per-species session counts: 1 on fromDate, 2 mid-window.
			expect(num(robin.max_per_session)).toBe(2);
			// Only one of the mid-window pair was new, matching fromDate's single one.
			expect(num(robin.max_new_per_session)).toBe(1);
			expect(num(robin.avg_encounters_per_session)).toBeCloseTo(1.5, 6);

			// Wren in window: one mid-window bird and one on toDate — the day-after
			// bird is excluded.
			const wren = bySpecies.get(wrenId)!;
			expect(num(wren.bird_count)).toBe(2);
			expect(num(wren.encounter_count)).toBe(2);
			expect(num(wren.new_bird_count)).toBe(2);
			expect(num(wren.session_count)).toBe(2);
			expect(num(wren.max_per_session)).toBe(1);
			expect(num(wren.max_new_per_session)).toBe(1);
			expect(num(wren.avg_encounters_per_session)).toBeCloseTo(1, 6);
		});

		it('includes a session landing exactly on a boundary date and excludes one a day outside it', async () => {
			const withinBoundaries = new Map(
				(
					await fixture.callMetrics({
						from_date: fromDate,
						to_date: toDate,
						group_by_species: true
					})
				).map((row) => [row.species_id, row])
			);
			// Robin: fromDate + mid-window. Wren: mid-window + toDate. Both bounds
			// are inclusive, and nothing outside them is reachable.
			expect(num(withinBoundaries.get(robinId)!.session_count)).toBe(2);
			expect(num(withinBoundaries.get(wrenId)!.session_count)).toBe(2);

			const oneDayWider = new Map(
				(
					await fixture.callMetrics({
						from_date: dayBefore,
						to_date: dayAfter,
						group_by_species: true
					})
				).map((row) => [row.species_id, row])
			);
			// Widening by a single day at each end brings in exactly the two
			// just-outside group-days, one per species.
			expect(num(oneDayWider.get(robinId)!.session_count)).toBe(3);
			expect(num(oneDayWider.get(wrenId)!.session_count)).toBe(3);
		});
	});
});
