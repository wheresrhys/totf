/**
 * Integration tests for the `stats_cache_new_adult_metrics` Postgres RPC
 * function (#1150).
 *
 * One of six small, read-only "metric-group" RPCs a later orchestrator calls to
 * populate a stats cache table — but unlike its five siblings (which feed T8a's
 * period-local `SimpleStatsCache`), this one feeds T8b's lifetime-relative
 * `ComplexStatsCache`: `new_adult_bird_count` answers "is this cell's
 * period_year the bird's first-ever-with-this-group calendar year?", which
 * reads a bird's whole UNWINDOWED encounter history, so it can never be
 * computed incrementally from a windowed delta.
 *
 * An almost-direct port of `demographics_stats`' own `new_adult_bird_count`
 * derivation, keyed on `species_id` rather than `species_name`, with every
 * other `demographics_stats` column dropped. See
 * `stats_cache_new_adult_metrics.sql`'s header for why its `cell_period_year`
 * attachment uses the `stats_bird_returning_age_bucket`-style merge-the-streams
 * `UNION ALL` + `MAX(...) OVER (PARTITION BY species_id, time_period)` pattern
 * instead of `demographics_stats`' current `IS NOT DISTINCT FROM` join (the
 * exact join `stats_bird_returning_age_bucket`'s own 2026-09-20 plan-stability
 * fix replaced), while `bird_first_year` stays a plain per-bird aggregate +
 * ordinary `bird_id` equi-join (not a per-cell "as of" read, so #932's
 * merge-the-streams treatment doesn't apply to it).
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
import { randomTestSuffix } from '../test-isolation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getGroupIdByName } from './helpers/seed-lookups';
import { createIsolatedGroup, psql } from '../db-test-helpers';
import {
	insertTestLocation,
	createSessionResolver,
	insertTestBird,
	insertTestEncounter,
	createRingNoSequence
} from './helpers/encounter-fixtures';

/** bigint columns can arrive as a number or a stringified numeric; coerce before comparing. */
const num = (value: unknown): number => Number(value);

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

const ADULT = { age_code: 4, is_juv: false };

