/**
 * Integration tests for the `population_stats` Postgres RPC function.
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

describe('population_stats', () => {
	let alphaId: number;
	let alphaClient: SupabaseClient;

	beforeAll(async () => {
		({ alphaId, alphaClient } = await resolveAlphaBetaGammaClients());
	});

	// Age-split subsets of adult_bird_count (#800): new_adult_bird_count /
	// first_summer_bird_count / old_timers_bird_count. These partition the adult bucket
	// by each bird's LIFETIME history with the ringing group (unwindowed), so every
	// bird carries encounters in earlier calendar years that sit OUTSIDE the query
	// window but still drive its classification. Each bird's "this period" adult
	// encounter is on its own random far-future date; an ungrouped from=to=date query
	// then returns exactly that one bird, and period_year resolves (via the
	// time_period-IS-NULL fallback rule) to that date's calendar year. Prior-year
	// encounters hang off the same bird on dates in (year-1)/(year-2) and never appear
	// in any query window, so they never pollute a cell — they only set
	// bird_first_year and the (period_year-1) majority vote. All rows randomised per
	// run so concurrent worktrees (shared local Supabase) never combine.
	describe('age split (new_adult_bird_count / first_summer_bird_count / old_timers_bird_count)', () => {
		let deltaId: number;
		let deltaClient: SupabaseClient;
		const locationIds: number[] = [];
		const sessionIds: number[] = [];
		const birdIds: number[] = [];
		// Alpha-owned rows for the multi-group isolation case (cleaned up too).
		const alphaLocationIds: number[] = [];
		const alphaSessionIds: number[] = [];

		const ADULT = { age_code: 4, is_juv: false };
		const AGE1J = { age_code: 1, is_juv: true };
		const AGE3J = { age_code: 3, is_juv: true };

		type EncInput = {
			date: string;
			age_code: number;
			is_juv: boolean;
			record_type: string;
		};

		// Scenario "this period" query dates (each bird gets its own).
		let naDate: string; // new_adult
		let fsDate: string; // first_summer
		let oldTimersDate: string; // old timers (adult returner)
		let tieDate: string; // old timers via a prior-year tie
		let gapDate: string; // old timers via no prior-year encounters
		let juvDate: string; // adult-split-excluded (juv bucket this period)
		let mgDate: string; // multi-group isolation

		const yearOf = (d: string) => parseInt(d.slice(0, 4), 10);

		beforeAll(async () => {
			deltaId = await getGroupIdByName('Delta');
			deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);

			const testSuffix = randomTestSuffix();
			const base = randomFutureDate();

			const { data: robin } = await supabase
				.from('Species')
				.select('id')
				.eq('species_name', 'Robin')
				.single();
			const robinId = robin!.id;

			// One Delta location; one Alpha location for the cross-group bird.
			const { data: deltaLoc, error: dLocErr } = await deltaClient
				.from('Locations')
				.insert({
					location_name: `Age Split Delta Loc ${testSuffix}`,
					ringing_group_id: deltaId
				})
				.select('id')
				.single();
			if (dLocErr) throw dLocErr;
			locationIds.push(deltaLoc!.id);
			const deltaLocId = deltaLoc!.id;

			const { data: alphaLoc, error: aLocErr } = await alphaClient
				.from('Locations')
				.insert({
					location_name: `Age Split Alpha Loc ${testSuffix}`,
					ringing_group_id: alphaId
				})
				.select('id')
				.single();
			if (aLocErr) throw aLocErr;
			alphaLocationIds.push(alphaLoc!.id);
			const alphaLocId = alphaLoc!.id;

			// One shared session per (client, date, location).
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
				const { data: session, error } = await client
					.from('Sessions')
					.insert({ visit_date: date, location_id: locationId })
					.select('id')
					.single();
				if (error) throw error;
				sessionCache.set(key, session!.id);
				track.push(session!.id);
				return session!.id;
			}

			let ringCounter = 0;
			async function insertEncounter(
				client: SupabaseClient,
				bird_id: number,
				sessionId: number,
				enc: { age_code: number; is_juv: boolean; record_type: string }
			) {
				const { error } = await client.from('Encounters').insert({
					capture_time: '10:00:00',
					scheme: 'BTO',
					sex: 'M',
					session_id: sessionId,
					bird_id,
					age_code: enc.age_code,
					is_juv: enc.is_juv,
					record_type: enc.record_type
				});
				if (error) throw error;
			}

			// Insert a Delta-owned bird with the given Delta encounters.
			async function addBird(encounters: EncInput[]): Promise<number> {
				const { data: bird, error } = await deltaClient
					.from('Birds')
					.insert({
						ring_no: `SPLIT-${testSuffix}-${ringCounter++}`,
						species_id: robinId
					})
					.select('id')
					.single();
				if (error) throw error;
				birdIds.push(bird!.id);
				for (const e of encounters) {
					const sessionId = await getSession(
						deltaClient,
						e.date,
						deltaLocId,
						sessionIds
					);
					await insertEncounter(deltaClient, bird!.id, sessionId, e);
				}
				return bird!.id;
			}

			// new_adult: first-ever (and only) encounter is this period year, as adult.
			naDate = addDays(base, 0);
			await addBird([{ date: naDate, ...ADULT, record_type: 'N' }]);

			// first_summer: first-ever year earlier; a strict majority of the bird's
			// (period_year - 1) encounters were at age_code IN (1,3); adult this period.
			fsDate = addDays(base, 1);
			const fsPy = yearOf(fsDate) - 1;
			await addBird([
				{ date: `${fsPy}-05-10`, ...AGE1J, record_type: 'N' },
				{ date: `${fsPy}-05-11`, ...AGE3J, record_type: 'R' },
				{ date: fsDate, ...ADULT, record_type: 'R' }
			]);

			// old timers: first-ever year earlier; (period_year - 1) majority NOT age_code
			// IN (1,3) (adult retraps); adult this period.
			oldTimersDate = addDays(base, 2);
			const oldPy = yearOf(oldTimersDate) - 1;
			await addBird([
				{ date: `${oldPy}-05-10`, ...ADULT, record_type: 'R' },
				{ date: `${oldPy}-05-11`, ...ADULT, record_type: 'R' },
				{ date: oldTimersDate, ...ADULT, record_type: 'R' }
			]);

			// old timers via a tie: (period_year - 1) exactly one age_code IN (1,3) and one
			// not — a tie falls to old timers, not first_summer.
			tieDate = addDays(base, 100);
			const tiePy = yearOf(tieDate) - 1;
			await addBird([
				{ date: `${tiePy}-05-10`, ...AGE1J, record_type: 'R' },
				{ date: `${tiePy}-05-11`, ...ADULT, record_type: 'R' },
				{ date: tieDate, ...ADULT, record_type: 'R' }
			]);

			// old timers via a gap year: first-ever year is two years back, and there are
			// zero encounters in (period_year - 1) — no prior-year data falls to old timers.
			gapDate = addDays(base, 130);
			const gapPy2 = yearOf(gapDate) - 2;
			await addBird([
				{ date: `${gapPy2}-05-10`, ...ADULT, record_type: 'N' },
				{ date: gapDate, ...ADULT, record_type: 'R' }
			]);

			// juv this period: first-ever this year but bucket is juv (age_code 1J), so
			// it must not appear in any of the three adult-split columns.
			juvDate = addDays(base, 160);
			await addBird([{ date: juvDate, ...AGE1J, record_type: 'N' }]);

			// Multi-group isolation: an earlier-year encounter under Alpha and a first
			// Delta encounter this period, as adult. The Alpha history must NOT count as
			// "first-ever with this group", so under ringing_group_filter=Delta this
			// reads as new_adult.
			mgDate = addDays(base, 190);
			const mgAlphaYear = yearOf(mgDate) - 2;
			const { data: mgBird, error: mgErr } = await deltaClient
				.from('Birds')
				.insert({ ring_no: `SPLIT-${testSuffix}-MG`, species_id: robinId })
				.select('id')
				.single();
			if (mgErr) throw mgErr;
			birdIds.push(mgBird!.id);
			const alphaSess = await getSession(
				alphaClient,
				`${mgAlphaYear}-05-10`,
				alphaLocId,
				alphaSessionIds
			);
			await insertEncounter(alphaClient, mgBird!.id, alphaSess, {
				...ADULT,
				record_type: 'N'
			});
			const mgDeltaSess = await getSession(
				deltaClient,
				mgDate,
				deltaLocId,
				sessionIds
			);
			await insertEncounter(deltaClient, mgBird!.id, mgDeltaSess, {
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

		// An ungrouped single-date aggregate row (covers exactly the one bird on `date`).
		async function splitRow(date: string) {
			const { data, error } = await deltaClient.rpc('population_stats', {
				ringing_group_filter: deltaId,
				from_date: date,
				to_date: date
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			return data![0];
		}

		// Usual
		it('a bird first ringed as an adult this period year counts in new_adult_bird_count only', async () => {
			const row = await splitRow(naDate);
			expect(row).toMatchObject({
				adult_bird_count: 1,
				new_adult_bird_count: 1,
				first_summer_bird_count: 0,
				old_timers_bird_count: 0
			});
		});

		it('an adult this period whose (period_year - 1) encounters are a majority age_code IN (1,3) counts in first_summer_bird_count only', async () => {
			const row = await splitRow(fsDate);
			expect(row).toMatchObject({
				adult_bird_count: 1,
				new_adult_bird_count: 0,
				first_summer_bird_count: 1,
				old_timers_bird_count: 0
			});
		});

		it('an adult returner whose (period_year - 1) encounters are a majority NOT age_code IN (1,3) counts in old_timers_bird_count only', async () => {
			const row = await splitRow(oldTimersDate);
			expect(row).toMatchObject({
				adult_bird_count: 1,
				new_adult_bird_count: 0,
				first_summer_bird_count: 0,
				old_timers_bird_count: 1
			});
		});

		// Structure
		it('for a cell holding one bird of each adult sub-kind, new_adult + first_summer + old_timers = adult_bird_count', async () => {
			const { data, error } = await deltaClient.rpc('population_stats', {
				ringing_group_filter: deltaId,
				from_date: naDate,
				to_date: oldTimersDate
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			const row = data![0];
			expect(row.adult_bird_count).toBe(3);
			expect(row.new_adult_bird_count).toBe(1);
			expect(row.first_summer_bird_count).toBe(1);
			expect(row.old_timers_bird_count).toBe(1);
			expect(
				row.new_adult_bird_count +
					row.first_summer_bird_count +
					row.old_timers_bird_count
			).toBe(row.adult_bird_count);
		});

		it('a bird first-ever-with-group this year but bucketed juv (not adult) this period appears in none of the three age-split columns', async () => {
			const row = await splitRow(juvDate);
			expect(row).toMatchObject({
				adult_bird_count: 0,
				juv_bird_count: 1,
				new_adult_bird_count: 0,
				first_summer_bird_count: 0,
				old_timers_bird_count: 0
			});
		});

		it('year, month, day and ungrouped timeInterval modes all return valid rows for the age-split columns (period_year resolution rule)', async () => {
			for (const mode of ['year', 'month', 'day', undefined] as const) {
				const { data, error } = await deltaClient.rpc('population_stats', {
					ringing_group_filter: deltaId,
					from_date: naDate,
					to_date: oldTimersDate,
					group_by_time_period: mode
				});
				expect(error).toBeNull();
				expect(data!.length).toBeGreaterThan(0);
				const totals = data!.reduce(
					(acc, r) => ({
						na: acc.na + r.new_adult_bird_count,
						fs: acc.fs + r.first_summer_bird_count,
						ol: acc.ol + r.old_timers_bird_count,
						ad: acc.ad + r.adult_bird_count
					}),
					{ na: 0, fs: 0, ol: 0, ad: 0 }
				);
				expect(totals.na).toBe(1);
				expect(totals.fs).toBe(1);
				expect(totals.ol).toBe(1);
				expect(totals.ad).toBe(3);
			}
		});

		// Edge
		it('a (period_year - 1) tie between age_code IN (1,3) and not falls to old_timers_bird_count, not first_summer_bird_count', async () => {
			const row = await splitRow(tieDate);
			expect(row).toMatchObject({
				adult_bird_count: 1,
				first_summer_bird_count: 0,
				old_timers_bird_count: 1
			});
		});

		it('a bird with zero encounters in (period_year - 1) (a gap year) falls to old_timers_bird_count', async () => {
			const row = await splitRow(gapDate);
			expect(row).toMatchObject({
				adult_bird_count: 1,
				new_adult_bird_count: 0,
				first_summer_bird_count: 0,
				old_timers_bird_count: 1
			});
		});

		it("a bird whose only earlier history is under a DIFFERENT group still counts as new_adult with this group (other group's history is not first-ever-with-this-group)", async () => {
			const row = await splitRow(mgDate);
			expect(row).toMatchObject({
				adult_bird_count: 1,
				new_adult_bird_count: 1,
				first_summer_bird_count: 0,
				old_timers_bird_count: 0
			});
		});
	});

	// Young-trends encounter-level counts (#800): postjuv_juv_enc_count /
	// new_postjuv_juv_enc_count / new_postjuv_enc_count. The existing juv_enc_count
	// bucket combines 1J and 3J; these break out the 3J-only slice (age_code = 3 AND
	// is_juv) plus New-record variants, without altering juv_enc_count. Purely
	// per-encounter (no lifetime/year logic), so each bird sits on its own random date
	// and an ungrouped from=to=date query returns exactly that one encounter.
	describe('young trends (postjuv_juv_enc_count / new_postjuv_juv_enc_count / new_postjuv_enc_count)', () => {
		let deltaId: number;
		let deltaClient: SupabaseClient;
		const locationIds: number[] = [];
		const sessionIds: number[] = [];
		const birdIds: number[] = [];

		const AGE1J = { age_code: 1, is_juv: true };
		const AGE3J = { age_code: 3, is_juv: true };
		const POSTJUV = { age_code: 3, is_juv: false };

		let d3jR: string; // 3J retrap
		let d3jN: string; // 3J new
		let dpjN: string; // bare age-3 (postjuv) new
		let d1jN: string; // 1J new

		beforeAll(async () => {
			deltaId = await getGroupIdByName('Delta');
			deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);

			const testSuffix = randomTestSuffix();
			const base = randomFutureDate();

			const { data: robin } = await supabase
				.from('Species')
				.select('id')
				.eq('species_name', 'Robin')
				.single();
			const robinId = robin!.id;

			const { data: location, error: locErr } = await deltaClient
				.from('Locations')
				.insert({
					location_name: `Young Trends Loc ${testSuffix}`,
					ringing_group_id: deltaId
				})
				.select('id')
				.single();
			if (locErr) throw locErr;
			locationIds.push(location!.id);
			const locationId = location!.id;

			const sessionCache = new Map<string, number>();
			async function getSession(date: string) {
				const cached = sessionCache.get(date);
				if (cached !== undefined) return cached;
				const { data: session, error } = await deltaClient
					.from('Sessions')
					.insert({ visit_date: date, location_id: locationId })
					.select('id')
					.single();
				if (error) throw error;
				sessionCache.set(date, session!.id);
				sessionIds.push(session!.id);
				return session!.id;
			}

			let ringCounter = 0;
			async function addBird(
				date: string,
				enc: { age_code: number; is_juv: boolean; record_type: string }
			) {
				const { data: bird, error } = await deltaClient
					.from('Birds')
					.insert({
						ring_no: `YT-${testSuffix}-${ringCounter++}`,
						species_id: robinId
					})
					.select('id')
					.single();
				if (error) throw error;
				birdIds.push(bird!.id);
				const sessionId = await getSession(date);
				const { error: encErr } = await deltaClient.from('Encounters').insert({
					capture_time: '10:00:00',
					scheme: 'BTO',
					sex: 'M',
					session_id: sessionId,
					bird_id: bird!.id,
					age_code: enc.age_code,
					is_juv: enc.is_juv,
					record_type: enc.record_type
				});
				if (encErr) throw encErr;
			}

			d3jR = addDays(base, 0);
			await addBird(d3jR, { ...AGE3J, record_type: 'R' });
			d3jN = addDays(base, 1);
			await addBird(d3jN, { ...AGE3J, record_type: 'N' });
			dpjN = addDays(base, 2);
			await addBird(dpjN, { ...POSTJUV, record_type: 'N' });
			d1jN = addDays(base, 3);
			await addBird(d1jN, { ...AGE1J, record_type: 'N' });
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

		async function ytRow(date: string) {
			const { data, error } = await deltaClient.rpc('population_stats', {
				ringing_group_filter: deltaId,
				from_date: date,
				to_date: date
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			return data![0];
		}

		// Usual
		it('a 3J encounter (age_code = 3, is_juv) is counted in postjuv_juv_enc_count', async () => {
			const row = await ytRow(d3jR);
			expect(row.postjuv_juv_enc_count).toBe(1);
			expect(row.juv_enc_count).toBe(1);
		});

		it("a 3J New (record_type = 'N') encounter is counted in new_postjuv_juv_enc_count", async () => {
			const row = await ytRow(d3jN);
			expect(row.postjuv_juv_enc_count).toBe(1);
			expect(row.new_postjuv_juv_enc_count).toBe(1);
		});

		it("a bare age-3 postjuv New (age_code = 3, is_juv false, 'N') encounter is counted in new_postjuv_enc_count", async () => {
			const row = await ytRow(dpjN);
			expect(row.new_postjuv_enc_count).toBe(1);
			expect(row.postjuv_enc_count).toBe(1);
			expect(row.postjuv_juv_enc_count).toBe(0);
		});

		// Structure
		it("a 3J retrap (record_type = 'R') counts in postjuv_juv_enc_count but not new_postjuv_juv_enc_count", async () => {
			const row = await ytRow(d3jR);
			expect(row.postjuv_juv_enc_count).toBe(1);
			expect(row.new_postjuv_juv_enc_count).toBe(0);
		});

		it('a 1J New encounter is excluded from the 3-only young-trends columns, but still counts in juv_enc_count', async () => {
			const row = await ytRow(d1jN);
			expect(row.juv_enc_count).toBe(1);
			expect(row.postjuv_juv_enc_count).toBe(0);
			expect(row.new_postjuv_juv_enc_count).toBe(0);
			expect(row.new_postjuv_enc_count).toBe(0);
		});

		// Edge
		it('across a mixed 1J/3J/postjuv window, postjuv_juv_enc_count is the 3J-only slice of juv_enc_count', async () => {
			const { data, error } = await deltaClient.rpc('population_stats', {
				ringing_group_filter: deltaId,
				from_date: d3jR,
				to_date: d1jN
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			const row = data![0];
			// juv_enc_count = two 3J + one 1J = 3; postjuv_juv_enc_count = the two 3J.
			expect(row.juv_enc_count).toBe(3);
			expect(row.postjuv_juv_enc_count).toBe(2);
			expect(row.new_postjuv_juv_enc_count).toBe(1); // the single 3J New
			expect(row.new_postjuv_enc_count).toBe(1); // the single bare-age-3 New
			expect(row.postjuv_enc_count).toBe(1); // bucket postjuv = the bare age-3
		});
	});

	// new_young_bird_count (#800 follow-up): originally a straight copy of a
	// same-named column on aggregate_stats. #824 removed aggregate_stats' copy (and
	// the corresponding UI series, #817) as unused, so this is now the only
	// new_young_bird_count column in the schema — these tests cover its derivation
	// directly rather than parity against aggregate_stats.
	describe('new_young_bird_count', () => {
		let deltaId: number;
		let deltaClient: SupabaseClient;
		const locationIds: number[] = [];
		const sessionIds: number[] = [];
		const birdIds: number[] = [];

		let newJuvDate: string;
		let retrapJuvDate: string;

		beforeAll(async () => {
			deltaId = await getGroupIdByName('Delta');
			deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);

			const testSuffix = randomTestSuffix();
			const base = randomFutureDate();

			const { data: robin } = await supabase
				.from('Species')
				.select('id')
				.eq('species_name', 'Robin')
				.single();
			const robinId = robin!.id;

			const { data: location, error: locErr } = await deltaClient
				.from('Locations')
				.insert({
					location_name: `New Young Loc ${testSuffix}`,
					ringing_group_id: deltaId
				})
				.select('id')
				.single();
			if (locErr) throw locErr;
			locationIds.push(location!.id);
			const locationId = location!.id;

			async function addBird(date: string, record_type: string) {
				const { data: session, error: sessionError } = await deltaClient
					.from('Sessions')
					.insert({ visit_date: date, location_id: locationId })
					.select('id')
					.single();
				if (sessionError) throw sessionError;
				sessionIds.push(session!.id);

				const { data: bird, error: birdError } = await deltaClient
					.from('Birds')
					.insert({
						ring_no: `NY-${testSuffix}-${date}`,
						species_id: robinId
					})
					.select('id')
					.single();
				if (birdError) throw birdError;
				birdIds.push(bird!.id);

				const { error: encError } = await deltaClient
					.from('Encounters')
					.insert({
						capture_time: '10:00:00',
						scheme: 'BTO',
						sex: 'M',
						session_id: session!.id,
						bird_id: bird!.id,
						age_code: 1,
						is_juv: true,
						record_type
					});
				if (encError) throw encError;
			}

			newJuvDate = addDays(base, 0);
			await addBird(newJuvDate, 'N');
			retrapJuvDate = addDays(base, 1);
			await addBird(retrapJuvDate, 'R');
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
		it('a New (record_type=N) juv-bucket bird is counted in new_young_bird_count', async () => {
			const { data, error } = await deltaClient.rpc('population_stats', {
				ringing_group_filter: deltaId,
				from_date: newJuvDate,
				to_date: newJuvDate
			});
			expect(error).toBeNull();
			expect(data![0].new_young_bird_count).toBe(1);
		});

		// Edge
		it('a retrap (record_type != N) juv-bucket bird is excluded from new_young_bird_count', async () => {
			const { data, error } = await deltaClient.rpc('population_stats', {
				ringing_group_filter: deltaId,
				from_date: retrapJuvDate,
				to_date: retrapJuvDate
			});
			expect(error).toBeNull();
			expect(data![0].new_young_bird_count).toBe(0);
		});
	});
});
