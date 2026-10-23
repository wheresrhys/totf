/**
 * Integration tests for the shared stats utility RPCs `stats_raw_encounters` and
 * `stats_spine` (#800), covering the resighting/field-observation exclusion added
 * in #874. This is the actual fix point — aggregate_stats, population_stats and
 * biometrics_stats all inherit the exclusion from here — so it gets direct coverage,
 * with thin confirming assertions in each consumer suite.
 *
 * - stats_raw_encounters excludes any Encounters row whose record_type is a
 *   resighting type (public.resighting_record_type: U/F/D) via the LEFT JOIN's ON
 *   clause, preserving NULL-preserving semantics (a bird with only resightings still
 *   appears with encounter_id IS NULL rather than vanishing).
 * - stats_spine's session_date_range bounds the month/year spine by every session
 *   date in the window. It used to exclude FIELD_OBSERVATION sessions; that
 *   exclusion was dropped in #1021 and the session_type column itself in #1024,
 *   leaving stats_raw_encounters' row-level resighting-record_type filter as the
 *   single fix point for passive data.
 * - stats_spine's month-squashed branch emits one unconditional cell per calendar
 *   month, narrowed to a single cell by month_filter (#1178) — a squashed cell is
 *   exactly what month_filter alone selects, which is what lets
 *   refreshSimpleStatsCache narrow this temporal unit by touched calendar month.
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
import {
	insertTestLocation,
	insertTestSession,
	insertTestBird,
	insertTestEncounter
} from './helpers/encounter-fixtures';

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

describe('stats_raw_encounters — resighting exclusion', () => {
	let deltaId: number;
	let deltaClient: SupabaseClient;

	const locationIds: number[] = [];
	const sessionIds: number[] = [];
	const birdIds: number[] = [];

	const suffix = randomTestSuffix();
	// Ring numbers are globally unique, so we can .eq('ring_no', ...) each RPC call
	// down to a single bird's rows regardless of what else is in the shared table.
	const mixedRing = `RSE-MIX-${suffix}`;
	const resightOnlyRing = `RSE-RES-${suffix}`;

	let normalEncounterId: number;
	let resightingEncounterId: number;

	beforeAll(async () => {
		deltaId = await getGroupIdByName('Delta');
		deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);

		const robinId = await getSpeciesId('Robin');
		const wrenId = await getSpeciesId('Wren');

		const base = randomFutureDate();
		const dNormal = addDays(base, 0);
		const dResight = addDays(base, 1);
		const dResightOnly = addDays(base, 2);

		const locationId = await insertTestLocation(
			deltaClient,
			deltaId,
			`RawEnc Loc ${suffix}`
		);
		locationIds.push(locationId);

		async function makeSession(date: string): Promise<number> {
			const sessionId = await insertTestSession(deltaClient, locationId, date);
			sessionIds.push(sessionId);
			return sessionId;
		}

		async function makeBird(ring: string, speciesId: number): Promise<number> {
			const birdId = await insertTestBird(deltaClient, ring, speciesId);
			birdIds.push(birdId);
			return birdId;
		}

		function makeEncounter(
			birdId: number,
			sessionId: number,
			recordType: string
		): Promise<number> {
			return insertTestEncounter(deltaClient, birdId, sessionId, {
				age_code: 4,
				record_type: recordType,
				weight: 10,
				wing_length: 50
			});
		}

		// mixedBird: one normal 'N' capture and one resighting 'F' for the same bird.
		const mixedBird = await makeBird(mixedRing, robinId);
		normalEncounterId = await makeEncounter(
			mixedBird,
			await makeSession(dNormal),
			'N'
		);
		resightingEncounterId = await makeEncounter(
			mixedBird,
			await makeSession(dResight),
			'F'
		);

		// resightOnlyBird: its only encounter is a resighting 'U'.
		const resightOnlyBird = await makeBird(resightOnlyRing, wrenId);
		await makeEncounter(resightOnlyBird, await makeSession(dResightOnly), 'U');
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
	it('excludes an encounter whose record_type is U/F/D from the result', async () => {
		const { data, error } = await deltaClient
			.rpc('stats_raw_encounters', {})
			.eq('ring_no', mixedRing);
		expect(error).toBeNull();
		// The resighting 'F' encounter must not appear as a row at all.
		expect(data!.some((r) => r.encounter_id === resightingEncounterId)).toBe(
			false
		);
		expect(
			data!.some((r) => ['U', 'F', 'D'].includes(r.record_type as string))
		).toBe(false);
	});

	// Edge — LEFT JOIN semantics preserved
	it('still returns a species/bird with zero non-resighting encounters (encounter_id IS NULL row), not dropped entirely', async () => {
		const { data, error } = await deltaClient
			.rpc('stats_raw_encounters', {})
			.eq('ring_no', resightOnlyRing);
		expect(error).toBeNull();
		// The bird still surfaces exactly once, with its (excluded) resighting
		// leaving encounter_id NULL rather than dropping the bird from the result.
		expect(data).toHaveLength(1);
		expect(data![0].ring_no).toBe(resightOnlyRing);
		expect(data![0].encounter_id).toBeNull();
	});

	// Structure — mixed row set
	it('includes a normal capture record_type (e.g. N or C) alongside an excluded resighting for the same bird', async () => {
		const { data, error } = await deltaClient
			.rpc('stats_raw_encounters', {})
			.eq('ring_no', mixedRing);
		expect(error).toBeNull();
		// Exactly the one normal capture survives; the resighting is gone.
		expect(data).toHaveLength(1);
		expect(data![0].encounter_id).toBe(normalEncounterId);
		expect(data![0].record_type).toBe('N');
	});
});

describe('stats_spine — session date range spans every session date', () => {
	let deltaId: number;
	let deltaClient: SupabaseClient;

	const locationIds: number[] = [];
	const sessionIds: number[] = [];

	// Two independent years so the two windows never overlap each other's sessions.
	// session_date_range is not group-filtered, so tight per-year windows are what
	// isolate each assertion from the rest of the shared Sessions table.
	const yrMixed = 2080 + Math.floor(Math.random() * 18); // 2080–2097
	const yrShared = yrMixed + 1;

	const earlyDate = `${yrMixed}-03-15`;
	const lateDate = `${yrMixed}-09-15`;
	const sharedDate = `${yrShared}-06-10`;

	// Set by beforeAll: the two ids `insertTestSession` returned for the same
	// group-day, asserted on below.
	let firstSharedDateSessionId: number;
	let secondSharedDateSessionId: number;

	beforeAll(async () => {
		deltaId = await getGroupIdByName('Delta');
		deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);

		const suffix = randomTestSuffix();
		const locationId = await insertTestLocation(
			deltaClient,
			deltaId,
			`Spine Loc ${suffix}`
		);
		locationIds.push(locationId);
		const secondLocationId = await insertTestLocation(
			deltaClient,
			deltaId,
			`Spine Loc 2 ${suffix}`
		);
		locationIds.push(secondLocationId);

		async function makeSession(
			date: string,
			atLocationId = locationId
		): Promise<number> {
			const sessionId = await insertTestSession(
				deltaClient,
				atLocationId,
				date
			);
			sessionIds.push(sessionId);
			return sessionId;
		}

		// Two sessions a year apart from each other's bounds: March and September,
		// the later of the two alone deciding max_date. These used to be a
		// FULL_GROWN and a FIELD_OBSERVATION session respectively, to show that a
		// non-FULL_GROWN session bounds the spine like any other (#1021); with
		// session_type gone entirely (#1024) they are simply two session dates.
		await makeSession(earlyDate);
		await makeSession(lateDate);

		// Shared-date year: two visits to two different locations on one date.
		// Before #1024 that was two Sessions rows (the unique key included
		// location_id and session_type); it is now one.
		firstSharedDateSessionId = await makeSession(sharedDate);
		secondSharedDateSessionId = await makeSession(sharedDate, secondLocationId);
	});

	afterAll(() => {
		execSync(
			`psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c '` +
				`DELETE FROM "Sessions" WHERE id IN (${sessionIds.join(', ')});` +
				`DELETE FROM "Locations" WHERE id IN (${locationIds.join(', ')});'`
		);
	});

	// Usual — the outermost session dates bound the spine, densely filled between
	it('the latest session date extends the month spine out to its own month', async () => {
		const { data, error } = await deltaClient.rpc('stats_spine', {
			ringing_group_filter: deltaId,
			from_date: `${yrMixed}-01-01`,
			to_date: `${yrMixed}-12-31`,
			group_by_time_period: 'month'
		});
		expect(error).toBeNull();
		const months = data!.map((r) => r.time_period);
		// March is min_date and September max_date, so the dense month spine covers
		// every month between the two.
		expect(months).toContain(`${yrMixed}-03-01`);
		expect(months).toContain(`${yrMixed}-09-01`);
		// Dense between the bounds, and nothing outside them.
		expect(months).toContain(`${yrMixed}-06-01`);
		expect(months).not.toContain(`${yrMixed}-01-01`);
		expect(months).not.toContain(`${yrMixed}-10-01`);
	});

	// Edge — a group-day is one session however many locations it covers
	it('two visits to different locations on one date resolve to a single Session row', () => {
		expect(secondSharedDateSessionId).toBe(firstSharedDateSessionId);
	});

	it('a date visited twice appears in the spine exactly once', async () => {
		const { data, error } = await deltaClient.rpc('stats_spine', {
			ringing_group_filter: deltaId,
			from_date: `${yrShared}-06-01`,
			to_date: `${yrShared}-06-30`,
			group_by_time_period: 'month'
		});
		expect(error).toBeNull();
		const months = data!.map((r) => r.time_period);
		expect(months).toEqual([`${yrShared}-06-01`]);
	});
});

describe("stats_spine's month-squashed branch", () => {
	let deltaId: number;
	let deltaClient: SupabaseClient;

	const locationIds: number[] = [];
	const sessionIds: number[] = [];
	const birdIds: number[] = [];

	const suffix = randomTestSuffix();

	// One calendar month, two well-separated years — the squash-across-years
	// shape this branch exists for. Deliberately 2110+ rather than the
	// 2080-2099 band every other integration suite randomises within
	// (`test-isolation.ts`'s `randomFutureDate`, `stats-month-squashed.test.ts`,
	// the describe block above): this block's day-branch assertion is exact, and
	// a concurrently-running Delta/Robin fixture landing in the same calendar
	// month would add days to it. Still far outside the e2e seed data's
	// 2021-2024 range.
	const targetMonth = 1 + Math.floor(Math.random() * 12);
	const monthStr = String(targetMonth).padStart(2, '0');
	const squashedCellDate = `2000-${monthStr}-01`;
	const firstYear = 2110 + Math.floor(Math.random() * 10); // 2110-2119
	const secondYear = firstYear + 5 + Math.floor(Math.random() * 5);

	/**
	 * Every call below pins `species_name_filter` to one species, which is what
	 * makes these assertions exact: the month-squashed period spine is
	 * unconditional (it never reads session data), so the species set is the
	 * only thing a concurrently-running worktree's rows could perturb — and
	 * `DISTINCT species_id` over a single pinned species can't be perturbed at
	 * all. The window then keeps the group's own 2021-2024 seed rows out.
	 */
	const SPECIES_NAME = 'Robin';

	function spineParams(overrides: Record<string, unknown>) {
		return {
			ringing_group_filter: deltaId,
			species_name_filter: SPECIES_NAME,
			group_by_species: true,
			from_date: `${firstYear}-01-01`,
			to_date: `${secondYear}-12-31`,
			...overrides
		};
	}

	beforeAll(async () => {
		deltaId = await getGroupIdByName('Delta');
		deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);

		const robinId = await getSpeciesId(SPECIES_NAME);

		const locationId = await insertTestLocation(
			deltaClient,
			deltaId,
			`Squashed Spine Loc ${suffix}`
		);
		locationIds.push(locationId);

		// The same calendar month in two different years, so the squashed cell
		// genuinely has to collapse two years' worth of data into one row.
		let birdIndex = 0;
		for (const year of [firstYear, secondYear]) {
			const sessionId = await insertTestSession(
				deltaClient,
				locationId,
				`${year}-${monthStr}-15`
			);
			sessionIds.push(sessionId);

			const birdId = await insertTestBird(
				deltaClient,
				`SPINE-SQ-${suffix}-${birdIndex++}`,
				robinId
			);
			birdIds.push(birdId);

			await insertTestEncounter(deltaClient, birdId, sessionId, {
				age_code: 4,
				record_type: 'N',
				weight: 18,
				wing_length: 70
			});
		}
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

	// Usual — the existing, unaffected caller's shape (fetchCombinedMonthTotals)
	it('returns all 12 calendar months when month_filter is NULL', async () => {
		const { data, error } = await deltaClient.rpc(
			'stats_spine',
			spineParams({ group_by_time_period: 'month-squashed' })
		);
		expect(error).toBeNull();
		expect(data!.map((r) => r.time_period).sort()).toEqual(
			Array.from(
				{ length: 12 },
				(_, index) => `2000-${String(index + 1).padStart(2, '0')}-01`
			)
		);
	});

	// Edge — the whole point of the month_filter guard (#1178)
	it("returns exactly one calendar month's cell when month_filter is set, with no spurious rows for the other 11", async () => {
		const { data, error } = await deltaClient.rpc(
			'stats_spine',
			spineParams({
				group_by_time_period: 'month-squashed',
				month_filter: targetMonth
			})
		);
		expect(error).toBeNull();
		expect(data!.map((r) => r.time_period)).toEqual([squashedCellDate]);
	});

	// Usual — two years of the same calendar month collapse to one cell
	it('squashes data from every year into that one cell, matching the unfiltered result for that month exactly', async () => {
		const { data: narrowed } = await deltaClient.rpc(
			'stats_spine',
			spineParams({
				group_by_time_period: 'month-squashed',
				month_filter: targetMonth
			})
		);
		const { data: unfiltered } = await deltaClient.rpc(
			'stats_spine',
			spineParams({ group_by_time_period: 'month-squashed' })
		);

		// Two years of data, still a single cell — not one per year.
		expect(narrowed).toHaveLength(1);
		expect(narrowed).toEqual(
			unfiltered!.filter((r) => r.time_period === squashedCellDate)
		);
	});

	// Structure — the guard must not leak into the other branches
	it("is unaffected by month_filter when group_by_time_period is not 'month-squashed'", async () => {
		const { data: monthCells, error: monthError } = await deltaClient.rpc(
			'stats_spine',
			spineParams({ group_by_time_period: 'month', month_filter: targetMonth })
		);
		expect(monthError).toBeNull();
		const monthPeriods = monthCells!.map((r) => r.time_period);
		// The month branch is bounded by session_date_range, which applies
		// month_filter itself — so it still spans the real years' own cells
		// (densely between min and max, per that CTE's own comment) rather than
		// collapsing onto the squashed branch's 2000-<mm>-01 sentinel.
		expect(monthPeriods).toContain(`${firstYear}-${monthStr}-01`);
		expect(monthPeriods).toContain(`${secondYear}-${monthStr}-01`);
		expect(monthPeriods).not.toContain(squashedCellDate);

		const { data: dayCells, error: dayError } = await deltaClient.rpc(
			'stats_spine',
			spineParams({ group_by_time_period: 'day', month_filter: targetMonth })
		);
		expect(dayError).toBeNull();
		// The day branch is sparse and driven off raw_encounters' own
		// month_filter-ed rows, so it is exactly this fixture's two dates.
		expect(dayCells!.map((r) => r.time_period).sort()).toEqual([
			`${firstYear}-${monthStr}-15`,
			`${secondYear}-${monthStr}-15`
		]);
	});
});

