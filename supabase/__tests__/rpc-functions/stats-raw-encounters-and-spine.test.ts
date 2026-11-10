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
 * - stats_spine's (species × period) cross join has one exception, added in
 *   #1385: group_by_species together with group_by_time_period = 'day' is sparse
 *   on BOTH axes, emitting a cell only for the (species, session day) pairs a
 *   species was actually encountered in-hand on. See the "sparse species×day
 *   spine" / "every other parameterisation is unchanged" / "day-grain consumers"
 *   describe blocks at the bottom of this file.
 * - stats_spine's session_date_range CTE now scopes by ringing_group_filter, like
 *   every sibling CTE in this RPC family — see the "session_date_range cross-group
 *   scoping" describe block below, covering the fix for the prod statement-timeout
 *   root cause where month/year refreshes scanned every ringing group's Sessions
 *   rows system-wide.
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
	// session_date_range is scoped by ringing_group_filter (see the
	// "session_date_range cross-group scoping" describe block below), but tight
	// per-year windows are still what isolate each assertion from Delta's own
	// concurrently-running test fixtures in the shared Sessions table.
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

describe('stats_spine', () => {
	describe('session_date_range cross-group scoping', () => {
		// Two throwaway groups rather than the shared seed groups: the bug this
		// guards (missing `ringing_group_filter` scoping on session_date_range)
		// is only observable through a client that can see MORE THAN ONE group's
		// Sessions rows at once — Delta/Gamma/etc have no sharing relationship
		// with each other, so RLS alone would already hide cross-group rows
		// regardless of whether the SQL fix is in place. A GroupDataSharing grant
		// between two isolated groups reproduces the one real scenario where RLS
		// legitimately exposes multiple groups' Sessions to the same caller —
		// matching core_stats'/stats_raw_encounters' own
		// `ringing_group_filter`-scoping rationale (narrowing to exactly the
		// group the caller asked for, not merely "whatever RLS lets through").
		const suffix = randomTestSuffix();
		let targetGroupId: number;
		let otherGroupId: number;
		let targetClient: SupabaseClient;
		let otherClient: SupabaseClient;

		const locationIds: number[] = [];
		const sessionIds: number[] = [];

		// A single shared year: targetGroup's own session sits in March,
		// otherGroup's (RLS-visible, but not the requested group) sits in June —
		// both inside the same calendar year, so a from_date/to_date window
		// spanning the year catches both, and year_filter alone catches both too.
		const yr = 2080 + Math.floor(Math.random() * 18); // 2080-2097
		const targetMonth = `${yr}-03-15`;
		const otherMonth = `${yr}-06-10`;

		beforeAll(async () => {
			targetGroupId = createIsolatedGroup(`SpineScope Target ${suffix}`);
			otherGroupId = createIsolatedGroup(`SpineScope Other ${suffix}`);
			[targetClient, otherClient] = await Promise.all([
				getAuthenticatedSupabaseClientForGroup(targetGroupId),
				getAuthenticatedSupabaseClientForGroup(otherGroupId)
			]);

			// otherGroup grants targetGroup read access to its own rows — so
			// targetGroup's authenticated client legitimately sees BOTH its own
			// Sessions AND otherGroup's under RLS, and the explicit
			// ringing_group_filter condition in the SQL is the only thing left to
			// narrow session_date_range down to exactly the group the caller asked
			// for.
			psql(
				`INSERT INTO "GroupDataSharing" (granter_group_id, recipient_group_id) VALUES (${otherGroupId}, ${targetGroupId});`
			);

			const targetLocationId = await insertTestLocation(
				targetClient,
				targetGroupId,
				`SpineScope Target Loc ${suffix}`
			);
			locationIds.push(targetLocationId);
			sessionIds.push(
				await insertTestSession(targetClient, targetLocationId, targetMonth)
			);

			const otherLocationId = await insertTestLocation(
				otherClient,
				otherGroupId,
				`SpineScope Other Loc ${suffix}`
			);
			locationIds.push(otherLocationId);
			sessionIds.push(
				await insertTestSession(otherClient, otherLocationId, otherMonth)
			);
		});

		afterAll(() => {
			psql(
				`DELETE FROM "Sessions" WHERE id IN (${sessionIds.join(', ')});` +
					`DELETE FROM "Locations" WHERE id IN (${locationIds.join(', ')});` +
					`DELETE FROM "GroupDataSharing" WHERE granter_group_id = ${otherGroupId} AND recipient_group_id = ${targetGroupId};` +
					`DELETE FROM "RingingGroups" WHERE id IN (${targetGroupId}, ${otherGroupId});`
			);
		});

		// Usual — the exact shape refreshSimpleStatsCache's month/year
		// exact-filter fan-out calls with: year_filter/month_filter set, no
		// from_date/to_date at all.
		it("excludes another RLS-visible group's Sessions from session_date_range bounds when only year_filter/month_filter narrow the query", async () => {
			const { data, error } = await targetClient.rpc('stats_spine', {
				ringing_group_filter: targetGroupId,
				year_filter: yr,
				month_filter: 6,
				group_by_time_period: 'month'
			});
			expect(error).toBeNull();
			// otherGroup's June session matches year_filter/month_filter and is
			// visible to targetClient via the GroupDataSharing grant — if
			// session_date_range weren't scoped by ringing_group_filter, it would
			// shift min/max to June and produce a spurious cell. targetGroup
			// itself has no session this month, so the correctly-scoped spine
			// must be empty.
			expect(data).toEqual([]);
		});

		// Edge — guards the from_date/to_date-windowed callers (the shape the
		// `day` unit's own refresh and every pre-existing month/year caller use)
		// don't regress: the group filter must still compose (AND) correctly
		// with an explicit date window, rather than only working when
		// from_date/to_date are absent.
		it("bounds the spine to only the target group's own Sessions when from_date/to_date are set alongside the group filter", async () => {
			const { data, error } = await targetClient.rpc('stats_spine', {
				ringing_group_filter: targetGroupId,
				from_date: `${yr}-01-01`,
				to_date: `${yr}-12-31`,
				group_by_time_period: 'month'
			});
			expect(error).toBeNull();
			const months = data!.map((r) => r.time_period);
			// Both groups' sessions fall inside this from_date/to_date window, and
			// otherGroup's June session is still RLS-visible to targetClient — but
			// only targetGroup's own March session may bound the spine. An
			// unscoped CTE would produce a dense March-through-June run (4 cells);
			// the fix produces exactly one.
			expect(months).toEqual([`${yr}-03-01`]);
		});
	});
});

