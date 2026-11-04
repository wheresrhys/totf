/**
 * Integration tests for the `'month-squashed'` `group_by_time_period` value (#996),
 * added across the stats-RPC family so every distinct-count/MAX/AVG column for
 * "every January across all years" (etc.) is computed correctly at the SQL level, in
 * one call — replacing the 12x-round-trip app-layer workaround
 * (`fetchCombinedMonthSpeciesCounts`, #995) that only ever fixed `species_count`.
 *
 * Modelled on stats-year-month-filter.test.ts: fresh, isolated Delta-group rows per
 * describe block, `from_date`/`to_date` pinned tightly around each block's own
 * randomly-chosen years so real e2e seed data (2021-2024) and other concurrently
 * running test runs (which pick their own random years) never pollute a row's counts —
 * letting assertions be exact/absolute rather than before/after diffs.
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

// A random target month plus two well-separated random years, both far outside the
// e2e seed data's 2021-2024 range — the "combine years" shape under test needs two
// distinct real years of history for the same calendar month.
function pickMonthAndYears(): {
	targetMonth: number;
	monthStr: string;
	sentinelDate: string;
	year1: number;
	year2: number;
} {
	const targetMonth = 1 + Math.floor(Math.random() * 12);
	const monthStr = String(targetMonth).padStart(2, '0');
	const year1 = 2080 + Math.floor(Math.random() * 10); // 2080-2089
	const year2 = year1 + 5 + Math.floor(Math.random() * 5); // year1+5 .. year1+9
	return {
		targetMonth,
		monthStr,
		sentinelDate: `2000-${monthStr}-01`,
		year1,
		year2
	};
}

function sentinelForMonth(month: number): string {
	return `2000-${String(month).padStart(2, '0')}-01`;
}

describe('stats_spine — month-squashed grouping', () => {
	let deltaId: number;
	let deltaClient: SupabaseClient;

	beforeAll(async () => {
		deltaId = await getGroupIdByName('Delta');
		deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);
	});

	// Usual
	it('returns exactly 12 rows (Jan-Dec) regardless of how much history exists', async () => {
		const { data, error } = await deltaClient.rpc('stats_spine', {
			ringing_group_filter: deltaId,
			group_by_time_period: 'month-squashed'
		});
		expect(error).toBeNull();
		expect(data).toHaveLength(12);
	});

	// Structure
	it("each row's time_period is the year-agnostic 2000-<mm>-01 sentinel date", async () => {
		const { data, error } = await deltaClient.rpc('stats_spine', {
			ringing_group_filter: deltaId,
			group_by_time_period: 'month-squashed'
		});
		expect(error).toBeNull();
		const months = data!.map((r) => r.time_period).sort();
		expect(months).toEqual(
			Array.from({ length: 12 }, (_unused, i) => sentinelForMonth(i + 1))
		);
	});

	// Edge — dense (all 12 months), not sparse like the 'day' branch, even when the
	// underlying data (narrowed here to a single day via from_date=to_date) spans only
	// one calendar month.
	it('still returns all 12 rows when the queried history spans only one calendar month', async () => {
		const { data, error } = await deltaClient.rpc('stats_spine', {
			ringing_group_filter: deltaId,
			group_by_time_period: 'month-squashed',
			from_date: '2090-06-15',
			to_date: '2090-06-15'
		});
		expect(error).toBeNull();
		expect(data).toHaveLength(12);
	});
});

describe('arrivals_stats / demographics_stats / stats_cache_biometrics_metrics — month-squashed grouping', () => {
	let deltaId: number;
	let deltaClient: SupabaseClient;

	const locationIds: number[] = [];
	const sessionIds: number[] = [];
	const birdIds: number[] = [];

	const suffix = randomTestSuffix();
	const { monthStr, sentinelDate, year1, year2 } = pickMonthAndYears();
	const fromDate = `${year1}-01-01`;
	const toDate = `${year2}-12-31`;

	beforeAll(async () => {
		deltaId = await getGroupIdByName('Delta');
		deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);
		const robinId = await getSpeciesId('Robin');

		const locationId = await insertTestLocation(
			deltaClient,
			deltaId,
			`MSQ Companion Loc ${suffix}`
		);
		locationIds.push(locationId);

		const birdId = await insertTestBird(
			deltaClient,
			`MSQ-COMPANION-${suffix}`,
			robinId
		);
		birdIds.push(birdId);
		const sessionId = await insertTestSession(
			deltaClient,
			locationId,
			`${year1}-${monthStr}-10`
		);
		sessionIds.push(sessionId);
		await insertTestEncounter(deltaClient, birdId, sessionId, {
			age_code: 4,
			record_type: 'N',
			weight: 12,
			wing_length: 55
		});
	});

	afterAll(() => {
		runCleanup(cleanupSql(birdIds, sessionIds, locationIds));
	});

	async function monthRow(
		rpcName:
			| 'arrivals_stats'
			| 'demographics_stats'
			| 'stats_cache_biometrics_metrics'
	): Promise<Record<string, unknown>> {
		const { data, error } = await deltaClient.rpc(rpcName, {
			ringing_group_filter: deltaId,
			species_name_filter: 'Robin',
			from_date: fromDate,
			to_date: toDate,
			group_by_time_period: 'month-squashed'
		});
		expect(error).toBeNull();
		expect(data).toHaveLength(12);
		const row = data!.find((r) => r.time_period === sentinelDate);
		expect(row).toBeDefined();
		return row!;
	}

	// Usual
	it('arrivals_stats accepts month-squashed and returns a correctly-partitioned new_adult_bird_count', async () => {
		const row = await monthRow('arrivals_stats');
		expect(row.new_adult_bird_count).toBe(1);
	});

	// Usual
	it('demographics_stats accepts month-squashed and returns a correctly-partitioned adult_bird_count', async () => {
		const row = await monthRow('demographics_stats');
		expect(row.adult_bird_count).toBe(1);
	});

	// Usual
	it('stats_cache_biometrics_metrics accepts month-squashed and returns correctly-partitioned biometric columns', async () => {
		const row = await monthRow('stats_cache_biometrics_metrics');
		expect(row.max_weight).toBe(12);
	});
});

describe('Regression — existing group_by_time_period values unaffected by month-squashed', () => {
	let deltaId: number;
	let deltaClient: SupabaseClient;

	const locationIds: number[] = [];
	const sessionIds: number[] = [];
	const birdIds: number[] = [];

	const suffix = randomTestSuffix();
	const { monthStr, year1 } = pickMonthAndYears();

	beforeAll(async () => {
		deltaId = await getGroupIdByName('Delta');
		deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);
		const robinId = await getSpeciesId('Robin');

		const locationId = await insertTestLocation(
			deltaClient,
			deltaId,
			`MSQ Regression Loc ${suffix}`
		);
		locationIds.push(locationId);

		const birdId = await insertTestBird(
			deltaClient,
			`MSQ-REGRESSION-${suffix}`,
			robinId
		);
		birdIds.push(birdId);
		const sessionId = await insertTestSession(
			deltaClient,
			locationId,
			`${year1}-${monthStr}-10`
		);
		sessionIds.push(sessionId);
		await insertTestEncounter(deltaClient, birdId, sessionId, {
			age_code: 4,
			record_type: 'N',
			weight: 10,
			wing_length: 50
		});
	});

	afterAll(() => {
		runCleanup(cleanupSql(birdIds, sessionIds, locationIds));
	});

	// Edge
	it("'month', 'year' and 'day' grouping behaviour is unchanged by the new 'month-squashed' branch", async () => {
		const params = {
			ringing_group_filter: deltaId,
			species_name_filter: 'Robin',
			from_date: `${year1}-01-01`,
			to_date: `${year1}-12-31`
		};

		const { data: monthRows, error: monthError } = await deltaClient.rpc(
			'stats_cache_basic_session_metrics',
			{ ...params, group_by_time_period: 'month' }
		);
		expect(monthError).toBeNull();
		// 'month' is dense only within the group's actual min..max data range — with
		// a single inserted session, that range is one month, unlike month-squashed's
		// always-12-row spine.
		expect(monthRows).toHaveLength(1);
		const matchingMonth = monthRows!.find(
			(r) => r.time_period === `${year1}-${monthStr}-01`
		);
		expect(matchingMonth!.bird_count).toBe(1);

		const { data: yearRows, error: yearError } = await deltaClient.rpc(
			'stats_cache_basic_session_metrics',
			{ ...params, group_by_time_period: 'year' }
		);
		expect(yearError).toBeNull();
		expect(yearRows).toHaveLength(1);
		expect(yearRows![0].time_period).toBe(`${year1}-01-01`);

		const { data: dayRows, error: dayError } = await deltaClient.rpc(
			'stats_cache_basic_session_metrics',
			{ ...params, group_by_time_period: 'day' }
		);
		expect(dayError).toBeNull();
		expect(dayRows).toHaveLength(1);
		expect(dayRows![0].time_period).toBe(`${year1}-${monthStr}-10`);
	});
});