describe('stats_raw_encounters/stats_spine — no filters supplied', () => {
	let deltaId: number;
	let deltaClient: SupabaseClient;

	const locationIds: number[] = [];
	const sessionIds: number[] = [];
	const birdIds: number[] = [];

	const suffix = randomTestSuffix();
	const resightRing = `RSE-NULL-${suffix}`;
	let resightingEncounterId: number;

	beforeAll(async () => {
		deltaId = await getGroupIdByName('Delta');
		deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);

		const robinId = await getSpeciesId('Robin');
		const date = randomFutureDate();

		const locationId = await insertTestLocation(
			deltaClient,
			deltaId,
			`NullFilter Loc ${suffix}`
		);
		locationIds.push(locationId);

		const sessionId = await insertTestSession(deltaClient, locationId, date);
		sessionIds.push(sessionId);

		const birdId = await insertTestBird(deltaClient, resightRing, robinId);
		birdIds.push(birdId);

		resightingEncounterId = await insertTestEncounter(
			deltaClient,
			birdId,
			sessionId,
			{
				age_code: 4,
				record_type: 'D',
				weight: 10,
				wing_length: 50
			}
		);
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
	it('from_date/to_date/species/ringing_group all NULL still excludes resighting rows for the whole table', async () => {
		const { data, error } = await deltaClient
			.rpc('stats_raw_encounters', {})
			.eq('ring_no', resightRing);
		expect(error).toBeNull();
		// Even with no filters, the 'D' resighting encounter never surfaces; the bird
		// remains as a single encounter_id IS NULL row.
		expect(data).toHaveLength(1);
		expect(data![0].encounter_id).toBeNull();
		expect(data!.some((r) => r.encounter_id === resightingEncounterId)).toBe(
			false
		);
	});
});