/**
 * A throwaway group plus the Locations/Sessions/Birds/Encounters bookkeeping the
 * three #1385 describe blocks below all need, with one `cleanup()` that tears
 * the whole lot down in FK order. An isolated group per describe (rather than a
 * window into shared Delta) is what makes these assertions exact: every call
 * below passes `ringing_group_filter`, so no concurrently-running worktree's
 * rows can perturb a cell set.
 */
async function createSpineFixtureGroup(groupLabel: string) {
	const groupId = createIsolatedGroup(groupLabel);
	const client = await getAuthenticatedSupabaseClientForGroup(groupId);
	const locationId = await insertTestLocation(
		client,
		groupId,
		`${groupLabel} Loc`
	);
	const sessionIds: number[] = [];
	const birdIds: number[] = [];

	return {
		groupId,
		client,
		async addSession(visitDate: string): Promise<number> {
			const sessionId = await insertTestSession(client, locationId, visitDate);
			sessionIds.push(sessionId);
			return sessionId;
		},
		/**
		 * One bird of `speciesId`, caught once in each of `sessionsCaughtIn`.
		 * `recordType` is what separates in-hand data from a resighting the spine
		 * must ignore ('U'/'F'/'D'); `age_code: 4` puts every encounter in the
		 * adult bucket, which is what lets the day-grain consumer block assert a
		 * non-zero adult count per metric group.
		 */
		async addBird(
			ringNo: string,
			speciesId: number,
			sessionsCaughtIn: number[],
			recordType = 'N'
		): Promise<number> {
			const birdId = await insertTestBird(client, ringNo, speciesId);
			birdIds.push(birdId);
			for (const sessionId of sessionsCaughtIn) {
				await insertTestEncounter(client, birdId, sessionId, {
					age_code: 4,
					record_type: recordType,
					weight: 18,
					wing_length: 70
				});
			}
			return birdId;
		},
		cleanup() {
			const statements = [
				birdIds.length &&
					`DELETE FROM "Encounters" WHERE bird_id IN (${birdIds.join(', ')});`,
				birdIds.length &&
					`DELETE FROM "Birds" WHERE id IN (${birdIds.join(', ')});`,
				sessionIds.length &&
					`DELETE FROM "Sessions" WHERE id IN (${sessionIds.join(', ')});`,
				`DELETE FROM "Locations" WHERE id = ${locationId};`,
				`DELETE FROM "RingingGroups" WHERE id = ${groupId};`
			].filter(Boolean) as string[];
			psql(statements.join(''));
		}
	};
}

