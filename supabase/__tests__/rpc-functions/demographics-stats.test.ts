/**
 * Integration tests for the `demographics_stats` Postgres RPC function.
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
import { createIsolatedGroup, psql } from '../db-test-helpers';
import {
	insertTestLocation,
	insertTestSession,
	createSessionResolver,
	insertTestBird,
	insertTestEncounter,
	createRingNoSequence
} from './helpers/encounter-fixtures';

describe('demographics_stats', () => {
	// new_adult_bird_count (#800): the subset of adult_bird_count whose first-ever
	// year with the ringing group is the cell's own period_year. Resolved from each
	// bird's LIFETIME history with the group (unwindowed), so every bird carries
	// encounters in earlier calendar years that sit OUTSIDE the query window but
	// still drive its classification. Each bird's "this period" adult encounter is
	// on its own random far-future date; an ungrouped from=to=date query then returns
	// exactly that one bird, and period_year resolves (via the time_period-IS-NULL
	// fallback rule) to that date's calendar year. Prior-year encounters hang off the
	// same bird on dates in (year-1)/(year-2) and never appear in any query window,
	// so they never pollute a cell — they only set bird_first_year. All rows
	// randomised per run so concurrent worktrees (shared local Supabase) never
	// combine.
	//
	// #856 removed the first_summer_bird_count / old_timers_bird_count columns that
	// once completed a three-way split of the adult cohort alongside this one, along
	// with every case exercising their (period_year - 1) majority-vote heuristic. The
	// returners below therefore only assert that they are NOT new adults.
	describe('new adult count (new_adult_bird_count)', () => {
		let deltaId: number;
		let deltaClient: SupabaseClient;
		// A dedicated throwaway group for the multi-group isolation case, rather than the
		// shared `Alpha` seed group — see #935: a temporary Alpha location/session, even
		// cleaned up in afterAll, is visible to any concurrently-running test asserting on
		// Alpha's full row set (e.g. core-stats.test.ts's ALPHA_ALL_VISIT_DATES) for the
		// window between insert and teardown.
		let otherGroupId: number;
		let otherGroupClient: SupabaseClient;
		const locationIds: number[] = [];
		const sessionIds: number[] = [];
		const birdIds: number[] = [];
		// Other-group-owned rows for the multi-group isolation case (cleaned up too).
		const otherGroupLocationIds: number[] = [];
		const otherGroupSessionIds: number[] = [];

		const ADULT = { age_code: 4, is_juv: false };
		const AGE1J = { age_code: 1, is_juv: true };

		type EncInput = {
			date: string;
			age_code: number;
			is_juv: boolean;
			record_type: string;
		};

		// Scenario "this period" query dates (each bird gets its own).
		let naDate: string; // new_adult
		let returnerDate: string; // adult returner (not a new adult)
		let juvDate: string; // new-adult-excluded (juv bucket this period)
		let mgDate: string; // multi-group isolation

		const yearOf = (d: string) => parseInt(d.slice(0, 4), 10);

		beforeAll(async () => {
			deltaId = await getGroupIdByName('Delta');
			deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);

			const testSuffix = randomTestSuffix();
			otherGroupId = createIsolatedGroup(`Age Split Other ${testSuffix}`);
			otherGroupClient =
				await getAuthenticatedSupabaseClientForGroup(otherGroupId);
			const base = randomFutureDate();

			const { data: robin } = await supabase
				.from('Species')
				.select('id')
				.eq('species_name', 'Robin')
				.single();
			const robinId = robin!.id;

			// One Delta location; one other-group location for the cross-group bird.
			const deltaLocId = await insertTestLocation(
				deltaClient,
				deltaId,
				`Age Split Delta Loc ${testSuffix}`
			);
			locationIds.push(deltaLocId);

			const otherGroupLocId = await insertTestLocation(
				otherGroupClient,
				otherGroupId,
				`Age Split Other Loc ${testSuffix}`
			);
			otherGroupLocationIds.push(otherGroupLocId);

			// One shared session per (client, date, location).
			const getSession = createSessionResolver();
			const insertEncounter = insertTestEncounter;

			const nextRing = createRingNoSequence(`SPLIT-${testSuffix}`);
			// Insert a Delta-owned bird with the given Delta encounters.
			async function addBird(encounters: EncInput[]): Promise<number> {
				const birdId = await insertTestBird(deltaClient, nextRing(), robinId);
				birdIds.push(birdId);
				for (const e of encounters) {
					const sessionId = await getSession(
						deltaClient,
						e.date,
						deltaLocId,
						sessionIds
					);
					await insertEncounter(deltaClient, birdId, sessionId, {
						age_code: e.age_code,
						is_juv: e.is_juv,
						record_type: e.record_type
					});
				}
				return birdId;
			}

			// new_adult: first-ever (and only) encounter is this period year, as adult.
			naDate = addDays(base, 0);
			await addBird([{ date: naDate, ...ADULT, record_type: 'N' }]);

			// adult returner: first-ever year earlier, adult again this period — so this
			// cell's period_year is not its first-ever year with the group.
			returnerDate = addDays(base, 2);
			const returnerPy = yearOf(returnerDate) - 1;
			await addBird([
				{ date: `${returnerPy}-05-10`, ...ADULT, record_type: 'R' },
				{ date: `${returnerPy}-05-11`, ...ADULT, record_type: 'R' },
				{ date: returnerDate, ...ADULT, record_type: 'R' }
			]);

			// juv this period: first-ever this year but bucket is juv (age_code 1J), so
			// it must not count as a new adult.
			juvDate = addDays(base, 160);
			await addBird([{ date: juvDate, ...AGE1J, record_type: 'N' }]);

			// Multi-group isolation: an earlier-year encounter under a different group and a
			// first Delta encounter this period, as adult. The other group's history must
			// NOT count as "first-ever with this group", so under ringing_group_filter=Delta
			// this reads as new_adult.
			mgDate = addDays(base, 190);
			const mgOtherGroupYear = yearOf(mgDate) - 2;
			const mgBirdId = await insertTestBird(
				deltaClient,
				`SPLIT-${testSuffix}-MG`,
				robinId
			);
			birdIds.push(mgBirdId);
			const otherGroupSess = await getSession(
				otherGroupClient,
				`${mgOtherGroupYear}-05-10`,
				otherGroupLocId,
				otherGroupSessionIds
			);
			await insertEncounter(otherGroupClient, mgBirdId, otherGroupSess, {
				...ADULT,
				record_type: 'N'
			});
			const mgDeltaSess = await getSession(
				deltaClient,
				mgDate,
				deltaLocId,
				sessionIds
			);
			await insertEncounter(deltaClient, mgBirdId, mgDeltaSess, {
				...ADULT,
				record_type: 'N'
			});
		});

		afterAll(() => {
			const allSessions = [...sessionIds, ...otherGroupSessionIds];
			const allLocations = [...locationIds, ...otherGroupLocationIds];
			execSync(
				`psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c '` +
					`DELETE FROM "Encounters" WHERE bird_id IN (${birdIds.join(', ')});` +
					`DELETE FROM "Birds" WHERE id IN (${birdIds.join(', ')});` +
					`DELETE FROM "Sessions" WHERE id IN (${allSessions.join(', ')});` +
					`DELETE FROM "Locations" WHERE id IN (${allLocations.join(', ')});'`
			);
			psql(`DELETE FROM "RingingGroups" WHERE id = ${otherGroupId};`);
		});

		// An ungrouped single-date aggregate row (covers exactly the one bird on `date`).
		async function splitRow(date: string) {
			const { data, error } = await deltaClient.rpc('demographics_stats', {
				ringing_group_filter: deltaId,
				from_date: date,
				to_date: date
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			return data![0];
		}

		// Usual
		it('a bird first ringed as an adult this period year counts in new_adult_bird_count', async () => {
			const row = await splitRow(naDate);
			expect(row).toMatchObject({
				adult_bird_count: 1,
				new_adult_bird_count: 1
			});
		});

		it('an adult returner whose first-ever year with the group is earlier is excluded from new_adult_bird_count', async () => {
			const row = await splitRow(returnerDate);
			expect(row).toMatchObject({
				adult_bird_count: 1,
				new_adult_bird_count: 0
			});
		});

		// Structure
		it('for a cell holding one new adult and one returner, new_adult_bird_count is the new-adult subset of adult_bird_count', async () => {
			const { data, error } = await deltaClient.rpc('demographics_stats', {
				ringing_group_filter: deltaId,
				from_date: naDate,
				to_date: returnerDate
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			const row = data![0];
			expect(row.adult_bird_count).toBe(2);
			expect(row.new_adult_bird_count).toBe(1);
		});

		it('a bird first-ever-with-group this year but bucketed juv (not adult) this period is excluded from new_adult_bird_count', async () => {
			const row = await splitRow(juvDate);
			expect(row).toMatchObject({
				adult_bird_count: 0,
				juv_bird_count: 1,
				new_adult_bird_count: 0
			});
		});

		it('year, month, day and ungrouped timeInterval modes all return valid rows for new_adult_bird_count (period_year resolution rule)', async () => {
			for (const mode of ['year', 'month', 'day', undefined] as const) {
				const { data, error } = await deltaClient.rpc('demographics_stats', {
					ringing_group_filter: deltaId,
					from_date: naDate,
					to_date: returnerDate,
					group_by_time_period: mode
				});
				expect(error).toBeNull();
				expect(data!.length).toBeGreaterThan(0);
				const totals = data!.reduce(
					(acc, r) => ({
						na: acc.na + r.new_adult_bird_count,
						ad: acc.ad + r.adult_bird_count
					}),
					{ na: 0, ad: 0 }
				);
				expect(totals.na).toBe(1);
				expect(totals.ad).toBe(2);
			}
		});

		// Edge
		it("a bird whose only earlier history is under a DIFFERENT group still counts as new_adult with this group (other group's history is not first-ever-with-this-group)", async () => {
			const row = await splitRow(mgDate);
			expect(row).toMatchObject({
				adult_bird_count: 1,
				new_adult_bird_count: 1
			});
		});

		it('the RPC result carries no old_timers_bird_count or first_summer_bird_count key (#856)', async () => {
			const row = await splitRow(naDate);
			expect(Object.keys(row)).not.toContain('old_timers_bird_count');
			expect(Object.keys(row)).not.toContain('first_summer_bird_count');
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

			const locationId = await insertTestLocation(
				deltaClient,
				deltaId,
				`Young Trends Loc ${testSuffix}`
			);
			locationIds.push(locationId);

			const getSessionResolver = createSessionResolver();
			const getSession = (date: string) =>
				getSessionResolver(deltaClient, date, locationId, sessionIds);

			const nextRing = createRingNoSequence(`YT-${testSuffix}`);
			async function addBird(
				date: string,
				enc: { age_code: number; is_juv: boolean; record_type: string }
			) {
				const birdId = await insertTestBird(deltaClient, nextRing(), robinId);
				birdIds.push(birdId);
				const sessionId = await getSession(date);
				await insertTestEncounter(deltaClient, birdId, sessionId, enc);
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
			const { data, error } = await deltaClient.rpc('demographics_stats', {
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
			const { data, error } = await deltaClient.rpc('demographics_stats', {
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
	// same-named column on core_stats. #824 removed core_stats' copy (and
	// the corresponding UI series, #817) as unused, so this is now the only
	// new_young_bird_count column in the schema — these tests cover its derivation
	// directly rather than parity against core_stats.
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

			const locationId = await insertTestLocation(
				deltaClient,
				deltaId,
				`New Young Loc ${testSuffix}`
			);
			locationIds.push(locationId);

			async function addBird(date: string, record_type: string) {
				const sessionId = await insertTestSession(
					deltaClient,
					locationId,
					date
				);
				sessionIds.push(sessionId);

				const birdId = await insertTestBird(
					deltaClient,
					`NY-${testSuffix}-${date}`,
					robinId
				);
				birdIds.push(birdId);

				await insertTestEncounter(deltaClient, birdId, sessionId, {
					age_code: 1,
					is_juv: true,
					record_type
				});
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
			const { data, error } = await deltaClient.rpc('demographics_stats', {
				ringing_group_filter: deltaId,
				from_date: newJuvDate,
				to_date: newJuvDate
			});
			expect(error).toBeNull();
			expect(data![0].new_young_bird_count).toBe(1);
		});

		// Edge
		it('a retrap (record_type != N) juv-bucket bird is excluded from new_young_bird_count', async () => {
			const { data, error } = await deltaClient.rpc('demographics_stats', {
				ringing_group_filter: deltaId,
				from_date: retrapJuvDate,
				to_date: retrapJuvDate
			});
			expect(error).toBeNull();
			expect(data![0].new_young_bird_count).toBe(0);
		});
	});

	// Returning-age subsets of adult_bird_count (#843), resolved per bird by the
	// stats_bird_returning_age_bucket utility RPC. Same fixture shape as the
	// age-split block above: every bird's "this period" adult encounter is on its
	// own random far-future date, so an ungrouped from=to=date query returns
	// exactly that one bird and period_year resolves to that date's calendar year;
	// prior-year encounters sit outside every query window and only ever feed the
	// lifetime history.
	//
	// The buckets key off a PERIOD-RELATIVE proven age — period_year minus the
	// smallest max_hatch_year across the bird's encounters up to and including
	// period_year — never the live, all-time Birds.proven_age column. The age
	// codes below are chosen for what trg_set_encounter_generated_fields derives
	// from them at a visit in year V:
	//   age_code 2 -> max_hatch_year V,     min_hatch_year 0 (even = imprecise)
	//   age_code 3 -> max_hatch_year V,     min_hatch_year V
	//   age_code 4 -> max_hatch_year V - 1, min_hatch_year 0
	//   age_code 5 -> max_hatch_year V - 1, min_hatch_year V - 1
	//   age_code 6 -> max_hatch_year V - 2, min_hatch_year 0
	// and only age_code > 3 buckets as 'adult', which is the cohort these columns
	// partition.
	describe('returning age buckets (returning_age_1/2/3_plus/new_unknown_age_bird_count)', () => {
		let deltaId: number;
		let deltaClient: SupabaseClient;
		// A dedicated throwaway group for the multi-group isolation case, rather than the
		// shared `Alpha` seed group — see #935: a temporary Alpha location/session, even
		// cleaned up in afterAll, is visible to any concurrently-running test asserting on
		// Alpha's full row set (e.g. core-stats.test.ts's ALPHA_ALL_VISIT_DATES) for the
		// window between insert and teardown.
		let otherGroupId: number;
		let otherGroupClient: SupabaseClient;
		const locationIds: number[] = [];
		const sessionIds: number[] = [];
		const birdIds: number[] = [];
		const otherGroupLocationIds: number[] = [];
		const otherGroupSessionIds: number[] = [];

		type EncInput = { date: string; age_code: number; is_juv: boolean };

		// Scenario "this period" query dates (each bird gets its own).
		let age1Date: string; // precisely-aged returner, age 1
		let age6Date: string; // long-lived returner, age 6
		let age2Date: string; // exactly 2
		let age3Date: string; // exactly 3
		let imprecisePairDate: string; // 2 encounters, never precisely aged, age 1
		let newImpreciseDate: string; // first-ever imprecise encounter, age 1
		let newImprecise2Date: string; // first-ever imprecise encounter, age 2
		let periodRelativeEarlyDate: string; // same bird, earlier cell
		let periodRelativeLateDate: string; // same bird, later cell
		let periodRelativeBirdId: number;
		let multiGroupDate: string; // other-group history must not count under Delta

		const yearOf = (d: string) => parseInt(d.slice(0, 4), 10);

		beforeAll(async () => {
			deltaId = await getGroupIdByName('Delta');
			deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);

			const testSuffix = randomTestSuffix();
			otherGroupId = createIsolatedGroup(`Returning Age Other ${testSuffix}`);
			otherGroupClient =
				await getAuthenticatedSupabaseClientForGroup(otherGroupId);
			const base = randomFutureDate();

			const { data: robin } = await supabase
				.from('Species')
				.select('id')
				.eq('species_name', 'Robin')
				.single();
			const robinId = robin!.id;

			const deltaLocId = await insertTestLocation(
				deltaClient,
				deltaId,
				`Returning Age Delta Loc ${testSuffix}`
			);
			locationIds.push(deltaLocId);

			const otherGroupLocId = await insertTestLocation(
				otherGroupClient,
				otherGroupId,
				`Returning Age Other Loc ${testSuffix}`
			);
			otherGroupLocationIds.push(otherGroupLocId);

			const getSession = createSessionResolver();

			function insertEncounter(
				client: SupabaseClient,
				birdId: number,
				sessionId: number,
				enc: { age_code: number; is_juv: boolean }
			) {
				return insertTestEncounter(client, birdId, sessionId, {
					age_code: enc.age_code,
					is_juv: enc.is_juv,
					record_type: 'R'
				});
			}

			const nextRing = createRingNoSequence(`RETAGE-${testSuffix}`);
			async function addBird(encounters: EncInput[]): Promise<number> {
				const birdId = await insertTestBird(deltaClient, nextRing(), robinId);
				birdIds.push(birdId);
				for (const e of encounters) {
					const sessionId = await getSession(
						deltaClient,
						e.date,
						deltaLocId,
						sessionIds
					);
					await insertEncounter(deltaClient, birdId, sessionId, e);
				}
				return birdId;
			}

			// Age 1, precisely aged and genuinely returning: ringed as a bare age-3
			// bird in (period_year - 1) (max_hatch_year = that year, precisely aged),
			// retrapped as an adult this period.
			age1Date = addDays(base, 0);
			await addBird([
				{ date: `${yearOf(age1Date) - 1}-05-10`, age_code: 3, is_juv: false },
				{ date: age1Date, age_code: 4, is_juv: false }
			]);

			// Age 6: first encounter six years before this period year.
			age6Date = addDays(base, 20);
			await addBird([
				{ date: `${yearOf(age6Date) - 6}-05-10`, age_code: 3, is_juv: false },
				{ date: age6Date, age_code: 4, is_juv: false }
			]);

			// Exactly 2.
			age2Date = addDays(base, 40);
			await addBird([
				{ date: `${yearOf(age2Date) - 2}-05-10`, age_code: 3, is_juv: false },
				{ date: age2Date, age_code: 4, is_juv: false }
			]);

			// Exactly 3.
			age3Date = addDays(base, 60);
			await addBird([
				{ date: `${yearOf(age3Date) - 3}-05-10`, age_code: 3, is_juv: false },
				{ date: age3Date, age_code: 4, is_juv: false }
			]);

			// Genuinely returning but never precisely aged: both encounters carry an
			// even age_code (min_hatch_year 0), and the pair still computes an age of
			// 1 — so the carve-out COULD fire on the age, but must not, because the
			// bird has two encounters to date.
			imprecisePairDate = addDays(base, 80);
			await addBird([
				{
					date: `${yearOf(imprecisePairDate) - 1}-05-10`,
					age_code: 2,
					is_juv: false
				},
				{ date: imprecisePairDate, age_code: 4, is_juv: false }
			]);

			// First-ever encounter, imprecise (age_code 4), computing an age of 1 —
			// the carve-out case.
			newImpreciseDate = addDays(base, 100);
			await addBird([{ date: newImpreciseDate, age_code: 4, is_juv: false }]);

			// First-ever encounter, imprecise (age_code 6), computing an age of 2 —
			// deliberately NOT carved out.
			newImprecise2Date = addDays(base, 120);
			await addBird([{ date: newImprecise2Date, age_code: 6, is_juv: false }]);

			// One bird read in two different cells: first ringed (precisely, age_code
			// 3) four years before the later cell, adult in both cells. The earlier
			// cell must read 2, the later 4 — while the live Birds.proven_age column
			// holds only the all-time 4.
			periodRelativeLateDate = addDays(base, 140);
			periodRelativeEarlyDate = `${yearOf(periodRelativeLateDate) - 2}-05-11`;
			periodRelativeBirdId = await addBird([
				{
					date: `${yearOf(periodRelativeLateDate) - 4}-05-10`,
					age_code: 3,
					is_juv: false
				},
				{ date: periodRelativeEarlyDate, age_code: 4, is_juv: false },
				{ date: periodRelativeLateDate, age_code: 4, is_juv: false }
			]);

			// Multi-group isolation: a precisely-aged other-group encounter five years
			// back plus a first Delta encounter this period. Under ringing_group_filter =
			// Delta the other group's history is invisible, so this reads as a first-ever
			// imprecise encounter ('new_unknown_age'), not a 5-year returner.
			multiGroupDate = addDays(base, 160);
			const mgBirdId = await insertTestBird(
				deltaClient,
				`RETAGE-${testSuffix}-MG`,
				robinId
			);
			birdIds.push(mgBirdId);
			const otherGroupSess = await getSession(
				otherGroupClient,
				`${yearOf(multiGroupDate) - 5}-05-10`,
				otherGroupLocId,
				otherGroupSessionIds
			);
			await insertEncounter(otherGroupClient, mgBirdId, otherGroupSess, {
				age_code: 3,
				is_juv: false
			});
			const mgDeltaSess = await getSession(
				deltaClient,
				multiGroupDate,
				deltaLocId,
				sessionIds
			);
			await insertEncounter(deltaClient, mgBirdId, mgDeltaSess, {
				age_code: 4,
				is_juv: false
			});
		});

		afterAll(() => {
			const allSessions = [...sessionIds, ...otherGroupSessionIds];
			const allLocations = [...locationIds, ...otherGroupLocationIds];
			execSync(
				`psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c '` +
					`DELETE FROM "Encounters" WHERE bird_id IN (${birdIds.join(', ')});` +
					`DELETE FROM "Birds" WHERE id IN (${birdIds.join(', ')});` +
					`DELETE FROM "Sessions" WHERE id IN (${allSessions.join(', ')});` +
					`DELETE FROM "Locations" WHERE id IN (${allLocations.join(', ')});'`
			);
			psql(`DELETE FROM "RingingGroups" WHERE id = ${otherGroupId};`);
		});

		// An ungrouped single-date aggregate row (covers exactly the one bird on `date`).
		async function returningAgeRow(date: string) {
			const { data, error } = await deltaClient.rpc('demographics_stats', {
				ringing_group_filter: deltaId,
				from_date: date,
				to_date: date
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			return data![0];
		}

		// Usual
		it('a bird recaptured this period, precisely aged 1 year returning, counts in returning_age_1_bird_count only', async () => {
			const row = await returningAgeRow(age1Date);
			expect(row).toMatchObject({
				adult_bird_count: 1,
				returning_age_1_bird_count: 1,
				returning_age_2_bird_count: 0,
				returning_age_3_plus_bird_count: 0,
				returning_new_unknown_age_bird_count: 0
			});
		});

		it('a bird recaptured well past the 3-year boundary (6 years) counts in returning_age_3_plus_bird_count only', async () => {
			const row = await returningAgeRow(age6Date);
			expect(row).toMatchObject({
				adult_bird_count: 1,
				returning_age_1_bird_count: 0,
				returning_age_2_bird_count: 0,
				returning_age_3_plus_bird_count: 1,
				returning_new_unknown_age_bird_count: 0
			});
		});

		// Structure
		it('a bird exactly at period-relative proven age 2 counts in returning_age_2_bird_count, not 1 or 3_plus', async () => {
			const row = await returningAgeRow(age2Date);
			expect(row).toMatchObject({
				adult_bird_count: 1,
				returning_age_1_bird_count: 0,
				returning_age_2_bird_count: 1,
				returning_age_3_plus_bird_count: 0,
				returning_new_unknown_age_bird_count: 0
			});
		});

		it('a bird exactly at period-relative proven age 3 counts in returning_age_3_plus_bird_count, not 2', async () => {
			const row = await returningAgeRow(age3Date);
			expect(row).toMatchObject({
				adult_bird_count: 1,
				returning_age_2_bird_count: 0,
				returning_age_3_plus_bird_count: 1
			});
		});

		it('a genuinely-returning bird that has never been precisely aged counts in its numeric bucket, not returning_new_unknown_age_bird_count', async () => {
			const row = await returningAgeRow(imprecisePairDate);
			expect(row).toMatchObject({
				adult_bird_count: 1,
				returning_age_1_bird_count: 1,
				returning_new_unknown_age_bird_count: 0
			});
		});

		it('the four returning-age columns partition the adult cohort for a cell holding one bird of each kind', async () => {
			const { data, error } = await deltaClient.rpc('demographics_stats', {
				ringing_group_filter: deltaId,
				from_date: age1Date,
				to_date: newImprecise2Date
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			const row = data![0];
			expect(
				row.returning_age_1_bird_count +
					row.returning_age_2_bird_count +
					row.returning_age_3_plus_bird_count +
					row.returning_new_unknown_age_bird_count
			).toBe(row.adult_bird_count);
		});

		// Edge
		it("a bird's very first-ever encounter, coded imprecisely and computing an age of 1, counts in returning_new_unknown_age_bird_count", async () => {
			const row = await returningAgeRow(newImpreciseDate);
			expect(row).toMatchObject({
				adult_bird_count: 1,
				returning_age_1_bird_count: 0,
				returning_new_unknown_age_bird_count: 1
			});
		});

		it('a first-ever imprecisely-coded encounter computing an age of 2 is NOT carved out — it lands in returning_age_2_bird_count', async () => {
			const row = await returningAgeRow(newImprecise2Date);
			expect(row).toMatchObject({
				adult_bird_count: 1,
				returning_age_2_bird_count: 1,
				returning_new_unknown_age_bird_count: 0
			});
		});

		it("the bucket is computed relative to the cell's own period_year, not the bird's live Birds.proven_age", async () => {
			const earlier = await returningAgeRow(periodRelativeEarlyDate);
			expect(earlier).toMatchObject({
				adult_bird_count: 1,
				returning_age_2_bird_count: 1,
				returning_age_3_plus_bird_count: 0
			});
			const later = await returningAgeRow(periodRelativeLateDate);
			expect(later).toMatchObject({
				adult_bird_count: 1,
				returning_age_2_bird_count: 0,
				returning_age_3_plus_bird_count: 1
			});
			// The live column holds only the all-time value the later cell happens to
			// agree with — the earlier cell's 2 is unobtainable from it.
			const { data: bird, error: birdError } = await deltaClient
				.from('Birds')
				.select('proven_age')
				.eq('id', periodRelativeBirdId)
				.single();
			expect(birdError).toBeNull();
			expect(bird!.proven_age).toBe(4);
		});

		it("another ringing group's history is excluded when ringing_group_filter is set", async () => {
			const row = await returningAgeRow(multiGroupDate);
			expect(row).toMatchObject({
				adult_bird_count: 1,
				returning_age_3_plus_bird_count: 0,
				returning_new_unknown_age_bird_count: 1
			});
		});
	});

	// Regression guards for #932, which restructured stats_bird_returning_age_bucket
	// from a per-cell re-aggregation of each bird's whole per-encounter lifetime
	// history into a single window pass over a merged stream: the history collapsed
	// to one row per (bird, calendar year), UNIONed with the cells, accumulated once
	// per bird. Output is meant to be byte-for-byte unchanged, so the block above
	// (which asserts the classification rules themselves) is the primary guard. These
	// tests pin the two things the restructuring specifically could break and the old
	// shape structurally could not:
	//
	//   * the per-year GROUP BY that collapses several encounters in ONE calendar year
	//     into a single stream row — if it lost the row count or the
	//     precisely-aged flag, a multi-encounter bird would be misread as a
	//     single-encounter one and wrongly carved out to 'new_unknown_age';
	//   * the running window frame, which must cover every history year <= a cell's
	//     own period_year and no more — checked across many cells of one bird, and at
	//     the 1 / 2 / 3_plus boundary years of a bird with a 17-year history.
	//
	// Isolation: these queries are the only ones in the suite that read several cells
	// at once (rather than a single from=to=date row), so besides the usual random
	// far-future dates they also filter on 'Kingfisher' — a species no other test in
	// this file touches — so a concurrent worktree's rows can never land in the same
	// cells.
	//
	// Not covered, deliberately: a cell whose bird has NO lifetime encounter at or
	// before its period_year. The refactor keeps the old LEFT JOIN's NULL-bucket
	// behaviour for it, but it is unreachable through the RPC's public surface —
	// stats_raw_encounters scopes the windowed source by the same
	// sess.ringing_group_id the lifetime CTE uses, so a bird's windowed encounters
	// are always a subset of its lifetime ones. See the note in
	// stats_bird_returning_age_bucket.sql.
	describe('returning age buckets — cumulative per-year history (#932)', () => {
		let deltaId: number;
		let deltaClient: SupabaseClient;
		const locationIds: number[] = [];
		const sessionIds: number[] = [];
		const birdIds: number[] = [];

		// Disjoint year bands, so no two of these birds ever share a cell except
		// where a test deliberately puts them there.
		let baseYear: number;
		let longHistoryFirstYear: number; // ringed here, then adult for 16 more years
		let multiCellRingYear: number; // ringed here, adult in the two years after next
		let sameYearYear: number; // one bird's only calendar year, 3 encounters
		let singlePreciseYear: number; // one bird's only calendar year, 1 encounter

		const LONG_HISTORY_YEARS = 16;
		// Month/day each bird uses within a year, so a date is derivable from a year.
		const visitDateIn = (year: number, month = 5) =>
			`${year}-${String(month).padStart(2, '0')}-15`;

		beforeAll(async () => {
			deltaId = await getGroupIdByName('Delta');
			deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);

			const testSuffix = randomTestSuffix();
			baseYear = parseInt(randomFutureDate().slice(0, 4), 10);
			longHistoryFirstYear = baseYear - 20;
			multiCellRingYear = baseYear - 3;
			sameYearYear = baseYear + 2;
			singlePreciseYear = baseYear + 3;

			const { data: kingfisher, error: speciesError } = await supabase
				.from('Species')
				.select('id')
				.eq('species_name', 'Kingfisher')
				.single();
			if (speciesError) throw speciesError;
			const kingfisherId = kingfisher!.id;

			const locationId = await insertTestLocation(
				deltaClient,
				deltaId,
				`Cumulative History Loc ${testSuffix}`
			);
			locationIds.push(locationId);

			const getSessionResolver = createSessionResolver();
			const getSession = (date: string) =>
				getSessionResolver(deltaClient, date, locationId, sessionIds);

			const nextRing = createRingNoSequence(`CUMHIST-${testSuffix}`);
			async function addBird(
				encounters: { date: string; age_code: number }[]
			): Promise<number> {
				const birdId = await insertTestBird(
					deltaClient,
					nextRing(),
					kingfisherId
				);
				birdIds.push(birdId);
				for (const encounter of encounters) {
					const sessionId = await getSession(encounter.date);
					await insertTestEncounter(deltaClient, birdId, sessionId, {
						age_code: encounter.age_code,
						is_juv: false,
						record_type: 'R'
					});
				}
				return birdId;
			}

			// (a) One bird read across many monthly cells spanning two calendar years.
			// Precisely ringed (age_code 3, max_hatch_year = multiCellRingYear) two
			// years before the first adult year, so every cell in multiCellRingYear + 2
			// must read 2 and every cell in multiCellRingYear + 3 must read 3_plus.
			await addBird([
				{ date: visitDateIn(multiCellRingYear, 5), age_code: 3 },
				{ date: visitDateIn(multiCellRingYear + 2, 3), age_code: 4 },
				{ date: visitDateIn(multiCellRingYear + 2, 9), age_code: 4 },
				{ date: visitDateIn(multiCellRingYear + 3, 2), age_code: 4 },
				{ date: visitDateIn(multiCellRingYear + 3, 6), age_code: 4 },
				{ date: visitDateIn(multiCellRingYear + 3, 11), age_code: 4 }
			]);

			// (b) Three encounters, all in ONE calendar year, all imprecise (age_code 4
			// -> max_hatch_year year - 1, min_hatch_year 0). Age computes to 1 and the
			// bird was never precisely aged, so ONLY the encounter count keeps it out of
			// the 'new_unknown_age' carve-out — exactly what the per-year collapse must
			// preserve.
			await addBird([
				{ date: visitDateIn(sameYearYear, 4), age_code: 4 },
				{ date: visitDateIn(sameYearYear, 7), age_code: 4 },
				{ date: visitDateIn(sameYearYear, 10), age_code: 4 }
			]);

			// (c) A single first-ever encounter in the SAME month as one of bird (b)'s,
			// imprecise and computing an age of 1 — the carve-out case. Shares a cell
			// with (b), so one query sees both classifications side by side.
			await addBird([{ date: visitDateIn(sameYearYear, 7), age_code: 4 }]);

			// (d) A single first-ever encounter, precisely aged (age_code 5 ->
			// max_hatch_year year - 1, min_hatch_year year - 1), computing an age of 1.
			// The precisely-aged flag must survive the per-year collapse, or this bird
			// would be wrongly carved out to 'new_unknown_age'.
			await addBird([{ date: visitDateIn(singlePreciseYear, 5), age_code: 5 }]);

			// (e) A 17-distinct-year history: precisely ringed, then one adult encounter
			// per year for the next 16 years.
			await addBird([
				{ date: visitDateIn(longHistoryFirstYear, 5), age_code: 3 },
				...Array.from({ length: LONG_HISTORY_YEARS }, (_, offset) => ({
					date: visitDateIn(longHistoryFirstYear + offset + 1, 5),
					age_code: 4
				}))
			]);
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

		// A single ungrouped Kingfisher row covering exactly one date.
		async function kingfisherRowOn(date: string) {
			const { data, error } = await deltaClient.rpc('demographics_stats', {
				species_name_filter: 'Kingfisher',
				ringing_group_filter: deltaId,
				from_date: date,
				to_date: date
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			return data![0];
		}

		// Usual
		it('a bird with a 3-calendar-year history reads the same bucket in every monthly cell of a given year, and shifts one bucket in the next', async () => {
			const { data, error } = await deltaClient.rpc('demographics_stats', {
				species_name_filter: 'Kingfisher',
				ringing_group_filter: deltaId,
				from_date: `${multiCellRingYear + 2}-01-01`,
				to_date: `${multiCellRingYear + 3}-12-31`,
				group_by_time_period: 'month'
			});
			expect(error).toBeNull();

			const cellFor = (date: string) =>
				data!.find((row) => row.time_period === date.slice(0, 8) + '01');

			// Two cells in the earlier year: period_year - max_hatch_year = 2.
			for (const month of [3, 9]) {
				expect(
					cellFor(visitDateIn(multiCellRingYear + 2, month))
				).toMatchObject({
					adult_bird_count: 1,
					returning_age_1_bird_count: 0,
					returning_age_2_bird_count: 1,
					returning_age_3_plus_bird_count: 0,
					returning_new_unknown_age_bird_count: 0
				});
			}

			// Three cells in the later year: the same bird, now reading 3.
			for (const month of [2, 6, 11]) {
				expect(
					cellFor(visitDateIn(multiCellRingYear + 3, month))
				).toMatchObject({
					adult_bird_count: 1,
					returning_age_1_bird_count: 0,
					returning_age_2_bird_count: 0,
					returning_age_3_plus_bird_count: 1,
					returning_new_unknown_age_bird_count: 0
				});
			}
		});

		// Structure
		it('a bird with three encounters in one calendar year is not carved out as new_unknown_age — the per-year collapse keeps its encounter count', async () => {
			const row = await kingfisherRowOn(visitDateIn(sameYearYear, 4));
			expect(row).toMatchObject({
				adult_bird_count: 1,
				returning_age_1_bird_count: 1,
				returning_new_unknown_age_bird_count: 0
			});
		});

		it('a single precisely-aged first encounter is not carved out — the per-year collapse keeps its precisely-aged flag', async () => {
			const row = await kingfisherRowOn(visitDateIn(singlePreciseYear, 5));
			expect(row).toMatchObject({
				adult_bird_count: 1,
				returning_age_1_bird_count: 1,
				returning_new_unknown_age_bird_count: 0
			});
		});

		it('a multi-encounter and a single-encounter bird sharing one cell land in different buckets', async () => {
			const row = await kingfisherRowOn(visitDateIn(sameYearYear, 7));
			expect(row).toMatchObject({
				adult_bird_count: 2,
				returning_age_1_bird_count: 1,
				returning_age_2_bird_count: 0,
				returning_age_3_plus_bird_count: 0,
				returning_new_unknown_age_bird_count: 1
			});
		});

		// Edge
		it('a bird with 17 distinct encounter years reads the exact bucket boundaries 1 / 2 / 3_plus in its first three returning years', async () => {
			const expectations: [number, Record<string, number>][] = [
				[1, { returning_age_1_bird_count: 1, returning_age_2_bird_count: 0 }],
				[
					2,
					{ returning_age_2_bird_count: 1, returning_age_3_plus_bird_count: 0 }
				],
				[
					3,
					{ returning_age_2_bird_count: 0, returning_age_3_plus_bird_count: 1 }
				]
			];
			for (const [yearOffset, expected] of expectations) {
				const row = await kingfisherRowOn(
					visitDateIn(longHistoryFirstYear + yearOffset, 5)
				);
				expect(row).toMatchObject({ adult_bird_count: 1, ...expected });
			}
		});

		it('the same bird still reads 3_plus at the far end of its 17-year history', async () => {
			const row = await kingfisherRowOn(
				visitDateIn(longHistoryFirstYear + LONG_HISTORY_YEARS, 5)
			);
			expect(row).toMatchObject({
				adult_bird_count: 1,
				returning_age_1_bird_count: 0,
				returning_age_2_bird_count: 0,
				returning_age_3_plus_bird_count: 1,
				returning_new_unknown_age_bird_count: 0
			});
		});
	});

	// Thin confirming assertion — the actual exclusion logic is covered in depth by
	// stats-raw-encounters-and-spine.test.ts, since demographics_stats inherits it from
	// the shared stats_raw_encounters/stats_spine utility RPCs (#874).
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
					location_name: `DemographicsStats Resighting ${suffix}`,
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

			const { data: bird, error: birdError } = await deltaClient
				.from('Birds')
				.insert({ ring_no: `DS-RSE-${suffix}`, species_id: robin!.id })
				.select('id')
				.single();
			if (birdError) throw birdError;
			birdId = bird!.id;

			// A single resighting-only encounter — an otherwise-adult record_type that
			// would land in adult_bird_count were it not filtered out upstream.
			const { error: encounterError } = await deltaClient
				.from('Encounters')
				.insert({
					capture_time: '10:00:00',
					scheme: 'BTO',
					sex: 'M',
					session_id: sessionId,
					bird_id: birdId,
					age_code: 4,
					record_type: 'F',
					weight: 10,
					wing_length: 50
				});
			if (encounterError) throw encounterError;
		});

		afterAll(() => {
			execSync(
				`psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c '` +
					`DELETE FROM "Encounters" WHERE bird_id = ${birdId};` +
					`DELETE FROM "Birds" WHERE id = ${birdId};` +
					`DELETE FROM "Sessions" WHERE id = ${sessionId};` +
					`DELETE FROM "Locations" WHERE id = ${locationId};'`
			);
		});

		it('excludes a resighting-only bird from adult_bird_count', async () => {
			const { data, error } = await deltaClient.rpc('demographics_stats', {
				ringing_group_filter: deltaId,
				from_date: visitDate,
				to_date: visitDate
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			expect(data![0].adult_bird_count).toBe(0);
		});
	});

	// Regression guards for the plan-stability rewrite of
	// stats_bird_returning_age_bucket's adult_birds CTE (2026-09-20). A cell's
	// period_year used to be attached to each of that cell's adult birds by a join
	// on `py.species_id IS NOT DISTINCT FROM bab.species_id AND py.time_period IS
	// NOT DISTINCT FROM bab.time_period`; it is now attached by
	// MAX(period_year) OVER (PARTITION BY species_id, time_period) over a merged
	// stream of cell rows and bird rows. Output is meant to be byte-for-byte
	// unchanged, so every block above stays the primary guard, and the #932 block's
	// multi-month query already pins per-cell attachment along the time_period axis.
	//
	// What no existing test pinned is the SPECIES axis with no time grouping at
	// all. That is the one shape where a cell's period_year comes from the cell's
	// own MAX(visit_date) rather than from its time_period, so a partition that
	// leaked across species would silently stamp the latest species' year onto an
	// earlier species' cell. The two tests below are the same two birds read as two
	// cells and then as one: split by species each reads age 1, and merged into a
	// single ungrouped cell the earlier bird reads 3_plus instead — so the first
	// test cannot pass vacuously.
	//
	// Isolation: a throwaway group of its own, since these queries are unfiltered
	// by species and must not see a concurrent worktree's rows.
	describe('returning age buckets — per-cell period_year across the merged cell stream', () => {
		let groupId: number;
		let groupClient: SupabaseClient;
		let earlyYear: number; // the Robin bird's only calendar year
		let lateYear: number; // the Kingfisher bird's only calendar year, 4 years later
		const birdIds: number[] = [];

		beforeAll(async () => {
			const testSuffix = randomTestSuffix();
			groupId = createIsolatedGroup(`Returning Age Cells ${testSuffix}`);
			groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);

			earlyYear = parseInt(randomFutureDate().slice(0, 4), 10);
			lateYear = earlyYear + 4;

			const locationId = await insertTestLocation(
				groupClient,
				groupId,
				`Returning Age Cells Loc ${testSuffix}`
			);

			// One bird per species, each with a single precisely-aged adult encounter
			// (age_code 5 -> max_hatch_year = visit year - 1, min_hatch_year likewise,
			// so it is never carved out to 'new_unknown_age') in its own calendar year.
			async function addBird(speciesName: string, year: number, ring: string) {
				const { data: species, error: speciesError } = await supabase
					.from('Species')
					.select('id')
					.eq('species_name', speciesName)
					.single();
				if (speciesError) throw speciesError;

				const sessionId = await insertTestSession(
					groupClient,
					locationId,
					`${year}-05-15`
				);

				const birdId = await insertTestBird(groupClient, ring, species!.id);
				birdIds.push(birdId);

				await insertTestEncounter(groupClient, birdId, sessionId, {
					age_code: 5,
					is_juv: false,
					record_type: 'R'
				});
			}

			await addBird('Robin', earlyYear, `RETCELL-${testSuffix}-R`);
			await addBird('Kingfisher', lateYear, `RETCELL-${testSuffix}-K`);
		});

		afterAll(() => {
			psql(
				`DELETE FROM "Encounters" WHERE ringing_group_id = ${groupId};` +
					`DELETE FROM "Birds" WHERE id IN (${birdIds.join(', ')});` +
					`DELETE FROM "Sessions" WHERE ringing_group_id = ${groupId};` +
					`DELETE FROM "Locations" WHERE ringing_group_id = ${groupId};` +
					`DELETE FROM "RingingGroups" WHERE id = ${groupId};`
			);
		});

		// Structure
		it('each species cell resolves its own period_year, so both birds read age 1', async () => {
			const { data, error } = await groupClient.rpc('demographics_stats', {
				ringing_group_filter: groupId,
				group_by_species: true
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(2);
			const bySpecies = Object.fromEntries(
				data!.map((row) => [row.species_name, row])
			);

			// The earlier cell is the one a leaked period_year would break: read with
			// the Kingfisher cell's year it would compute an age of 5, not 1.
			expect(bySpecies['Robin']).toMatchObject({
				adult_bird_count: 1,
				returning_age_1_bird_count: 1,
				returning_age_2_bird_count: 0,
				returning_age_3_plus_bird_count: 0,
				returning_new_unknown_age_bird_count: 0
			});
			expect(bySpecies['Kingfisher']).toMatchObject({
				adult_bird_count: 1,
				returning_age_1_bird_count: 1,
				returning_age_3_plus_bird_count: 0
			});
		});

		it('the same two birds in one ungrouped cell share that cell’s period_year, so the earlier bird reads 3_plus', async () => {
			const { data, error } = await groupClient.rpc('demographics_stats', {
				ringing_group_filter: groupId
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			expect(data![0]).toMatchObject({
				adult_bird_count: 2,
				returning_age_1_bird_count: 1,
				returning_age_2_bird_count: 0,
				returning_age_3_plus_bird_count: 1,
				returning_new_unknown_age_bird_count: 0
			});
		});
	});
});
