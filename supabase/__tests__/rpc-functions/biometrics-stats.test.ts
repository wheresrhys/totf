/**
 * Integration tests for the `biometrics_stats` Postgres RPC function (#822).
 *
 * A companion RPC to `aggregate_stats` carrying only the wing/weight summary
 * statistics (max/avg/min/median for both), sharing `aggregate_stats`' input
 * signature and reusing the `stats_raw_encounters` / `stats_spine` utility RPCs.
 * The eight metric columns and their rounding mirror `aggregate_stats.sql`'s
 * final SELECT exactly (ROUND(..., 1) for avg/median weight, ROUND(..., 0) for
 * median wing); MAX/AVG/MIN/PERCENTILE_CONT over an empty set is NULL (not 0), so
 * an empty cell yields NULLs for all eight columns.
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
		throw new Error(`Species "${speciesName}" not found — run npm run db:seed:e2e first`);
	return data.id;
}

describe('biometrics_stats', () => {
	// A single ungrouped dataset covering the metric maths, all three filters, and
	// the null/single/empty edges. Every row is Delta-owned (bar one Alpha row for
	// the ringing_group_filter case) and randomised per run so concurrent worktrees
	// against the shared local Supabase never collide.
	describe('ungrouped statistics and filtering', () => {
		let alphaId: number;
		let alphaClient: SupabaseClient;
		let deltaId: number;
		let deltaClient: SupabaseClient;

		const locationIds: number[] = [];
		const sessionIds: number[] = [];
		const birdIds: number[] = [];
		const alphaLocationIds: number[] = [];
		const alphaSessionIds: number[] = [];

		let base: string;
		// Named dates for readability in the assertions below.
		let d0: string, d1: string, d2: string, d3: string;
		let dNullWeight: string, dNullWing: string;
		let dEmpty: string;

		beforeAll(async () => {
			({ alphaId, alphaClient } = await resolveAlphaBetaGammaClients());
			deltaId = await getGroupIdByName('Delta');
			deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);

			const testSuffix = randomTestSuffix();
			base = randomFutureDate();
			d0 = addDays(base, 0);
			d1 = addDays(base, 1);
			d2 = addDays(base, 2);
			d3 = addDays(base, 3);
			dNullWeight = addDays(base, 4);
			dNullWing = addDays(base, 5);
			dEmpty = addDays(base, 20);

			const robinId = await getSpeciesId('Robin');
			const wrenId = await getSpeciesId('Wren');

			const { data: deltaLoc, error: dLocErr } = await deltaClient
				.from('Locations')
				.insert({ location_name: `Biometrics Delta Loc ${testSuffix}`, ringing_group_id: deltaId })
				.select('id')
				.single();
			if (dLocErr) throw dLocErr;
			locationIds.push(deltaLoc!.id);
			const deltaLocId = deltaLoc!.id;

			const { data: alphaLoc, error: aLocErr } = await alphaClient
				.from('Locations')
				.insert({ location_name: `Biometrics Alpha Loc ${testSuffix}`, ringing_group_id: alphaId })
				.select('id')
				.single();
			if (aLocErr) throw aLocErr;
			alphaLocationIds.push(alphaLoc!.id);
			const alphaLocId = alphaLoc!.id;

			const sessionCache = new Map<string, number>();
			async function getSession(
				client: SupabaseClient,
				date: string,
				locationId: number,
				track: number[]
			): Promise<number> {
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
			async function addBird(
				client: SupabaseClient,
				speciesId: number,
				date: string,
				locationId: number,
				sessionTrack: number[],
				weight: number | null,
				wing: number | null
			): Promise<void> {
				const { data: bird, error } = await client
					.from('Birds')
					.insert({ ring_no: `BIO-${testSuffix}-${ringCounter++}`, species_id: speciesId })
					.select('id')
					.single();
				if (error) throw error;
				birdIds.push(bird!.id);
				const sessionId = await getSession(client, date, locationId, sessionTrack);
				const { error: encErr } = await client.from('Encounters').insert({
					capture_time: '10:00:00',
					scheme: 'BTO',
					sex: 'M',
					session_id: sessionId,
					bird_id: bird!.id,
					age_code: 4,
					record_type: 'N',
					weight,
					wing_length: wing
				});
				if (encErr) throw encErr;
			}

			// Core Delta Robin set: weights 10/20/30/40, wings 50/60/70/80.
			await addBird(deltaClient, robinId, d0, deltaLocId, sessionIds, 10, 50);
			await addBird(deltaClient, robinId, d1, deltaLocId, sessionIds, 20, 60);
			await addBird(deltaClient, robinId, d2, deltaLocId, sessionIds, 30, 70);
			await addBird(deltaClient, robinId, d3, deltaLocId, sessionIds, 40, 80);
			// Null-column rows (each nulls exactly one of the two measurements).
			await addBird(deltaClient, robinId, dNullWeight, deltaLocId, sessionIds, null, 90);
			await addBird(deltaClient, robinId, dNullWing, deltaLocId, sessionIds, 15, null);
			// A Delta Wren on d0 for the species_name_filter case.
			await addBird(deltaClient, wrenId, d0, deltaLocId, sessionIds, 8, 44);
			// An Alpha Robin on d0 with an extreme weight for the ringing_group_filter case.
			await addBird(alphaClient, robinId, d0, alphaLocId, alphaSessionIds, 1000, 300);
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

		async function statsRow(args: Record<string, unknown>) {
			const { data, error } = await deltaClient.rpc('biometrics_stats', args);
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			return data![0];
		}

		// Usual
		it('returns max/avg/min/median weight and wing for a known set of encounters, ungrouped', async () => {
			const row = await statsRow({
				ringing_group_filter: deltaId,
				species_name_filter: 'Robin',
				from_date: d0,
				to_date: d3
			});
			expect(num(row.max_weight)).toBe(40);
			expect(num(row.avg_weight)).toBeCloseTo(25, 1);
			expect(num(row.min_weight)).toBe(10);
			expect(num(row.median_weight)).toBeCloseTo(25, 1);
			expect(num(row.max_wing)).toBe(80);
			expect(num(row.avg_wing)).toBeCloseTo(65, 1);
			expect(num(row.min_wing)).toBe(50);
			expect(num(row.median_wing)).toBeCloseTo(65, 0);
		});

		it('filters by ringing_group_filter so another group\'s encounters do not affect the stats', async () => {
			const deltaRow = await statsRow({
				ringing_group_filter: deltaId,
				species_name_filter: 'Robin',
				from_date: d0,
				to_date: d3
			});
			// The Alpha Robin's weight of 1000 on d0 must not leak into Delta's stats.
			expect(num(deltaRow.max_weight)).toBe(40);
			expect(num(deltaRow.max_wing)).toBe(80);

			// Sanity: the Alpha row does exist and carries the extreme value.
			const { data: alphaData, error: alphaErr } = await alphaClient.rpc('biometrics_stats', {
				ringing_group_filter: alphaId,
				species_name_filter: 'Robin',
				from_date: d0,
				to_date: d0
			});
			expect(alphaErr).toBeNull();
			expect(num(alphaData![0].max_weight)).toBe(1000);
		});

		it('filters by from_date/to_date so out-of-window encounters are excluded', async () => {
			// A narrower window covering only the first two encounters (10/20, 50/60).
			const row = await statsRow({
				ringing_group_filter: deltaId,
				species_name_filter: 'Robin',
				from_date: d0,
				to_date: d1
			});
			expect(num(row.max_weight)).toBe(20);
			expect(num(row.min_weight)).toBe(10);
			expect(num(row.avg_weight)).toBeCloseTo(15, 1);
			expect(num(row.max_wing)).toBe(60);
			expect(num(row.min_wing)).toBe(50);
		});

		it('filters by species_name_filter so only the named species\' encounters are included', async () => {
			// d0 holds a Delta Robin (10/50), a Delta Wren (8/44) and an Alpha Robin
			// (1000/300); filtering to Wren must isolate the single Wren encounter.
			const row = await statsRow({
				ringing_group_filter: deltaId,
				species_name_filter: 'Wren',
				from_date: d0,
				to_date: d0
			});
			expect(num(row.max_weight)).toBe(8);
			expect(num(row.min_weight)).toBe(8);
			expect(num(row.max_wing)).toBe(44);
		});

		// Edge
		it('a cell with exactly one encounter returns that encounter\'s weight/wing as max = avg = min = median', async () => {
			const row = await statsRow({
				ringing_group_filter: deltaId,
				species_name_filter: 'Robin',
				from_date: d3,
				to_date: d3
			});
			expect(num(row.max_weight)).toBe(40);
			expect(num(row.avg_weight)).toBeCloseTo(40, 1);
			expect(num(row.min_weight)).toBe(40);
			expect(num(row.median_weight)).toBeCloseTo(40, 1);
			expect(num(row.max_wing)).toBe(80);
			expect(num(row.avg_wing)).toBeCloseTo(80, 1);
			expect(num(row.min_wing)).toBe(80);
			expect(num(row.median_wing)).toBeCloseTo(80, 0);
		});

		it('a NULL weight or wing_length is excluded from that column\'s aggregate but does not null the other column', async () => {
			// dNullWeight: weight NULL, wing 90; dNullWing: weight 15, wing NULL.
			const row = await statsRow({
				ringing_group_filter: deltaId,
				species_name_filter: 'Robin',
				from_date: dNullWeight,
				to_date: dNullWing
			});
			// weight aggregate sees only {15}; wing aggregate sees only {90}.
			expect(num(row.max_weight)).toBe(15);
			expect(num(row.min_weight)).toBe(15);
			expect(num(row.avg_weight)).toBeCloseTo(15, 1);
			expect(num(row.median_weight)).toBeCloseTo(15, 1);
			expect(num(row.max_wing)).toBe(90);
			expect(num(row.min_wing)).toBe(90);
			expect(num(row.avg_wing)).toBeCloseTo(90, 1);
			expect(num(row.median_wing)).toBeCloseTo(90, 0);
		});

		it('an even number of encounters produces the interpolated PERCENTILE_CONT(0.5) weight median, not a raw value', async () => {
			const row = await statsRow({
				ringing_group_filter: deltaId,
				species_name_filter: 'Robin',
				from_date: d0,
				to_date: d3
			});
			// Median of {10,20,30,40} interpolates to 25 — not one of the four raw weights.
			expect(num(row.median_weight)).toBeCloseTo(25, 1);
			expect([10, 20, 30, 40]).not.toContain(num(row.median_weight));
		});

		it('a completely empty result set still returns a single ungrouped row of nulls', async () => {
			const row = await statsRow({
				ringing_group_filter: deltaId,
				species_name_filter: 'Robin',
				from_date: dEmpty,
				to_date: dEmpty
			});
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

	// Grouping variants share one dataset spread over two calendar years, two months
	// with a gap month between them, and two species, so each grouping mode can be
	// asserted against a known shape.
	describe('grouping variants', () => {
		let deltaId: number;
		let deltaClient: SupabaseClient;

		const locationIds: number[] = [];
		const sessionIds: number[] = [];
		const birdIds: number[] = [];

		let yr: number;
		// Windows/dates derived from a random future year for isolation.
		let marEarly: string, marLate: string, may: string, nextJun: string, wrenMar: string;

		beforeAll(async () => {
			deltaId = await getGroupIdByName('Delta');
			deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);

			const testSuffix = randomTestSuffix();
			yr = 2080 + Math.floor(Math.random() * 18); // 2080–2097, leaves room for yr+1
			marEarly = `${yr}-03-10`;
			marLate = `${yr}-03-20`;
			may = `${yr}-05-10`;
			nextJun = `${yr + 1}-06-10`;
			wrenMar = `${yr}-03-15`;

			const robinId = await getSpeciesId('Robin');
			const wrenId = await getSpeciesId('Wren');

			const { data: loc, error: locErr } = await deltaClient
				.from('Locations')
				.insert({ location_name: `Biometrics Grouping Loc ${testSuffix}`, ringing_group_id: deltaId })
				.select('id')
				.single();
			if (locErr) throw locErr;
			locationIds.push(loc!.id);
			const locationId = loc!.id;

			const sessionCache = new Map<string, number>();
			async function getSession(date: string): Promise<number> {
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
				speciesId: number,
				date: string,
				weight: number,
				wing: number
			): Promise<void> {
				const { data: bird, error } = await deltaClient
					.from('Birds')
					.insert({ ring_no: `BIOGRP-${testSuffix}-${ringCounter++}`, species_id: speciesId })
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
					age_code: 4,
					record_type: 'N',
					weight,
					wing_length: wing
				});
				if (encErr) throw encErr;
			}

			// Robin: two March encounters, one May, one the following June.
			await addBird(robinId, marEarly, 10, 50);
			await addBird(robinId, marLate, 20, 60);
			await addBird(robinId, may, 30, 70);
			await addBird(robinId, nextJun, 40, 80);
			// Wren: one March encounter (for the species grouping cases).
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
		});

		// Structure
		it('group_by_time_period=day returns one row per distinct session day', async () => {
			const { data, error } = await deltaClient.rpc('biometrics_stats', {
				ringing_group_filter: deltaId,
				species_name_filter: 'Robin',
				from_date: `${yr}-03-01`,
				to_date: `${yr}-03-31`,
				group_by_time_period: 'day'
			});
			expect(error).toBeNull();
			// Sparse day spine: only the two Robin March days appear.
			expect(data).toHaveLength(2);
			const byDay = Object.fromEntries(data!.map((r) => [r.time_period, r]));
			expect(num(byDay[marEarly].max_weight)).toBe(10);
			expect(num(byDay[marLate].max_weight)).toBe(20);
		});

		it('group_by_time_period=month returns one row per calendar month in range, including empty months', async () => {
			const { data, error } = await deltaClient.rpc('biometrics_stats', {
				ringing_group_filter: deltaId,
				species_name_filter: 'Robin',
				from_date: `${yr}-03-01`,
				to_date: `${yr}-05-31`,
				group_by_time_period: 'month'
			});
			expect(error).toBeNull();
			// Dense month spine: March, April (empty), May.
			expect(data).toHaveLength(3);
			const byMonth = Object.fromEntries(data!.map((r) => [r.time_period, r]));
			// March holds both 10 and 20.
			expect(num(byMonth[`${yr}-03-01`].max_weight)).toBe(20);
			expect(num(byMonth[`${yr}-03-01`].min_weight)).toBe(10);
			expect(num(byMonth[`${yr}-03-01`].avg_weight)).toBeCloseTo(15, 1);
			// April is empty → all eight metric columns null (spine-driven).
			const april = byMonth[`${yr}-04-01`];
			expect(april.max_weight).toBeNull();
			expect(april.avg_weight).toBeNull();
			expect(april.min_weight).toBeNull();
			expect(april.median_weight).toBeNull();
			expect(april.max_wing).toBeNull();
			expect(april.avg_wing).toBeNull();
			expect(april.min_wing).toBeNull();
			expect(april.median_wing).toBeNull();
			// May holds the single 30.
			expect(num(byMonth[`${yr}-05-01`].max_weight)).toBe(30);
		});

		it('group_by_time_period=year returns one row per calendar year in range', async () => {
			const { data, error } = await deltaClient.rpc('biometrics_stats', {
				ringing_group_filter: deltaId,
				species_name_filter: 'Robin',
				from_date: `${yr}-01-01`,
				to_date: `${yr + 1}-12-31`,
				group_by_time_period: 'year'
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(2);
			const byYear = Object.fromEntries(data!.map((r) => [r.time_period, r]));
			// yr: 10/20/30 → max 30, min 10, avg 20.
			expect(num(byYear[`${yr}-01-01`].max_weight)).toBe(30);
			expect(num(byYear[`${yr}-01-01`].min_weight)).toBe(10);
			expect(num(byYear[`${yr}-01-01`].avg_weight)).toBeCloseTo(20, 1);
			// yr+1: the single 40.
			expect(num(byYear[`${yr + 1}-01-01`].max_weight)).toBe(40);
		});

		it('group_by_species=true returns one row per species, each with its own weight/wing stats', async () => {
			const { data, error } = await deltaClient.rpc('biometrics_stats', {
				ringing_group_filter: deltaId,
				from_date: `${yr}-03-01`,
				to_date: `${yr}-05-31`,
				group_by_species: true
			});
			expect(error).toBeNull();
			const bySpecies = Object.fromEntries(data!.map((r) => [r.species_name, r]));
			// Robin in-window: 10/20/30 → max 30, min 10.
			expect(num(bySpecies['Robin'].max_weight)).toBe(30);
			expect(num(bySpecies['Robin'].min_weight)).toBe(10);
			// Wren in-window: single 8/44.
			expect(num(bySpecies['Wren'].max_weight)).toBe(8);
			expect(num(bySpecies['Wren'].max_wing)).toBe(44);
		});

		it('group_by_species and group_by_time_period together return one row per (species, period) cell', async () => {
			const { data, error } = await deltaClient.rpc('biometrics_stats', {
				ringing_group_filter: deltaId,
				from_date: `${yr}-03-01`,
				to_date: `${yr}-05-31`,
				group_by_species: true,
				group_by_time_period: 'month'
			});
			expect(error).toBeNull();
			// 2 species × 3 dense months (Mar/Apr/May) = 6 cells.
			expect(data).toHaveLength(6);
			const cell = (species: string, month: string) =>
				data!.find((r) => r.species_name === species && r.time_period === month)!;
			// Robin/March holds 10 and 20.
			expect(num(cell('Robin', `${yr}-03-01`).max_weight)).toBe(20);
			expect(num(cell('Robin', `${yr}-03-01`).min_weight)).toBe(10);
			// Wren/March holds the single 8.
			expect(num(cell('Wren', `${yr}-03-01`).max_weight)).toBe(8);
			// Wren/April is an empty cell → null metrics.
			expect(cell('Wren', `${yr}-04-01`).max_weight).toBeNull();
		});
	});
});