/** `(species_id, time_period)` cell keys, sorted — the spine's own grain. */
function cellKeys(
	rows: { species_id: number | null; time_period: string | null }[]
): string[] {
	return rows.map((row) => `${row.species_id}|${row.time_period}`).sort();
}

/**
 * `(species_name, time_period)` cell keys, sorted — demographics_stats and
 * arrivals_stats are keyed on species_name rather than species_id, so their
 * cell sets are compared on that axis and mapped onto it from species ids
 * where the two families are compared against each other.
 */
function namedCellKeys(
	rows: { species_name: string | null; time_period: string | null }[]
): string[] {
	return rows.map((row) => `${row.species_name}|${row.time_period}`).sort();
}

describe('stats_spine — sparse species×day spine', () => {
	let fixture: Awaited<ReturnType<typeof createSpineFixtureGroup>>;
	let emptyFixture: Awaited<ReturnType<typeof createSpineFixtureGroup>>;

	let robinSpeciesId: number;
	let wrenSpeciesId: number;
	let blueTitSpeciesId: number;

	const suffix = randomTestSuffix();

	// Well outside both the 2021-2024 seed range and the 2080-2119 bands the
	// other blocks in this file randomise within.
	const yr = 2140 + Math.floor(Math.random() * 20);
	const robinDay = `${yr}-03-10`;
	const wrenDay = `${yr}-03-11`;
	// A second Robin day in a different month, deliberately OUTSIDE the
	// robinDay..wrenDay window the two-species × two-days assertions use, so it
	// can't perturb them.
	const robinSecondDay = `${yr}-04-20`;

	beforeAll(async () => {
		[robinSpeciesId, wrenSpeciesId, blueTitSpeciesId] = await Promise.all([
			getSpeciesId('Robin'),
			getSpeciesId('Wren'),
			getSpeciesId('Blue Tit')
		]);

		fixture = await createSpineFixtureGroup(`SparseDay ${suffix}`);
		const robinSession = await fixture.addSession(robinDay);
		const wrenSession = await fixture.addSession(wrenDay);
		const robinSecondSession = await fixture.addSession(robinSecondDay);

		await fixture.addBird(`SPARSE-ROB-${suffix}`, robinSpeciesId, [
			robinSession,
			robinSecondSession
		]);
		await fixture.addBird(`SPARSE-WRE-${suffix}`, wrenSpeciesId, [wrenSession]);
		// Resighting-only: a 'U' record on a day another species WAS caught on.
		await fixture.addBird(
			`SPARSE-BLU-${suffix}`,
			blueTitSpeciesId,
			[robinSession],
			'U'
		);

		// A group with a session but nothing caught in-hand at all.
		emptyFixture = await createSpineFixtureGroup(`SparseDayEmpty ${suffix}`);
		await emptyFixture.addSession(robinDay);
	});

	afterAll(() => {
		fixture.cleanup();
		emptyFixture.cleanup();
	});

	function spineParams(overrides: Record<string, unknown>) {
		return {
			ringing_group_filter: fixture.groupId,
			group_by_species: true,
			group_by_time_period: 'day',
			...overrides
		};
	}

	// Usual — the 2-of-4 shape this whole ticket is about
	it('emits a cell only for the (species, day) pairs that were actually encountered', async () => {
		const { data, error } = await fixture.client.rpc(
			'stats_spine',
			spineParams({ from_date: robinDay, to_date: wrenDay })
		);
		expect(error).toBeNull();
		// Two species, two session days: the dense cross join gave all four
		// pairs (six, counting the resighting-only Blue Tit), the narrowed spine
		// gives exactly the two that happened.
		expect(cellKeys(data!)).toEqual(
			[`${robinSpeciesId}|${robinDay}`, `${wrenSpeciesId}|${wrenDay}`].sort()
		);
	});

	// Usual
	it('emits one cell per encountered day for a species caught on several days', async () => {
		const { data, error } = await fixture.client.rpc(
			'stats_spine',
			spineParams({
				species_name_filter: 'Robin',
				from_date: `${yr}-01-01`,
				to_date: `${yr}-12-31`
			})
		);
		expect(error).toBeNull();
		expect(cellKeys(data!)).toEqual(
			[
				`${robinSpeciesId}|${robinDay}`,
				`${robinSpeciesId}|${robinSecondDay}`
			].sort()
		);
	});

	// Edge
	it('emits no day cell for a species whose only encounters are resightings', async () => {
		const { data, error } = await fixture.client.rpc(
			'stats_spine',
			spineParams({ from_date: `${yr}-01-01`, to_date: `${yr}-12-31` })
		);
		expect(error).toBeNull();
		expect(data!.map((r) => r.species_id)).not.toContain(blueTitSpeciesId);

		// Note the nuance the ticket's wording glosses over: a resighting-only
		// species reaches species_spine via stats_raw_encounters' NULL-encounter_id
		// row only on a wholly UNFILTERED call. Every real caller (and every
		// assertion here) passes ringing_group_filter, and that row's NULL
		// sess.ringing_group_id can't satisfy the filter — so the species is absent
		// from the filtered spine at every grain, not just the day grain. Asserting
		// the month grain too pins that, rather than implying the day branch is
		// what excludes it.
		const { data: monthCells } = await fixture.client.rpc(
			'stats_spine',
			spineParams({
				group_by_time_period: 'month',
				from_date: `${yr}-01-01`,
				to_date: `${yr}-12-31`
			})
		);
		expect(monthCells!.map((r) => r.species_id)).not.toContain(
			blueTitSpeciesId
		);
	});

	// Edge
	it("honours species_name_filter, returning only the filtered species' own encountered days", async () => {
		const { data, error } = await fixture.client.rpc(
			'stats_spine',
			spineParams({
				species_name_filter: 'Wren',
				from_date: `${yr}-01-01`,
				to_date: `${yr}-12-31`
			})
		);
		expect(error).toBeNull();
		expect(cellKeys(data!)).toEqual([`${wrenSpeciesId}|${wrenDay}`]);
	});

	// Edge
	it('honours from_date/to_date, dropping an encountered pair outside the window', async () => {
		const { data, error } = await fixture.client.rpc(
			'stats_spine',
			spineParams({ from_date: robinDay, to_date: robinDay })
		);
		expect(error).toBeNull();
		// Wren's own encountered pair is a day later and is gone entirely — not
		// retained as an empty cell.
		expect(cellKeys(data!)).toEqual([`${robinSpeciesId}|${robinDay}`]);
	});

	// Edge
	it('honours year_filter/month_filter on the sparse branch', async () => {
		const { data, error } = await fixture.client.rpc(
			'stats_spine',
			spineParams({ year_filter: yr, month_filter: 4 })
		);
		expect(error).toBeNull();
		expect(cellKeys(data!)).toEqual([`${robinSpeciesId}|${robinSecondDay}`]);

		const { data: wrongYear } = await fixture.client.rpc(
			'stats_spine',
			spineParams({ year_filter: yr + 1 })
		);
		expect(wrongYear).toEqual([]);
	});

	// Edge
	it('returns no rows for a group with sessions but no in-hand encounters at all', async () => {
		const { data, error } = await emptyFixture.client.rpc('stats_spine', {
			ringing_group_filter: emptyFixture.groupId,
			group_by_species: true,
			group_by_time_period: 'day'
		});
		expect(error).toBeNull();
		expect(data).toEqual([]);
	});
});

