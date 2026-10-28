/**
 * Integration tests for the `stats_cache_biometrics_metrics` Postgres RPC
 * function (#1145).
 *
 * One of six small, read-only "metric-group" RPCs a later orchestrator (T8a,
 * `refresh_simple_stats_cache`) will call to populate the merged
 * `SimpleStatsCache` table (T1a). Originally written as an almost-direct port
 * of the since-deleted `biometrics_stats` (#1246), keyed on `species_id`
 * rather than the display-oriented `species_name` and with no
 * `encounter_count` column; it is now the only owner of these eight columns in
 * the schema. MAX/AVG/MIN/PERCENTILE_CONT over an empty set is NULL (not 0),
 * so an empty cell yields NULLs for all eight columns.
 *
 * The value oracle is this file's own isolated-group fixture data (the
 * "grouping shapes" block), not a captured snapshot of the RPC it replaced:
 * #1224 verified the two column for column while both existed, and the
 * `biometrics_stats/*` fixtures that comparison ran against went with the RPC.
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

// numeric-typed columns can come back as a JS number or a stringified numeric
// depending on the driver; coerce before comparing.
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

describe('stats_cache_biometrics_metrics', () => {
	describe('biometric aggregates', () => {
		let gammaId: number;
		let gammaClient: SupabaseClient;

		beforeAll(async () => {
			gammaId = await getGroupIdByName('Gamma');
			gammaClient = await getAuthenticatedSupabaseClientForGroup(gammaId);
		});

		it('returns NULL, not 0, for a cell with zero biometric-eligible encounters', async () => {
			// Gamma's seed data has zero biometric-eligible encounters. Under
			// group_by_species=true that yields zero rows, since species_spine
			// itself is built from raw_encounters. An ungrouped call's spine
			// always yields exactly one cell regardless of whether any encounters
			// match it, so it's the shape that actually surfaces the NULL-not-0
			// behaviour as a row rather than an absence of rows.
			const { data, error } = await gammaClient.rpc(
				'stats_cache_biometrics_metrics',
				{ ringing_group_filter: gammaId }
			);
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			const row = data![0];
			expect(row.species_id).toBeNull();
			expect(row.time_period).toBeNull();
			expect(row.max_weight).toBeNull();
			expect(row.avg_weight).toBeNull();
			expect(row.min_weight).toBeNull();
			expect(row.median_weight).toBeNull();
			expect(row.max_wing).toBeNull();
			expect(row.avg_wing).toBeNull();
			expect(row.min_wing).toBeNull();
			expect(row.median_wing).toBeNull();
		});
	});

	// One dataset spread over two calendar years, two months with a gap month
	// between them, and two species — mirrors biometrics-stats.test.ts's
	// "grouping variants" dataset, so each grouping mode can be asserted
	// against a known shape.
	describe('grouping shapes', () => {
		// A dedicated throwaway group rather than the shared `Delta` seed group —
		// a Sessions row is keyed on (visit_date, ringing_group_id), and this
		// block's dates are drawn from the same narrow random-year range several
		// other RPC integration test files also draw from for Delta, so reusing
		// Delta risks silently sharing (and corrupting) another test's Session
		// row rather than merely risking the #935-documented visibility concern.
		// An isolated group's id is unique, so no such collision is possible.
		let groupId: number;
		let groupClient: SupabaseClient;

		const locationIds: number[] = [];
		const sessionIds: number[] = [];
		const birdIds: number[] = [];

		let robinId: number;
		let wrenId: number;
		let yr: number;
		let marEarly: string, marLate: string, may: string, nextJun: string;
		let wrenMar: string;

		beforeAll(async () => {
			const testSuffix = randomTestSuffix();
			groupId = createIsolatedGroup(`StatsCacheBiometrics Grouping ${testSuffix}`);
			groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);

			yr = 2080 + Math.floor(Math.random() * 18); // 2080-2097, leaves room for yr+1
			marEarly = `${yr}-03-10`;
			marLate = `${yr}-03-20`;
			may = `${yr}-05-10`;
			nextJun = `${yr + 1}-06-10`;
			wrenMar = `${yr}-03-15`;

			robinId = await getSpeciesId('Robin');
			wrenId = await getSpeciesId('Wren');

			const locationId = await insertTestLocation(
				groupClient,
				groupId,
				`StatsCacheBiometrics Grouping Loc ${testSuffix}`
			);
			locationIds.push(locationId);

			const getSession = createSessionResolver();
			const nextRing = createRingNoSequence(`SCBIOGRP-${testSuffix}`);
			async function addBird(
				speciesId: number,
				date: string,
				weight: number,
				wing: number
			): Promise<void> {
				const birdId = await insertTestBird(groupClient, nextRing(), speciesId);
				birdIds.push(birdId);
				const sessionId = await getSession(
					groupClient,
					date,
					locationId,
					sessionIds
				);
				await insertTestEncounter(groupClient, birdId, sessionId, {
					age_code: 4,
					record_type: 'N',
					weight,
					wing_length: wing
				});
			}

			// Robin: two March encounters, one May, one the following June.
			await addBird(robinId, marEarly, 10, 50);
			await addBird(robinId, marLate, 20, 60);
			await addBird(robinId, may, 30, 70);
			await addBird(robinId, nextJun, 40, 80);
			// Wren: one March encounter (for the species-grouping case).
			await addBird(wrenId, wrenMar, 8, 44);
		});

		afterAll(() => {
			execSync(
				`psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c '` +
					`DELETE FROM "Encounters" WHERE bird_id IN (${birdIds.join(', ')});` +
					`DELETE FROM "Birds" WHERE id IN (${birdIds.join(', ')});` +
					`DELETE FROM "Sessions" WHERE id IN (${sessionIds.join(', ')});` +
					`DELETE FROM "Locations" WHERE id IN (${locationIds.join(', ')});'`
			);
			psql(`DELETE FROM "RingingGroups" WHERE id = ${groupId};`);
		});

		it('returns one ungrouped row spanning the whole filtered range', async () => {
			const { data, error } = await groupClient.rpc(
				'stats_cache_biometrics_metrics',
				{
					ringing_group_filter: groupId,
					species_name_filter: 'Robin',
					from_date: marEarly,
					to_date: nextJun
				}
			);
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			expect(data![0].species_id).toBeNull();
			expect(data![0].time_period).toBeNull();
			// Weights 10/20/30/40 and wings 50/60/70/80 across the whole window.
			// All four aggregates are asserted here (not just the two extremes)
			// because this block's hand-built data is now the only value oracle
			// for avg/median — the fixture comparison against the deleted
			// `biometrics_stats` that used to cover them went with the RPC
			// (#1246). An even-sized set makes PERCENTILE_CONT interpolate, so
			// median and avg coincide at 25/65 here by construction.
			expect(num(data![0].max_weight)).toBe(40);
			expect(num(data![0].avg_weight)).toBeCloseTo(25, 1);
			expect(num(data![0].min_weight)).toBe(10);
			expect(num(data![0].median_weight)).toBeCloseTo(25, 1);
			expect(num(data![0].max_wing)).toBe(80);
			expect(num(data![0].avg_wing)).toBeCloseTo(65, 1);
			expect(num(data![0].min_wing)).toBe(50);
			expect(num(data![0].median_wing)).toBeCloseTo(65, 1);
		});

		it('returns one row per species when group_by_species is true', async () => {
			const { data, error } = await groupClient.rpc(
				'stats_cache_biometrics_metrics',
				{
					ringing_group_filter: groupId,
					from_date: `${yr}-03-01`,
					to_date: `${yr}-05-31`,
					group_by_species: true
				}
			);
			expect(error).toBeNull();
			expect(data).toHaveLength(2);
			const bySpecies = Object.fromEntries(
				data!.map((row) => [row.species_id, row])
			);
			// Robin in-window: 10/20/30 -> max 30, min 10.
			expect(num(bySpecies[robinId].max_weight)).toBe(30);
			expect(num(bySpecies[robinId].min_weight)).toBe(10);
			// Wren in-window: single 8/44.
			expect(num(bySpecies[wrenId].max_weight)).toBe(8);
			expect(num(bySpecies[wrenId].max_wing)).toBe(44);
		});

		it('returns one row per time period for each supported group_by_time_period grain (day, month, year, month-squashed)', async () => {
			// day: sparse spine — only the two Robin March days appear.
			const dayResult = await groupClient.rpc('stats_cache_biometrics_metrics', {
				ringing_group_filter: groupId,
				species_name_filter: 'Robin',
				from_date: `${yr}-03-01`,
				to_date: `${yr}-03-31`,
				group_by_time_period: 'day'
			});
			expect(dayResult.error).toBeNull();
			expect(dayResult.data).toHaveLength(2);
			const byDay = Object.fromEntries(
				dayResult.data!.map((row) => [row.time_period, row])
			);
			expect(num(byDay[marEarly].max_weight)).toBe(10);
			expect(num(byDay[marLate].max_weight)).toBe(20);

			// month: dense spine — March, April (empty), May.
			const monthResult = await groupClient.rpc(
				'stats_cache_biometrics_metrics',
				{
					ringing_group_filter: groupId,
					species_name_filter: 'Robin',
					from_date: `${yr}-03-01`,
					to_date: `${yr}-05-31`,
					group_by_time_period: 'month'
				}
			);
			expect(monthResult.error).toBeNull();
			expect(monthResult.data).toHaveLength(3);
			const byMonth = Object.fromEntries(
				monthResult.data!.map((row) => [row.time_period, row])
			);
			expect(num(byMonth[`${yr}-03-01`].max_weight)).toBe(20);
			expect(num(byMonth[`${yr}-03-01`].min_weight)).toBe(10);
			// April is empty -> all eight metric columns null (spine-driven).
			const april = byMonth[`${yr}-04-01`];
			expect(april.max_weight).toBeNull();
			expect(april.avg_weight).toBeNull();
			expect(april.min_weight).toBeNull();
			expect(april.median_weight).toBeNull();
			expect(april.max_wing).toBeNull();
			expect(april.avg_wing).toBeNull();
			expect(april.min_wing).toBeNull();
			expect(april.median_wing).toBeNull();
			expect(num(byMonth[`${yr}-05-01`].max_weight)).toBe(30);

			// year: one row per calendar year in range.
			const yearResult = await groupClient.rpc('stats_cache_biometrics_metrics', {
				ringing_group_filter: groupId,
				species_name_filter: 'Robin',
				from_date: `${yr}-01-01`,
				to_date: `${yr + 1}-12-31`,
				group_by_time_period: 'year'
			});
			expect(yearResult.error).toBeNull();
			expect(yearResult.data).toHaveLength(2);
			const byYear = Object.fromEntries(
				yearResult.data!.map((row) => [row.time_period, row])
			);
			expect(num(byYear[`${yr}-01-01`].max_weight)).toBe(30);
			expect(num(byYear[`${yr}-01-01`].min_weight)).toBe(10);
			expect(num(byYear[`${yr + 1}-01-01`].max_weight)).toBe(40);

			// month-squashed: always-12-row dense spine, independent of year.
			const squashedResult = await groupClient.rpc(
				'stats_cache_biometrics_metrics',
				{
					ringing_group_filter: groupId,
					species_name_filter: 'Robin',
					from_date: `${yr}-01-01`,
					to_date: `${yr + 1}-12-31`,
					group_by_time_period: 'month-squashed'
				}
			);
			expect(squashedResult.error).toBeNull();
			expect(squashedResult.data).toHaveLength(12);
			const bySquashedMonth = Object.fromEntries(
				squashedResult.data!.map((row) => [row.time_period, row])
			);
			// March squashes both years' March encounters together: 10/20 (yr) --
			// the dataset only has March encounters in yr, none in yr+1.
			expect(num(bySquashedMonth['2000-03-01'].max_weight)).toBe(20);
			expect(num(bySquashedMonth['2000-03-01'].min_weight)).toBe(10);
			// June holds only the yr+1 encounter (40).
			expect(num(bySquashedMonth['2000-06-01'].max_weight)).toBe(40);
		});
	});
});
