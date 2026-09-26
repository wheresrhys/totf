/**
 * Integration tests for the `year_filter`/`month_filter` params added to the
 * stats-RPC spine family. These compose (AND) alongside the existing
 * `from_date`/`to_date` range filters: `year_filter` alone scopes to one calendar
 * year, `month_filter` alone (yearless) scopes to one calendar month across ALL
 * years — the motivating "summary/month/february" use case, aggregating every
 * February a group has ever ringed in, which no single contiguous date range can
 * express.
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

function cleanupSql(
	birdIds: number[],
	sessionIds: number[],
	locationIds: number[]
): string {
	return (
		`DELETE FROM "Encounters" WHERE bird_id IN (${birdIds.join(', ')});` +
		`DELETE FROM "Birds" WHERE id IN (${birdIds.join(', ')});` +
		`DELETE FROM "Sessions" WHERE id IN (${sessionIds.join(', ')});` +
		`DELETE FROM "Locations" WHERE id IN (${locationIds.join(', ')});`
	);
}

function runCleanup(sql: string): void {
	execSync(
		`psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c '${sql}'`
	);
}

describe('stats_raw_encounters — year_filter/month_filter', () => {
	let deltaId: number;
	let deltaClient: SupabaseClient;

	const locationIds: number[] = [];
	const sessionIds: number[] = [];
	const birdIds: number[] = [];

	const suffix = randomTestSuffix();
	const targetYear = 2080 + Math.floor(Math.random() * 18); // 2080–2097
	const targetMonth = 2; // February — the motivating "all Februaries" case
	const monthStr = String(targetMonth).padStart(2, '0');

	const matchRing = `YMF-MATCH-${suffix}`; // target year AND target month
	const otherYearRing = `YMF-OYEAR-${suffix}`; // target month, different year
	const otherMonthRing = `YMF-OMONTH-${suffix}`; // target year, different month
	const inRangeRing = `YMF-RANGE-${suffix}`; // target year+month, within a from/to range
	const allRings = [matchRing, otherYearRing, otherMonthRing, inRangeRing];

	beforeAll(async () => {
		deltaId = await getGroupIdByName('Delta');
		deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);
		const robinId = await getSpeciesId('Robin');

		const locationId = await insertTestLocation(
			deltaClient,
			deltaId,
			`YMF Loc ${suffix}`
		);
		locationIds.push(locationId);

		async function addBird(ring: string, date: string): Promise<void> {
			const birdId = await insertTestBird(deltaClient, ring, robinId);
			birdIds.push(birdId);
			const sessionId = await insertTestSession(deltaClient, locationId, date);
			sessionIds.push(sessionId);
			await insertTestEncounter(deltaClient, birdId, sessionId, {
				age_code: 4,
				record_type: 'N',
				weight: 10,
				wing_length: 50
			});
		}

		await addBird(matchRing, `${targetYear}-${monthStr}-15`);
		await addBird(otherYearRing, `${targetYear + 1}-${monthStr}-10`);
		await addBird(otherMonthRing, `${targetYear}-05-10`);
		await addBird(inRangeRing, `${targetYear}-${monthStr}-25`);
	});

	afterAll(() => {
		runCleanup(cleanupSql(birdIds, sessionIds, locationIds));
	});

	async function ringsPresent(
		params: Record<string, unknown>
	): Promise<Set<string>> {
		const { data, error } = await deltaClient.rpc('stats_raw_encounters', {
			ringing_group_filter: deltaId,
			...params
		});
		expect(error).toBeNull();
		return new Set(
			data!
				.filter((r) => allRings.includes(r.ring_no as string))
				.map((r) => r.ring_no as string)
		);
	}

	// Usual
	it('year_filter alone includes matching year, excludes adjacent year', async () => {
		const rings = await ringsPresent({ year_filter: targetYear });
		expect(rings.has(matchRing)).toBe(true);
		expect(rings.has(otherMonthRing)).toBe(true); // same year, any month
		expect(rings.has(inRangeRing)).toBe(true);
		expect(rings.has(otherYearRing)).toBe(false);
	});

	// Usual — the core new "all Februaries" behaviour
	it('month_filter alone (no year_filter) includes matching month across multiple different years', async () => {
		const rings = await ringsPresent({ month_filter: targetMonth });
		expect(rings.has(matchRing)).toBe(true);
		expect(rings.has(otherYearRing)).toBe(true); // same month, different year
		expect(rings.has(inRangeRing)).toBe(true);
		expect(rings.has(otherMonthRing)).toBe(false);
	});

	// Structure
	it('year_filter + month_filter together narrows to that specific year-month combo', async () => {
		const rings = await ringsPresent({
			year_filter: targetYear,
			month_filter: targetMonth
		});
		expect(rings.has(matchRing)).toBe(true);
		expect(rings.has(inRangeRing)).toBe(true);
		expect(rings.has(otherYearRing)).toBe(false);
		expect(rings.has(otherMonthRing)).toBe(false);
	});

	// Edge — composition with the pre-existing range filter
	it('year_filter/month_filter AND with an overlapping from_date/to_date range — intersection not union', async () => {
		const rings = await ringsPresent({
			year_filter: targetYear,
			month_filter: targetMonth,
			from_date: `${targetYear}-${monthStr}-20`,
			to_date: `${targetYear}-${monthStr}-28`
		});
		// matchRing (day 15) satisfies year_filter/month_filter but falls outside the
		// from/to range — must still be excluded (AND, not OR).
		expect(rings.has(matchRing)).toBe(false);
		// inRangeRing (day 25) satisfies all three filters at once.
		expect(rings.has(inRangeRing)).toBe(true);
	});

	// Regression guard
	it('year_filter/month_filter both omitted (NULL): existing from_date/to_date-only behaviour is unaffected', async () => {
		const rings = await ringsPresent({});
		expect(rings.has(matchRing)).toBe(true);
		expect(rings.has(otherYearRing)).toBe(true);
		expect(rings.has(otherMonthRing)).toBe(true);
		expect(rings.has(inRangeRing)).toBe(true);
	});
});

describe('stats_spine — session_date_range under year_filter/month_filter', () => {
	let deltaId: number;
	let deltaClient: SupabaseClient;

	const locationIds: number[] = [];
	const sessionIds: number[] = [];
	const birdIds: number[] = [];

	const suffix = randomTestSuffix();
	const targetYear = 2080 + Math.floor(Math.random() * 14); // leaves room for +5 years

	beforeAll(async () => {
		deltaId = await getGroupIdByName('Delta');
		deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);

		const locationId = await insertTestLocation(
			deltaClient,
			deltaId,
			`YMF Spine Loc ${suffix}`
		);
		locationIds.push(locationId);

		async function makeSession(date: string): Promise<number> {
			const sessionId = await insertTestSession(deltaClient, locationId, date);
			sessionIds.push(sessionId);
			return sessionId;
		}

		// year_filter narrowing: one session inside targetYear, one five years later.
		await makeSession(`${targetYear}-03-15`);
		await makeSession(`${targetYear + 5}-03-15`);

		// month_filter + year-grouping: February sessions in targetYear and targetYear+3.
		await makeSession(`${targetYear}-02-10`);
		await makeSession(`${targetYear + 3}-02-10`);

		// Day-branch encounters: a February day and a May day in targetYear, so the
		// sparse day spine can be checked against month_filter directly.
		const robinId = await getSpeciesId('Robin');
		async function addEncounterOnDay(ring: string, date: string): Promise<void> {
			const birdId = await insertTestBird(deltaClient, ring, robinId);
			birdIds.push(birdId);
			const sessionId = await makeSession(date);
			await insertTestEncounter(deltaClient, birdId, sessionId, {
				age_code: 4,
				record_type: 'N',
				weight: 10,
				wing_length: 50
			});
		}
		await addEncounterOnDay(`YMF-SPINE-FEB-${suffix}`, `${targetYear}-02-20`);
		await addEncounterOnDay(`YMF-SPINE-MAY-${suffix}`, `${targetYear}-05-20`);
	});

	afterAll(() => {
		runCleanup(cleanupSql(birdIds, sessionIds, locationIds));
	});

	// Usual
	it('year_filter narrows session_date_range to that year', async () => {
		const { data, error } = await deltaClient.rpc('stats_spine', {
			ringing_group_filter: deltaId,
			year_filter: targetYear,
			group_by_time_period: 'month'
		});
		expect(error).toBeNull();
		const months = data!.map((r) => r.time_period);
		expect(months).toContain(`${targetYear}-03-01`);
		expect(months).not.toContain(`${targetYear + 5}-03-01`);
	});

	// Structure — year-truncation smooths over the sub-year narrowing
	it('month_filter alone with group_by_time_period = year: every year containing a matching session gets a row', async () => {
		const { data, error } = await deltaClient.rpc('stats_spine', {
			ringing_group_filter: deltaId,
			month_filter: 2,
			from_date: `${targetYear}-01-01`,
			to_date: `${targetYear + 3}-12-31`,
			group_by_time_period: 'year'
		});
		expect(error).toBeNull();
		const years = data!.map((r) => r.time_period);
		// session_date_range is narrowed to Feb-only dates (targetYear .. targetYear+3),
		// but the year branch truncates to year and steps by 1 year, so every year in
		// between gets a row — including targetYear+1/+2, which have no Feb session at all.
		expect(years).toContain(`${targetYear}-01-01`);
		expect(years).toContain(`${targetYear + 1}-01-01`);
		expect(years).toContain(`${targetYear + 2}-01-01`);
		expect(years).toContain(`${targetYear + 3}-01-01`);
	});

	// Edge — accepted redundant-combo edge case, documented not fixed (YAGNI)
	it('month_filter alone with group_by_time_period = month: dense spine walks every month between narrowed bounds, not just matches', async () => {
		const { data, error } = await deltaClient.rpc('stats_spine', {
			ringing_group_filter: deltaId,
			month_filter: 2,
			from_date: `${targetYear}-01-01`,
			to_date: `${targetYear + 3}-12-31`,
			group_by_time_period: 'month'
		});
		expect(error).toBeNull();
		const months = data!.map((r) => r.time_period);
		expect(months).toContain(`${targetYear}-02-01`);
		// A non-February month between the narrowed min/max still appears — the accepted
		// edge case documented in stats_spine.sql's session_date_range CTE, not a bug.
		expect(months).toContain(`${targetYear}-06-01`);
	});

	// Edge — day branch is unaffected (sparse, driven off raw_encounters)
	it('month_filter alone with group_by_time_period = day: the sparse day spine is correctly limited to actual matching session days', async () => {
		const { data, error } = await deltaClient.rpc('stats_spine', {
			ringing_group_filter: deltaId,
			month_filter: 2,
			from_date: `${targetYear}-01-01`,
			to_date: `${targetYear}-12-31`,
			group_by_time_period: 'day'
		});
		expect(error).toBeNull();
		const days = data!.map((r) => r.time_period);
		expect(days).toContain(`${targetYear}-02-20`);
		expect(days).not.toContain(`${targetYear}-05-20`);
	});
});

describe('core_stats — year_filter/month_filter end-to-end', () => {
	let deltaId: number;
	let deltaClient: SupabaseClient;
	let robinId: number;
	let wrenId: number;

	const locationIds: number[] = [];
	const sessionIds: number[] = [];
	const birdIds: number[] = [];

	const suffix = randomTestSuffix();
	const targetYear = 2080 + Math.floor(Math.random() * 15);
	const targetMonth = 2;
	const monthStr = String(targetMonth).padStart(2, '0');

	beforeAll(async () => {
		deltaId = await getGroupIdByName('Delta');
		deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);
		robinId = await getSpeciesId('Robin');
		wrenId = await getSpeciesId('Wren');

		const locationId = await insertTestLocation(
			deltaClient,
			deltaId,
			`YMF Core Loc ${suffix}`
		);
		locationIds.push(locationId);
	});

	afterAll(() => {
		runCleanup(cleanupSql(birdIds, sessionIds, locationIds));
	});

	async function addBird(
		ring: string,
		speciesId: number,
		date: string
	): Promise<void> {
		const birdId = await insertTestBird(deltaClient, ring, speciesId);
		birdIds.push(birdId);
		const sessionId = await insertTestSession(
			deltaClient,
			locationIds[0],
			date
		);
		sessionIds.push(sessionId);
		await insertTestEncounter(deltaClient, birdId, sessionId, {
			age_code: 4,
			record_type: 'N',
			weight: 10,
			wing_length: 50
		});
	}

	async function ungroupedRow(params: Record<string, unknown>) {
		const { data, error } = await deltaClient.rpc('core_stats', {
			ringing_group_filter: deltaId,
			...params
		});
		expect(error).toBeNull();
		expect(data).toHaveLength(1);
		return data![0];
	}

	// Usual — the motivating "summary/month/february" use case
	it('month_filter alone (ungrouped) aggregates encounters for that calendar month across all years into a single row', async () => {
		const before = await ungroupedRow({
			species_name_filter: 'Robin',
			month_filter: targetMonth
		});

		await addBird(`YMF-CORE-A-${suffix}`, robinId, `${targetYear}-${monthStr}-10`);
		await addBird(
			`YMF-CORE-B-${suffix}`,
			robinId,
			`${targetYear + 4}-${monthStr}-10`
		);
		// Different month — must not contribute.
		await addBird(`YMF-CORE-C-${suffix}`, robinId, `${targetYear}-06-10`);

		const after = await ungroupedRow({
			species_name_filter: 'Robin',
			month_filter: targetMonth
		});

		expect(after.encounter_count - before.encounter_count).toBe(2);
		expect(after.bird_count - before.bird_count).toBe(2);
	});

	// Structure — cross-check against the pre-existing range-filter path
	it('year_filter + month_filter matches an equivalent from_date/to_date single-month range', async () => {
		const viaFilters = await ungroupedRow({
			species_name_filter: 'Robin',
			year_filter: targetYear,
			month_filter: targetMonth
		});
		const viaRange = await ungroupedRow({
			species_name_filter: 'Robin',
			from_date: `${targetYear}-${monthStr}-01`,
			to_date: `${targetYear}-${monthStr}-28`
		});
		expect(viaFilters).toEqual(viaRange);
	});

	// Structure — composes with species_name_filter alongside the new params
	it('composes correctly (AND) with species_name_filter and ringing_group_filter', async () => {
		const beforeRobin = await ungroupedRow({
			species_name_filter: 'Robin',
			year_filter: targetYear,
			month_filter: targetMonth
		});

		// Same date/location for both, so they must share one session (visit_date +
		// location_id is unique) rather than each going through addBird's own insert.
		const sharedSessionId = await insertTestSession(
			deltaClient,
			locationIds[0],
			`${targetYear}-${monthStr}-15`
		);
		sessionIds.push(sharedSessionId);
		const robinBirdId = await insertTestBird(
			deltaClient,
			`YMF-CORE-D-${suffix}`,
			robinId
		);
		birdIds.push(robinBirdId);
		await insertTestEncounter(deltaClient, robinBirdId, sharedSessionId, {
			age_code: 4,
			record_type: 'N',
			weight: 10,
			wing_length: 50
		});
		const wrenBirdId = await insertTestBird(
			deltaClient,
			`YMF-CORE-E-${suffix}`,
			wrenId
		);
		birdIds.push(wrenBirdId);
		await insertTestEncounter(deltaClient, wrenBirdId, sharedSessionId, {
			age_code: 4,
			record_type: 'N',
			weight: 10,
			wing_length: 50
		});

		const afterRobin = await ungroupedRow({
			species_name_filter: 'Robin',
			year_filter: targetYear,
			month_filter: targetMonth
		});

		// Only the Robin bird contributes when species_name_filter narrows further.
		expect(afterRobin.bird_count - beforeRobin.bird_count).toBe(1);
	});
});

describe('demographics_stats / stats_bird_returning_age_bucket / stats_bird_first_encounter_of_year — unwindowed lifetime CTEs ignore year_filter/month_filter', () => {
	let deltaId: number;
	let deltaClient: SupabaseClient;

	const locationIds: number[] = [];
	const sessionIds: number[] = [];
	const birdIds: number[] = [];

	const suffix = randomTestSuffix();
	const targetYear = 2085 + Math.floor(Math.random() * 10);
	const targetMonth = 2;
	const monthStr = String(targetMonth).padStart(2, '0');

	let returnerBirdId: number;
	let newAdultBirdId: number;
	let agedBirdId: number;

	beforeAll(async () => {
		deltaId = await getGroupIdByName('Delta');
		deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);
		const robinId = await getSpeciesId('Robin');

		const locationId = await insertTestLocation(
			deltaClient,
			deltaId,
			`YMF Lifetime Loc ${suffix}`
		);
		locationIds.push(locationId);

		async function makeSession(date: string): Promise<number> {
			const sessionId = await insertTestSession(deltaClient, locationId, date);
			sessionIds.push(sessionId);
			return sessionId;
		}

		function encounter(
			birdId: number,
			sessionId: number,
			fields: { age_code: number; is_juv: boolean }
		) {
			return insertTestEncounter(deltaClient, birdId, sessionId, {
				...fields,
				record_type: 'R',
				weight: 10,
				wing_length: 50
			});
		}

		// Adult returner: first-ever encounter a year before this period, OUTSIDE this
		// query's year_filter/month_filter window entirely — proves the lifetime CTE
		// ignores both new params, not just from_date/to_date.
		returnerBirdId = await insertTestBird(
			deltaClient,
			`YMF-LIFE-RET-${suffix}`,
			robinId
		);
		birdIds.push(returnerBirdId);
		await encounter(returnerBirdId, await makeSession(`${targetYear - 1}-05-10`), {
			age_code: 4,
			is_juv: false
		});
		await encounter(
			returnerBirdId,
			await makeSession(`${targetYear}-${monthStr}-10`),
			{ age_code: 4, is_juv: false }
		);

		// True new adult: only ever encountered this period, for contrast.
		newAdultBirdId = await insertTestBird(
			deltaClient,
			`YMF-LIFE-NEW-${suffix}`,
			robinId
		);
		birdIds.push(newAdultBirdId);
		await encounter(
			newAdultBirdId,
			await makeSession(`${targetYear}-${monthStr}-12`),
			{ age_code: 4, is_juv: false }
		);

		// Precisely aged 2 years before this period (bare age-3, outside the window),
		// retrapped as an adult this period.
		agedBirdId = await insertTestBird(
			deltaClient,
			`YMF-LIFE-AGE2-${suffix}`,
			robinId
		);
		birdIds.push(agedBirdId);
		await encounter(agedBirdId, await makeSession(`${targetYear - 2}-05-10`), {
			age_code: 3,
			is_juv: false
		});
		await encounter(
			agedBirdId,
			await makeSession(`${targetYear}-${monthStr}-14`),
			{ age_code: 4, is_juv: false }
		);
	});

	afterAll(() => {
		runCleanup(cleanupSql(birdIds, sessionIds, locationIds));
	});

	// Usual
	it("an earlier-year encounter outside month_filter's month still counts toward a bird's first-ever-with-group year for new_adult_bird_count", async () => {
		const { data, error } = await deltaClient.rpc('demographics_stats', {
			ringing_group_filter: deltaId,
			species_name_filter: 'Robin',
			year_filter: targetYear,
			month_filter: targetMonth
		});
		expect(error).toBeNull();
		expect(data).toHaveLength(1);
		// All three birds are adult this period (returner, new adult, aged); only the
		// true new adult counts as new despite the other two's earlier history sitting
		// entirely outside this query's year_filter/month_filter window.
		expect(data![0].adult_bird_count).toBe(3);
		expect(data![0].new_adult_bird_count).toBe(1);
	});

	// Structure
	it("an earlier encounter outside year_filter's year still contributes to stats_bird_returning_age_bucket's period-relative proven age", async () => {
		const { data, error } = await deltaClient.rpc(
			'stats_bird_returning_age_bucket',
			{
				ringing_group_filter: deltaId,
				species_name_filter: 'Robin',
				year_filter: targetYear,
				month_filter: targetMonth
			}
		);
		expect(error).toBeNull();
		const row = data!.find((r) => r.bird_id === agedBirdId);
		expect(row).toBeDefined();
		// period_relative_proven_age = targetYear - (targetYear - 2) = 2, resolved from
		// the bird's UNWINDOWED lifetime history — the aging encounter itself sits
		// entirely outside this query's year_filter/month_filter window.
		expect(row!.returning_age_bucket).toBe('2');
	});

	// Edge — a third unwindowed lifetime CTE, same guarantee
	it("stats_bird_first_encounter_of_year's new_adult vs returning_adult split is unaffected by year_filter/month_filter narrowing the current cell's window", async () => {
		const { data, error } = await deltaClient.rpc(
			'stats_bird_first_encounter_of_year',
			{
				ringing_group_filter: deltaId,
				species_name_filter: 'Robin',
				year_filter: targetYear,
				month_filter: targetMonth
			}
		);
		expect(error).toBeNull();
		const returnerRow = data!.find((r) => r.bird_id === returnerBirdId);
		const newAdultRow = data!.find((r) => r.bird_id === newAdultBirdId);
		expect(returnerRow?.arrival_bucket).toBe('returning_adult');
		expect(newAdultRow?.arrival_bucket).toBe('new_adult');
	});
});