describe('stats_spine — every other parameterisation is unchanged', () => {
	let fixture: Awaited<ReturnType<typeof createSpineFixtureGroup>>;

	let robinSpeciesId: number;
	let wrenSpeciesId: number;

	const suffix = randomTestSuffix();

	const yr = 2160 + Math.floor(Math.random() * 20);
	const robinDay = `${yr}-03-10`;
	const wrenDay = `${yr}-03-11`;
	// A session in a LATER year with nothing caught at all. session_date_range
	// reads Sessions directly, so it still stretches the dense month/year spines
	// out to its own period — which is exactly the density these tests pin.
	const emptySessionDay = `${yr + 1}-06-20`;

	const windowFrom = `${yr}-01-01`;
	const windowTo = `${yr + 1}-12-31`;

	beforeAll(async () => {
		[robinSpeciesId, wrenSpeciesId] = await Promise.all([
			getSpeciesId('Robin'),
			getSpeciesId('Wren')
		]);

		fixture = await createSpineFixtureGroup(`DenseSpine ${suffix}`);
		const robinSession = await fixture.addSession(robinDay);
		const wrenSession = await fixture.addSession(wrenDay);
		await fixture.addSession(emptySessionDay);

		await fixture.addBird(`DENSE-ROB-${suffix}`, robinSpeciesId, [
			robinSession
		]);
		await fixture.addBird(`DENSE-WRE-${suffix}`, wrenSpeciesId, [wrenSession]);
	});

	afterAll(() => {
		fixture.cleanup();
	});

	function spineParams(overrides: Record<string, unknown>) {
		return {
			ringing_group_filter: fixture.groupId,
			group_by_species: true,
			from_date: windowFrom,
			to_date: windowTo,
			...overrides
		};
	}

	// Structure
	it('the group-wide (group_by_species = false) day spine still returns one cell per session date', async () => {
		const { data, error } = await fixture.client.rpc(
			'stats_spine',
			spineParams({ group_by_species: false, group_by_time_period: 'day' })
		);
		expect(error).toBeNull();
		// One cell per session date with in-hand data, species_id NULL — and the
		// nothing-caught-in-hand date absent exactly as it was before #1385, since
		// period_spine's day branch has always been driven off raw_encounters.
		expect(cellKeys(data!)).toEqual(
			[`null|${robinDay}`, `null|${wrenDay}`].sort()
		);
		expect(data!.map((r) => r.time_period)).not.toContain(emptySessionDay);
	});

	// Structure
	it("the month spine stays dense per species across session_date_range's min..max", async () => {
		const { data, error } = await fixture.client.rpc(
			'stats_spine',
			spineParams({ group_by_time_period: 'month' })
		);
		expect(error).toBeNull();
		// March of yr through June of yr+1 is 16 months, dense, for each of the
		// two species in species_spine.
		expect(data).toHaveLength(32);
		const robinMonths = data!
			.filter((r) => r.species_id === robinSpeciesId)
			.map((r) => r.time_period);
		expect(robinMonths).toContain(`${yr}-03-01`);
		expect(robinMonths).toContain(`${yr + 1}-06-01`);
		// A month Robin was never caught in still gets its cell.
		expect(robinMonths).toContain(`${yr}-05-01`);
	});

	// Structure
	it('the year spine stays dense per species', async () => {
		const { data, error } = await fixture.client.rpc(
			'stats_spine',
			spineParams({ group_by_time_period: 'year' })
		);
		expect(error).toBeNull();
		// Wren was only ever caught in yr, but the empty yr+1 session stretches
		// session_date_range into that year, so both species get both cells.
		expect(cellKeys(data!)).toEqual(
			[
				`${robinSpeciesId}|${yr}-01-01`,
				`${robinSpeciesId}|${yr + 1}-01-01`,
				`${wrenSpeciesId}|${yr}-01-01`,
				`${wrenSpeciesId}|${yr + 1}-01-01`
			].sort()
		);
	});

	// Structure
	it('month-squashed still returns all 12 cells per species, and exactly one when month_filter is set', async () => {
		const { data, error } = await fixture.client.rpc(
			'stats_spine',
			spineParams({ group_by_time_period: 'month-squashed' })
		);
		expect(error).toBeNull();
		expect(data).toHaveLength(24);

		const { data: narrowed } = await fixture.client.rpc(
			'stats_spine',
			spineParams({
				group_by_time_period: 'month-squashed',
				month_filter: 3
			})
		);
		expect(cellKeys(narrowed!)).toEqual(
			[`${robinSpeciesId}|2000-03-01`, `${wrenSpeciesId}|2000-03-01`].sort()
		);
	});

	// Structure — the all-time shape is where a naive `= 'day'` guard would have
	// broken: group_by_time_period is NULL there, so a non-NULL-safe comparison
	// filters the whole cross join out.
	it('the all-time shape (group_by_time_period NULL) still returns one cell per species', async () => {
		const { data, error } = await fixture.client.rpc(
			'stats_spine',
			spineParams({ group_by_time_period: null })
		);
		expect(error).toBeNull();
		expect(cellKeys(data!)).toEqual(
			[`${robinSpeciesId}|null`, `${wrenSpeciesId}|null`].sort()
		);
	});
});

