/**
 * Integration tests for the `arrivals_stats` Postgres RPC function (#858).
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
import { addDays, randomTestSuffix } from '../test-isolation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getGroupIdByName } from './helpers/seed-lookups';
import { resolveAlphaBetaGammaClients } from './helpers/group-clients';

// arrivals_stats counts each bird exactly ONCE per calendar year, at whichever
// (species, time_period) cell holds its first classifiable encounter of that year
// — unlike aggregate_stats/population_stats, whose per-cell bucket counts re-count
// the same bird in every cell it appears in. The fixtures below therefore care
// about (a) which encounter of a year is picked, and (b) which cell that encounter
// lands in, not just the totals.
//
// All rows are written on randomly-chosen far-future dates (a random year in
// 2080–2099 plus a random day-of-year "lane" offset), so concurrent worktree runs
// against the shared local Supabase instance never combine their birds into the
// same aggregate cell, and never collide with the 2021–2024 e2e seed data. Each
// scenario owns a disjoint slice of the lane so a narrowly-windowed query returns
// only that scenario's birds.
describe('arrivals_stats', () => {
	let alphaId: number;
	let alphaClient: SupabaseClient;
	let deltaId: number;
	let deltaClient: SupabaseClient;

	const locationIds: number[] = [];
	const sessionIds: number[] = [];
	const birdIds: number[] = [];
	const alphaLocationIds: number[] = [];
	const alphaSessionIds: number[] = [];

	const PULLUS = { age_code: 1, is_juv: false };
	const JUV = { age_code: 1, is_juv: true };
	const POSTJUV = { age_code: 3, is_juv: false };
	const ADULT = { age_code: 4, is_juv: false };
	// age_code 2 is neither pullus/juv/postjuv nor adult — the 'unknown' bucket.
	const UNKNOWN_AGE = { age_code: 2, is_juv: false };

	// The arrival calendar year under test, plus the year before it (used for
	// lifetime history that makes an adult "returning" rather than "new").
	const arrivalYear = 2080 + Math.floor(Math.random() * 20);
	const priorYear = arrivalYear - 1;
	// Random day-of-year offset so two concurrent runs in the same year still use
	// different dates. Capped so the largest lane offset below stays inside the year.
	const laneStart = 1 + Math.floor(Math.random() * 60);
	const dayIn = (year: number, offset: number) =>
		addDays(`${year}-01-01`, laneStart + offset);
	/** The month cell (date_trunc('month')) an ISO date falls in. */
	const monthOf = (isoDate: string) => `${isoDate.slice(0, 7)}-01`;

	// Lane offsets, one disjoint slice per scenario.
	const newAdultDate = dayIn(arrivalYear, 0);
	const returningAdultDate = dayIn(arrivalYear, 5);
	const pullusDate = dayIn(arrivalYear, 10);
	const juvDate = dayIn(arrivalYear, 15);
	const postjuvDate = dayIn(arrivalYear, 20);
	// Three encounters of one bird in one year, ≥45 days apart so each falls in its
	// own calendar month.
	const multiCellDates = [
		dayIn(arrivalYear, 30),
		dayIn(arrivalYear, 75),
		dayIn(arrivalYear, 120)
	];
	const unknownAgeDate = dayIn(arrivalYear, 130);
	const classifiableDate = dayIn(arrivalYear, 175);
	const crossGroupDate = dayIn(arrivalYear, 200);
	const tieDate = dayIn(arrivalYear, 220);
	const twoYearDates = [dayIn(priorYear, 250), dayIn(arrivalYear, 250)];

	beforeAll(async () => {
		({ alphaId, alphaClient } = await resolveAlphaBetaGammaClients());
		deltaId = await getGroupIdByName('Delta');
		deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);

		const testSuffix = randomTestSuffix();

		const { data: species } = await supabase
			.from('Species')
			.select('id, species_name')
			.in('species_name', ['Robin', 'Blue Tit']);
		const robinId = species!.find((s) => s.species_name === 'Robin')!.id;
		const blueTitId = species!.find((s) => s.species_name === 'Blue Tit')!.id;

		async function addLocation(
			client: SupabaseClient,
			ringingGroupId: number,
			label: string,
			track: number[]
		) {
			const { data, error } = await client
				.from('Locations')
				.insert({
					location_name: `Arrivals ${label} ${testSuffix}`,
					ringing_group_id: ringingGroupId
				})
				.select('id')
				.single();
			if (error) throw error;
			track.push(data!.id);
			return data!.id;
		}

		const deltaLocId = await addLocation(
			deltaClient,
			deltaId,
			'Delta Loc',
			locationIds
		);
		// A second Delta location so two encounters of one bird can share a date
		// without sharing a session (same-session retraps are suppressed by trigger).
		const deltaLocId2 = await addLocation(
			deltaClient,
			deltaId,
			'Delta Loc 2',
			locationIds
		);
		const alphaLocId = await addLocation(
			alphaClient,
			alphaId,
			'Alpha Loc',
			alphaLocationIds
		);

		const sessionCache = new Map<string, number>();
		async function getSession(
			client: SupabaseClient,
			date: string,
			locationId: number,
			track: number[]
		) {
			const key = `${date}|${locationId}`;
			const cached = sessionCache.get(key);
			if (cached !== undefined) return cached;
			const { data, error } = await client
				.from('Sessions')
				.insert({ visit_date: date, location_id: locationId })
				.select('id')
				.single();
			if (error) throw error;
			sessionCache.set(key, data!.id);
			track.push(data!.id);
			return data!.id;
		}

		async function insertEncounter(
			client: SupabaseClient,
			birdId: number,
			sessionId: number,
			enc: { age_code: number; is_juv: boolean; record_type: string }
		) {
			const { error } = await client.from('Encounters').insert({
				capture_time: '10:00:00',
				scheme: 'BTO',
				sex: 'M',
				session_id: sessionId,
				bird_id: birdId,
				age_code: enc.age_code,
				is_juv: enc.is_juv,
				record_type: enc.record_type
			});
			if (error) throw error;
		}

		let ringCounter = 0;
		async function addBird(
			speciesId: number,
			encounters: {
				date: string;
				age_code: number;
				is_juv: boolean;
				record_type: string;
				locationId?: number;
			}[]
		): Promise<number> {
			const { data, error } = await deltaClient
				.from('Birds')
				.insert({
					ring_no: `ARRIVE-${testSuffix}-${ringCounter++}`,
					species_id: speciesId
				})
				.select('id')
				.single();
			if (error) throw error;
			birdIds.push(data!.id);
			// Sequential (not Promise.all) so encounter ids follow this array's order —
			// the same-day tiebreak below depends on it.
			for (const enc of encounters) {
				const sessionId = await getSession(
					deltaClient,
					enc.date,
					enc.locationId ?? deltaLocId,
					sessionIds
				);
				await insertEncounter(deltaClient, data!.id, sessionId, enc);
			}
			return data!.id;
		}

		// new_adult: first-ever encounter with Delta is this year, as an adult.
		await addBird(robinId, [
			{ date: newAdultDate, ...ADULT, record_type: 'N' }
		]);

		// returning_adult: first-ever Delta year is priorYear; arrives again as an
		// adult this year. The priorYear encounter sits outside every query window
		// below, so it only drives the new/returning split.
		await addBird(robinId, [
			{ date: dayIn(priorYear, 0), ...ADULT, record_type: 'N' },
			{ date: returningAdultDate, ...ADULT, record_type: 'R' }
		]);

		// One bird per young bucket.
		await addBird(robinId, [{ date: pullusDate, ...PULLUS, record_type: 'N' }]);
		await addBird(robinId, [{ date: juvDate, ...JUV, record_type: 'N' }]);
		await addBird(robinId, [
			{ date: postjuvDate, ...POSTJUV, record_type: 'N' }
		]);

		// Three encounters in one year, in three different months. The first is a
		// juv; the later two read as adult. arrivals_stats must count the bird once,
		// in the FIRST month's cell, in the FIRST encounter's bucket.
		await addBird(robinId, [
			{ date: multiCellDates[0], ...JUV, record_type: 'N' },
			{ date: multiCellDates[1], ...ADULT, record_type: 'R' },
			{ date: multiCellDates[2], ...ADULT, record_type: 'R' }
		]);

		// An unclassifiable (age_code 2) encounter earlier in the year than the
		// bird's first classifiable one.
		await addBird(robinId, [
			{ date: unknownAgeDate, ...UNKNOWN_AGE, record_type: 'N' },
			{ date: classifiableDate, ...ADULT, record_type: 'R' }
		]);

		// Same-day tie: two encounters of one bird on one date, in two different
		// sessions. The juv row is inserted first, so it has the lower encounter_id
		// and wins the `visit_date ASC, encounter_id ASC` tiebreak.
		await addBird(robinId, [
			{ date: tieDate, ...JUV, record_type: 'N' },
			{ date: tieDate, ...ADULT, record_type: 'R', locationId: deltaLocId2 }
		]);

		// Two calendar years, one bird. On its own species so a two-year window can
		// be isolated with species_name_filter.
		await addBird(blueTitId, [
			{ date: twoYearDates[0], ...ADULT, record_type: 'N' },
			{ date: twoYearDates[1], ...ADULT, record_type: 'R' }
		]);

		// Cross-group: an Alpha-owned adult encounter in priorYear, then a first
		// Delta encounter this year. Under ringing_group_filter = Delta the Alpha
		// history must not count, so this reads as new_adult.
		const { data: crossGroupBird, error: cgErr } = await deltaClient
			.from('Birds')
			.insert({
				ring_no: `ARRIVE-${testSuffix}-CROSSGROUP`,
				species_id: robinId
			})
			.select('id')
			.single();
		if (cgErr) throw cgErr;
		birdIds.push(crossGroupBird!.id);
		const alphaSessionId = await getSession(
			alphaClient,
			dayIn(priorYear, 200),
			alphaLocId,
			alphaSessionIds
		);
		await insertEncounter(alphaClient, crossGroupBird!.id, alphaSessionId, {
			...ADULT,
			record_type: 'N'
		});
		const crossGroupSessionId = await getSession(
			deltaClient,
			crossGroupDate,
			deltaLocId,
			sessionIds
		);
		await insertEncounter(deltaClient, crossGroupBird!.id, crossGroupSessionId, {
			...ADULT,
			record_type: 'N'
		});
	});

	afterAll(() => {
		const allSessions = [...sessionIds, ...alphaSessionIds];
		const allLocations = [...locationIds, ...alphaLocationIds];
		execSync(
			`psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c '` +
				`DELETE FROM "Encounters" WHERE bird_id IN (${birdIds.join(', ')});` +
				`DELETE FROM "Birds" WHERE id IN (${birdIds.join(', ')});` +
				`DELETE FROM "Sessions" WHERE id IN (${allSessions.join(', ')});` +
				`DELETE FROM "Locations" WHERE id IN (${allLocations.join(', ')});'`
		);
	});

	type ArrivalsRow = {
		species_name: string | null;
		time_period: string | null;
		new_adult_bird_count: number;
		returning_adult_bird_count: number;
		pullus_bird_count: number;
		juv_bird_count: number;
		postjuv_bird_count: number;
	};

	async function callArrivals(
		args: Record<string, unknown>
	): Promise<ArrivalsRow[]> {
		const { data, error } = await deltaClient.rpc('arrivals_stats', {
			ringing_group_filter: deltaId,
			...args
		});
		expect(error).toBeNull();
		return data as unknown as ArrivalsRow[];
	}

	/**
	 * The single ungrouped row covering exactly the birds encountered between
	 * `from` and `to` (defaulting to the one date `from`).
	 */
	async function rowForDates(from: string, to = from): Promise<ArrivalsRow> {
		const rows = await callArrivals({ from_date: from, to_date: to });
		expect(rows).toHaveLength(1);
		return rows[0];
	}

	const ZERO_BUCKETS = {
		new_adult_bird_count: 0,
		returning_adult_bird_count: 0,
		pullus_bird_count: 0,
		juv_bird_count: 0,
		postjuv_bird_count: 0
	};

	// Usual
	it("buckets a brand-new adult's arrival as new_adult", async () => {
		expect(await rowForDates(newAdultDate)).toMatchObject({
			...ZERO_BUCKETS,
			new_adult_bird_count: 1
		});
	});

	it('buckets a returning adult (first-ever year earlier than this year) as returning_adult', async () => {
		expect(await rowForDates(returningAdultDate)).toMatchObject({
			...ZERO_BUCKETS,
			returning_adult_bird_count: 1
		});
	});

	// Structure
	it('buckets a pullus arrival into pullus_bird_count only', async () => {
		expect(await rowForDates(pullusDate)).toMatchObject({
			...ZERO_BUCKETS,
			pullus_bird_count: 1
		});
	});

	it('buckets a juv arrival into juv_bird_count only', async () => {
		expect(await rowForDates(juvDate)).toMatchObject({
			...ZERO_BUCKETS,
			juv_bird_count: 1
		});
	});

	it('buckets a postjuv arrival into postjuv_bird_count only', async () => {
		expect(await rowForDates(postjuvDate)).toMatchObject({
			...ZERO_BUCKETS,
			postjuv_bird_count: 1
		});
	});

	it('counts a bird encountered in three months of the same year only once, in the first month cell', async () => {
		const rows = await callArrivals({
			from_date: multiCellDates[0],
			to_date: multiCellDates[2],
			group_by_time_period: 'month'
		});
		const cell = (date: string) =>
			rows.find((row) => row.time_period === monthOf(date));

		// Counted once, in the first encounter's month, in the first encounter's
		// bucket (juv) — not the later adult readings.
		expect(cell(multiCellDates[0])).toMatchObject({
			...ZERO_BUCKETS,
			juv_bird_count: 1
		});
		expect(cell(multiCellDates[1])).toMatchObject(ZERO_BUCKETS);
		expect(cell(multiCellDates[2])).toMatchObject(ZERO_BUCKETS);
	});

	it('skips an unclassifiable early-year encounter and buckets the bird at its next classifiable encounter that year', async () => {
		const rows = await callArrivals({
			from_date: unknownAgeDate,
			to_date: classifiableDate,
			group_by_time_period: 'month'
		});
		expect(
			rows.find((row) => row.time_period === monthOf(unknownAgeDate))
		).toMatchObject(ZERO_BUCKETS);
		expect(
			rows.find((row) => row.time_period === monthOf(classifiableDate))
		).toMatchObject({ ...ZERO_BUCKETS, new_adult_bird_count: 1 });
	});

	// Edge
	it("counts the same bird's arrival separately in two different calendar years", async () => {
		const rows = await callArrivals({
			species_name_filter: 'Blue Tit',
			from_date: twoYearDates[0],
			to_date: twoYearDates[1],
			group_by_species: true,
			group_by_time_period: 'year'
		});
		expect(
			rows.find((row) => row.time_period === `${priorYear}-01-01`)
		).toMatchObject({ ...ZERO_BUCKETS, new_adult_bird_count: 1 });
		expect(
			rows.find((row) => row.time_period === `${arrivalYear}-01-01`)
		).toMatchObject({ ...ZERO_BUCKETS, returning_adult_bird_count: 1 });
	});

	it("sums the five bucket counts to the cell's total arriving-bird count", async () => {
		const row = await rowForDates(newAdultDate, postjuvDate);
		const total =
			row.new_adult_bird_count +
			row.returning_adult_bird_count +
			row.pullus_bird_count +
			row.juv_bird_count +
			row.postjuv_bird_count;
		// One bird of each bucket arrived in this window.
		expect(row).toMatchObject({
			new_adult_bird_count: 1,
			returning_adult_bird_count: 1,
			pullus_bird_count: 1,
			juv_bird_count: 1,
			postjuv_bird_count: 1
		});
		expect(total).toBe(5);
	});

	it("excludes another ringing group's history when ringing_group_filter is set", async () => {
		// Adult with a priorYear Alpha encounter but a first-ever Delta encounter
		// this year: new_adult under Delta, not returning_adult.
		expect(await rowForDates(crossGroupDate)).toMatchObject({
			...ZERO_BUCKETS,
			new_adult_bird_count: 1
		});
	});

	it('breaks a same-day tie deterministically on the lower encounter id', async () => {
		const first = await rowForDates(tieDate);
		const second = await rowForDates(tieDate);
		// The juv encounter was inserted first, so it holds the lower encounter_id
		// and wins the `visit_date ASC, encounter_id ASC` tiebreak.
		expect(first).toMatchObject({ ...ZERO_BUCKETS, juv_bird_count: 1 });
		expect(second).toEqual(first);
	});
});