describe('stats_cache_new_adult_metrics', () => {
	describe('new-adult classification', () => {
		it("matches demographics_stats' own new_adult_bird_count for identical filters", async () => {
			// demographics_stats' own cross-check call shape (per-species monthly
			// history) — same convention stats-cache-bird-age-metrics.test.ts uses.
			const alphaId = await getGroupIdByName('Alpha');
			const alphaClient = await getAuthenticatedSupabaseClientForGroup(alphaId);
			const filters = {
				ringing_group_filter: alphaId,
				species_name_filter: 'Robin',
				group_by_time_period: 'month'
			};
			const { data, error } = await alphaClient.rpc(
				'stats_cache_new_adult_metrics',
				filters
			);
			expect(error).toBeNull();
			const demographicsResult = await alphaClient.rpc(
				'demographics_stats',
				filters
			);
			expect(demographicsResult.error).toBeNull();
			expect(data).toHaveLength(demographicsResult.data!.length);
			expect(data!.length).toBeGreaterThan(0);

			for (const row of data!) {
				const demographicsRow = demographicsResult.data!.find(
					(candidate) => candidate.time_period === row.time_period
				);
				expect(
					demographicsRow,
					`no demographics_stats row for ${row.time_period}`
				).toBeDefined();
				expect(
					num(row.new_adult_bird_count),
					`new_adult_bird_count for ${row.time_period}`
				).toBe(num(demographicsRow!.new_adult_bird_count));
			}
		});

		// A dedicated throwaway group rather than a shared seed group — a
		// Sessions row is keyed on (visit_date, ringing_group_id), and these dates
		// are drawn from the same narrow random-year range other RPC integration
		// test files also draw from, so an isolated group's unique id is the only
		// collision-free option (same reasoning as every sibling in this RPC
		// family). Scenarios below are scoped to disjoint, narrow date windows so
		// they never bleed into each other within the same shared group.
		let groupId: number;
		let groupClient: SupabaseClient;
		let otherGroupId: number;
		let otherGroupClient: SupabaseClient;

		const locationIds: number[] = [];
		const sessionIds: number[] = [];
		const birdIds: number[] = [];
		const otherGroupLocationIds: number[] = [];
		const otherGroupSessionIds: number[] = [];

		let robinId: number;
		let wrenId: number;
		let yr: number;

		let naDate: string; // new_adult
		let returnerDate: string; // adult returner (not a new adult)
		let mgDate: string; // multi-group isolation
		let robinLeakDate: string; // cross-species leakage guard (Robin, new adult)
		let wrenLeakDate: string; // cross-species leakage guard (Wren, returner)
		let novDate: string, decDate: string, janDate: string; // year-boundary shape

		beforeAll(async () => {
			const testSuffix = randomTestSuffix();
			groupId = createIsolatedGroup(`StatsCacheNewAdult ${testSuffix}`);
			groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
			otherGroupId = createIsolatedGroup(
				`StatsCacheNewAdult Other ${testSuffix}`
			);
			otherGroupClient = await getAuthenticatedSupabaseClientForGroup(
				otherGroupId
			);

			yr = 2080 + Math.floor(Math.random() * 18); // 2080-2097, leaves room for yr+1
			naDate = `${yr}-03-10`;
			returnerDate = `${yr}-03-12`;
			mgDate = `${yr}-03-14`;
			robinLeakDate = `${yr}-03-16`;
			wrenLeakDate = `${yr}-03-16`;
			novDate = `${yr}-11-10`;
			decDate = `${yr}-12-05`;
			janDate = `${yr + 1}-01-15`;

			robinId = await getSpeciesId('Robin');
			wrenId = await getSpeciesId('Wren');

			const locationId = await insertTestLocation(
				groupClient,
				groupId,
				`StatsCacheNewAdult Loc ${testSuffix}`
			);
			locationIds.push(locationId);
			const otherLocationId = await insertTestLocation(
				otherGroupClient,
				otherGroupId,
				`StatsCacheNewAdult Other Loc ${testSuffix}`
			);
			otherGroupLocationIds.push(otherLocationId);

			const getSession = createSessionResolver();
			const nextRing = createRingNoSequence(`SCNEWADULT-${testSuffix}`);

			async function addBird(
				speciesId: number,
				encounters: [string, boolean?][] // [date, isJuv?]
			): Promise<number> {
				const birdId = await insertTestBird(groupClient, nextRing(), speciesId);
				birdIds.push(birdId);
				for (const [date, isJuv] of encounters) {
					const sessionId = await getSession(
						groupClient,
						date,
						locationId,
						sessionIds
					);
					await insertTestEncounter(groupClient, birdId, sessionId, {
						...(isJuv ? { age_code: 1, is_juv: true } : ADULT),
						record_type: 'N'
					});
				}
				return birdId;
			}

			// new_adult: first-ever (and only) encounter is this period year, as adult.
			await addBird(robinId, [[naDate]]);

			// adult returner: first-ever year earlier (outside every query window
			// below), adult again this period — not a new adult this cell.
			await addBird(robinId, [[`${yr - 1}-05-10`], [returnerDate]]);

			// Cross-species leakage guard: a Robin whose only encounter is this
			// period (new adult) and a Wren whose first-ever year is earlier
			// (returner), both on the SAME date so a single ungrouped-by-time,
			// grouped-by-species query covers both at once.
			await addBird(robinId, [[robinLeakDate]]);
			await addBird(wrenId, [[`${yr - 1}-04-01`], [wrenLeakDate]]);

			// Year-boundary shape: one bird, first-ever encounter in Nov, a second
			// adult encounter in Dec (same year), and a third in Jan the following
			// year.
			await addBird(robinId, [[novDate], [decDate], [janDate]]);

			// Multi-group isolation: an earlier-year encounter under a DIFFERENT
			// group, then a first encounter under this group this period, as
			// adult. The other group's history must not count as "first-ever with
			// this group".
			const mgBirdId = await insertTestBird(
				groupClient,
				`SCNEWADULT-${testSuffix}-MG`,
				robinId
			);
			birdIds.push(mgBirdId);
			const otherGroupSess = await getSession(
				otherGroupClient,
				`${yr - 2}-05-10`,
				otherLocationId,
				otherGroupSessionIds
			);
			await insertTestEncounter(otherGroupClient, mgBirdId, otherGroupSess, {
				...ADULT,
				record_type: 'N'
			});
			const mgSess = await getSession(
				groupClient,
				mgDate,
				locationId,
				sessionIds
			);
			await insertTestEncounter(groupClient, mgBirdId, mgSess, {
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
			psql(`DELETE FROM "RingingGroups" WHERE id IN (${groupId}, ${otherGroupId});`);
		});

		it("a bird's first-ever-with-group encounter year is flagged new-adult", async () => {
			const { data, error } = await groupClient.rpc('stats_cache_new_adult_metrics', {
				ringing_group_filter: groupId,
				from_date: naDate,
				to_date: naDate
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			expect(num(data![0].new_adult_bird_count)).toBe(1);
		});

		it('a later year for the same bird is not flagged new-adult', async () => {
			const { data, error } = await groupClient.rpc('stats_cache_new_adult_metrics', {
				ringing_group_filter: groupId,
				from_date: returnerDate,
				to_date: returnerDate
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			expect(num(data![0].new_adult_bird_count)).toBe(0);
		});

		describe('group scoping', () => {
			it("a bird's history under a DIFFERENT group never counts toward first-ever-year", async () => {
				const { data, error } = await groupClient.rpc(
					'stats_cache_new_adult_metrics',
					{
						ringing_group_filter: groupId,
						from_date: mgDate,
						to_date: mgDate
					}
				);
				expect(error).toBeNull();
				expect(data).toHaveLength(1);
				expect(num(data![0].new_adult_bird_count)).toBe(1);
			});
		});

		describe('performance shape', () => {
			it('a bird read across many cells spanning two calendar years shifts from new-adult to not-new-adult at the correct year boundary, not per individual cell', async () => {
				const { data, error } = await groupClient.rpc(
					'stats_cache_new_adult_metrics',
					{
						ringing_group_filter: groupId,
						from_date: novDate,
						to_date: janDate,
						group_by_time_period: 'month'
					}
				);
				expect(error).toBeNull();
				expect(data).toHaveLength(3);
				const byMonth = Object.fromEntries(
					data!.map((row) => [row.time_period, row])
				);
				// Both year-`yr` cells read new-adult, not just the first
				// chronologically — guards against a merge-stream bug that only
				// classifies the earliest row in a bird's partition correctly.
				expect(num(byMonth[`${yr}-11-01`].new_adult_bird_count)).toBe(1);
				expect(num(byMonth[`${yr}-12-01`].new_adult_bird_count)).toBe(1);
				// The cell one month later, but in the FOLLOWING calendar year,
				// correctly reads not-new-adult.
				expect(num(byMonth[`${yr + 1}-01-01`].new_adult_bird_count)).toBe(0);
			});

			it('cell_period_year attachment stays correctly scoped per species when ungrouped by time period (no cross-species leakage from a shared window partition)', async () => {
				const { data, error } = await groupClient.rpc(
					'stats_cache_new_adult_metrics',
					{
						ringing_group_filter: groupId,
						from_date: robinLeakDate,
						to_date: wrenLeakDate,
						group_by_species: true
					}
				);
				expect(error).toBeNull();
				expect(data).toHaveLength(2);
				const bySpecies = Object.fromEntries(
					data!.map((row) => [row.species_id, row])
				);
				expect(bySpecies[robinId].time_period).toBeNull();
				expect(bySpecies[wrenId].time_period).toBeNull();
				// If the attachment window were ever naively partitioned by
				// time_period alone (both NULL here, since group_by_time_period is
				// unset), Robin's and Wren's period_year would bleed into each
				// other and one of these would flip.
				expect(num(bySpecies[robinId].new_adult_bird_count)).toBe(1);
				expect(num(bySpecies[wrenId].new_adult_bird_count)).toBe(0);
			});
		});
	});
});