describe('stats_spine — day-grain consumers', () => {
	let fixture: Awaited<ReturnType<typeof createSpineFixtureGroup>>;

	let robinSpeciesId: number;
	let wrenSpeciesId: number;

	const suffix = randomTestSuffix();

	const yr = 2180 + Math.floor(Math.random() * 15);
	const robinDay = `${yr}-03-10`;
	const wrenDay = `${yr}-03-11`;

	/**
	 * The four `stats_cache_*_metrics` RPCs, each with one metric column that
	 * must be non-zero/non-null for a cell the narrowed spine kept. Every
	 * encounter in the fixture is `age_code: 4` (adult) with a weight, so the
	 * adult counts and the biometrics are the natural per-metric-group
	 * equivalents of basic-session's `encounter_count`.
	 */
	const METRIC_RPCS = [
		{ rpc: 'stats_cache_basic_session_metrics', metric: 'encounter_count' },
		{ rpc: 'stats_cache_bird_age_metrics', metric: 'adult_bird_count' },
		{ rpc: 'stats_cache_encounter_age_metrics', metric: 'adult_enc_count' },
		{ rpc: 'stats_cache_biometrics_metrics', metric: 'max_weight' }
	] as const;

	beforeAll(async () => {
		[robinSpeciesId, wrenSpeciesId] = await Promise.all([
			getSpeciesId('Robin'),
			getSpeciesId('Wren')
		]);

		fixture = await createSpineFixtureGroup(`DayConsumers ${suffix}`);
		const robinSession = await fixture.addSession(robinDay);
		const wrenSession = await fixture.addSession(wrenDay);

		await fixture.addBird(`DAYC-ROB-${suffix}`, robinSpeciesId, [robinSession]);
		await fixture.addBird(`DAYC-WRE-${suffix}`, wrenSpeciesId, [wrenSession]);
	});

	afterAll(() => {
		fixture.cleanup();
	});

	function dayGrainParams() {
		return {
			ringing_group_filter: fixture.groupId,
			group_by_species: true,
			group_by_time_period: 'day',
			from_date: robinDay,
			to_date: wrenDay
		};
	}

	const expectedCellKeys = () =>
		[`${robinSpeciesId}|${robinDay}`, `${wrenSpeciesId}|${wrenDay}`].sort();

	// Usual
	it.each(METRIC_RPCS)(
		'$rpc returns exactly the encountered (species, day) cells, each with a non-zero $metric',
		async ({ rpc, metric }) => {
			const { data, error } = await fixture.client.rpc(rpc, dayGrainParams());
			expect(error).toBeNull();
			expect(cellKeys(data!)).toEqual(expectedCellKeys());
			for (const row of data!) {
				expect(Number(row[metric])).toBeGreaterThan(0);
			}
		}
	);

	// Usual
	it('demographics_stats and arrivals_stats return the same narrowed cell set for the same parameters', async () => {
		const [{ data: demographics }, { data: arrivals }] = await Promise.all([
			fixture.client.rpc('demographics_stats', dayGrainParams()),
			fixture.client.rpc('arrivals_stats', dayGrainParams())
		]);
		const expected = [`Robin|${robinDay}`, `Wren|${wrenDay}`].sort();
		expect(namedCellKeys(demographics!)).toEqual(expected);
		expect(namedCellKeys(arrivals!)).toEqual(expected);
	});

	// Structure — guards against a regression that CHANGES a surviving row
	// rather than merely dropping rows, which a cell-set assertion alone would
	// pass. The literals are the hand-derived values for this fixture's single
	// Robin encounter (one adult 'N' capture at 10:00:00, weight 18, wing 70):
	// one of everything. Compared with toMatchObject so a column added to the
	// result type doesn't fail the test spuriously.
	it('a cell surviving the narrowing carries identical values to the pre-change output', async () => {
		const { data, error } = await fixture.client.rpc(
			'stats_cache_basic_session_metrics',
			dayGrainParams()
		);
		expect(error).toBeNull();
		const robinCell = data!.find(
			(row) => row.species_id === robinSpeciesId && row.time_period === robinDay
		);
		expect(robinCell).toMatchObject({
			species_id: robinSpeciesId,
			time_period: robinDay,
			species_count: 1,
			bird_count: 1,
			encounter_count: 1,
			new_bird_count: 1,
			session_count: 1,
			avg_encounters_per_session: 1,
			max_per_session: 1,
			max_new_per_session: 1
		});
	});

	// Edge — the precondition mergeSimpleMetricRows' anomaly dead-lettering
	// depends on: a key present in some but not all of the metric RPCs is
	// treated as a real anomaly and skipped, so a divergence here would
	// dead-letter every cell rather than caching it.
	it('the four metric RPCs agree on the narrowed cell set', async () => {
		const metricKeySets = await Promise.all(
			METRIC_RPCS.map(async ({ rpc }) => {
				const { data } = await fixture.client.rpc(rpc, dayGrainParams());
				return cellKeys(data!);
			})
		);
		for (const keys of metricKeySets) {
			expect(keys).toEqual(metricKeySets[0]);
		}
	});
});
