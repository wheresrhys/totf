/**
 * Integration tests for the `stats_cache_bird_age_metrics` Postgres RPC
 * function (#1148).
 *
 * One of six small, read-only "metric-group" RPCs a later orchestrator (T8a,
 * `refresh_simple_stats_cache`) will call to populate the merged
 * `SimpleStatsCache` table (T1a). It collapses into one place the bird-level
 * age-bucket projection `core_stats` (the five mutually-exclusive, exhaustive
 * buckets) and `demographics_stats` (`new_young_bird_count`) each derive
 * independently today — both off the one shared `stats_bird_age_bucket` utility
 * RPC, which owns the precedence rules this RPC must not reimplement.
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

/** The five mutually-exclusive, exhaustive bird-level buckets, in core_stats' order. */
const BUCKET_COLUMNS = [
	'pullus_bird_count',
	'juv_bird_count',
	'postjuv_bird_count',
	'adult_bird_count',
	'unknown_age_bird_count'
] as const;

describe('stats_cache_bird_age_metrics', () => {
	// A dedicated throwaway group rather than a shared seed group — a Sessions
	// row is keyed on (visit_date, ringing_group_id), and these dates are drawn
	// from the same narrow random-year range other RPC integration test files
	// also draw from, so an isolated group's unique id is the only collision-free
	// option (same reasoning as stats-cache-biometrics-metrics.test.ts).
	let fixtureGroupId: number;
	let fixtureClient: SupabaseClient;

	const locationIds: number[] = [];
	const sessionIds: number[] = [];
	const birdIds: number[] = [];

	let robinId: number;
	let wrenId: number;
	let yr: number;
	let marEarly: string, marLate: string, may: string;

	beforeAll(async () => {
		const testSuffix = randomTestSuffix();
		fixtureGroupId = createIsolatedGroup(`StatsCacheBirdAge ${testSuffix}`);
		fixtureClient = await getAuthenticatedSupabaseClientForGroup(fixtureGroupId);

		yr = 2080 + Math.floor(Math.random() * 18);
		marEarly = `${yr}-03-10`;
		marLate = `${yr}-03-20`;
		may = `${yr}-05-10`;

		robinId = await getSpeciesId('Robin');
		wrenId = await getSpeciesId('Wren');

		const locationId = await insertTestLocation(
			fixtureClient,
			fixtureGroupId,
			`StatsCacheBirdAge Loc ${testSuffix}`
		);
		locationIds.push(locationId);

		const getSession = createSessionResolver();
		const nextRing = createRingNoSequence(`SCBIRDAGE-${testSuffix}`);

		/**
		 * Seeds one bird and its encounters. `encounters` is a list of
		 * [date, age_code, is_juv, record_type] tuples — the four fields the
		 * bucket/`has_new` resolution actually reads.
		 */
		async function addBird(
			speciesId: number,
			encounters: [string, number, boolean, string][]
		): Promise<void> {
			const birdId = await insertTestBird(fixtureClient, nextRing(), speciesId);
			birdIds.push(birdId);
			for (const [date, ageCode, isJuv, recordType] of encounters) {
				const sessionId = await getSession(
					fixtureClient,
					date,
					locationId,
					sessionIds
				);
				await insertTestEncounter(fixtureClient, birdId, sessionId, {
					age_code: ageCode,
					is_juv: isJuv,
					record_type: recordType
				});
			}
		}

		// March Robins — one bird per bucket, so each of the five counts is 1 and
		// any cross-contamination between them shows up as an off-by-one.
		// pullusThenAdultN carries BOTH precedence evidence (pullus beats the
		// conflicting adult reading) and the new_young independence case (its only
		// 'N' encounter is the adult-aged one, not the pullus-aged one).
		await addBird(robinId, [
			[marEarly, 1, false, 'R'],
			[marLate, 4, false, 'N']
		]); // pullusThenAdultN -> pullus, has_new
		await addBird(robinId, [[marEarly, 3, true, 'N']]); // juvNew -> juv, has_new
		await addBird(robinId, [[marEarly, 3, false, 'R']]); // postjuvRetrap -> postjuv
		await addBird(robinId, [[marEarly, 4, false, 'N']]); // adultNew -> adult, has_new (not young)
		await addBird(robinId, [[marEarly, 2, false, 'R']]); // unknownAge -> unknown
		// A second Robin cell two months later, for the month-grouping shape.
		await addBird(robinId, [[may, 4, false, 'N']]); // mayAdult -> adult
		// A Wren, for the species-grouping shape.
		await addBird(wrenId, [[marEarly, 3, true, 'N']]); // wrenJuv -> juv, has_new
	});

	afterAll(() => {
		execSync(
			`psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c '` +
				`DELETE FROM "Encounters" WHERE bird_id IN (${birdIds.join(', ')});` +
				`DELETE FROM "Birds" WHERE id IN (${birdIds.join(', ')});` +
				`DELETE FROM "Sessions" WHERE id IN (${sessionIds.join(', ')});` +
				`DELETE FROM "Locations" WHERE id IN (${locationIds.join(', ')});'`
		);
		psql(`DELETE FROM "RingingGroups" WHERE id = ${fixtureGroupId};`);
	});

	describe('bird-level age buckets', () => {
		let alphaId: number;
		let alphaClient: SupabaseClient;
		let speciesNameById: Map<number, string>;

		beforeAll(async () => {
			alphaId = await getGroupIdByName('Alpha');
			alphaClient = await getAuthenticatedSupabaseClientForGroup(alphaId);
			const { data } = await supabase.from('Species').select('id, species_name');
			speciesNameById = new Map(
				data!.map((species) => [species.id, species.species_name])
			);
		});

		it("matches core_stats' own pullus/juv/postjuv/adult/unknown_age_bird_count for identical filters", async () => {
			const filters = { ringing_group_filter: alphaId, group_by_species: true };
			const { data, error } = await alphaClient.rpc(
				'stats_cache_bird_age_metrics',
				filters
			);
			expect(error).toBeNull();
			const coreResult = await alphaClient.rpc('core_stats', filters);
			expect(coreResult.error).toBeNull();
			// Spine-driven on both sides, so the cell sets line up row-for-row.
			expect(data).toHaveLength(coreResult.data!.length);
			expect(data!.length).toBeGreaterThan(0);

			for (const row of data!) {
				const speciesName = speciesNameById.get(row.species_id!);
				const coreRow = coreResult.data!.find(
					(candidate) => candidate.species_name === speciesName
				);
				expect(coreRow, `no core_stats row for "${speciesName}"`).toBeDefined();
				for (const column of BUCKET_COLUMNS) {
					expect(
						num(row[column]),
						`${column} for "${speciesName}"`
					).toBe(num(coreRow![column]));
				}
			}
		});

		it("the 5 bucket counts sum to the cell's total bird_count", async () => {
			// Monthly grouping, so the assertion covers populated cells and the
			// empty in-between months the dense month spine emits (0 = 0) alike.
			const filters = {
				ringing_group_filter: alphaId,
				species_name_filter: 'Robin',
				group_by_time_period: 'month'
			};
			const { data, error } = await alphaClient.rpc(
				'stats_cache_bird_age_metrics',
				filters
			);
			expect(error).toBeNull();
			const coreResult = await alphaClient.rpc('core_stats', filters);
			expect(coreResult.error).toBeNull();
			expect(data!.length).toBeGreaterThan(0);

			for (const row of data!) {
				const coreRow = coreResult.data!.find(
					(candidate) => candidate.time_period === row.time_period
				);
				expect(coreRow, `no core_stats row for ${row.time_period}`).toBeDefined();
				const bucketSum = BUCKET_COLUMNS.reduce(
					(total, column) => total + num(row[column]),
					0
				);
				expect(bucketSum, `bucket sum for ${row.time_period}`).toBe(
					num(coreRow!.bird_count)
				);
			}
		});

		it('resolves a bird with conflicting pullus and adult readings as pullus and nothing else', async () => {
			// pullusThenAdultN has a pullus-aged March encounter and an adult-aged
			// one in the same monthly cell. stats_bird_age_bucket's precedence rule
			// (pullus always wins) must leave it in pullus_bird_count only — the
			// March cell holds exactly one bird per bucket, so a leak into
			// adult/unknown would show as a 2.
			const { data, error } = await fixtureClient.rpc(
				'stats_cache_bird_age_metrics',
				{
					ringing_group_filter: fixtureGroupId,
					species_name_filter: 'Robin',
					from_date: `${yr}-03-01`,
					to_date: `${yr}-03-31`
				}
			);
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			expect(num(data![0].pullus_bird_count)).toBe(1);
			expect(num(data![0].juv_bird_count)).toBe(1);
			expect(num(data![0].postjuv_bird_count)).toBe(1);
			expect(num(data![0].adult_bird_count)).toBe(1);
			expect(num(data![0].unknown_age_bird_count)).toBe(1);
		});
	});

	describe('new_young_bird_count', () => {
		it("matches demographics_stats' own value for identical filters", async () => {
			const alphaId = await getGroupIdByName('Alpha');
			const alphaClient = await getAuthenticatedSupabaseClientForGroup(alphaId);
			// demographics_stats' only real call shape (per-species monthly history).
			const filters = {
				ringing_group_filter: alphaId,
				species_name_filter: 'Robin',
				group_by_time_period: 'month'
			};
			const { data, error } = await alphaClient.rpc(
				'stats_cache_bird_age_metrics',
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
					num(row.new_young_bird_count),
					`new_young_bird_count for ${row.time_period}`
				).toBe(num(demographicsRow!.new_young_bird_count));
			}
		});

		it("counts a young-bucket bird whose only 'N' encounter is the one that is NOT its young-bucket evidence", async () => {
			// March Robins: pullusThenAdultN (pullus bucket from its 'R' encounter,
			// has_new from its separate adult-aged 'N' encounter) and juvNew (juv
			// bucket and 'N' on the same encounter) both count; adultNew is 'N' but
			// not young, and postjuvRetrap is young but has no 'N'.
			const { data, error } = await fixtureClient.rpc(
				'stats_cache_bird_age_metrics',
				{
					ringing_group_filter: fixtureGroupId,
					species_name_filter: 'Robin',
					from_date: `${yr}-03-01`,
					to_date: `${yr}-03-31`
				}
			);
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			expect(num(data![0].new_young_bird_count)).toBe(2);
		});
	});

	describe('grouping shapes', () => {
		it('returns one row per species when group_by_species is true', async () => {
			const { data, error } = await fixtureClient.rpc(
				'stats_cache_bird_age_metrics',
				{
					ringing_group_filter: fixtureGroupId,
					from_date: `${yr}-03-01`,
					to_date: `${yr}-03-31`,
					group_by_species: true
				}
			);
			expect(error).toBeNull();
			expect(data).toHaveLength(2);
			const bySpecies = Object.fromEntries(
				data!.map((row) => [row.species_id, row])
			);
			expect(bySpecies[robinId].time_period).toBeNull();
			expect(num(bySpecies[robinId].pullus_bird_count)).toBe(1);
			expect(num(bySpecies[robinId].adult_bird_count)).toBe(1);
			// The Wren's single juv 'N' encounter is split out, not pooled with the Robins.
			expect(num(bySpecies[wrenId].juv_bird_count)).toBe(1);
			expect(num(bySpecies[wrenId].adult_bird_count)).toBe(0);
			expect(num(bySpecies[wrenId].new_young_bird_count)).toBe(1);
		});

		it('returns one row per month, empty months included, when group_by_time_period is "month"', async () => {
			const { data, error } = await fixtureClient.rpc(
				'stats_cache_bird_age_metrics',
				{
					ringing_group_filter: fixtureGroupId,
					species_name_filter: 'Robin',
					from_date: `${yr}-03-01`,
					to_date: `${yr}-05-31`,
					group_by_time_period: 'month'
				}
			);
			expect(error).toBeNull();
			expect(data).toHaveLength(3);
			const byMonth = Object.fromEntries(
				data!.map((row) => [row.time_period, row])
			);
			expect(num(byMonth[`${yr}-03-01`].pullus_bird_count)).toBe(1);
			expect(num(byMonth[`${yr}-03-01`].adult_bird_count)).toBe(1);
			// April has no encounters — the dense month spine still emits it, as
			// zeros rather than NULLs (unlike the biometrics metric group).
			for (const column of BUCKET_COLUMNS) {
				expect(num(byMonth[`${yr}-04-01`][column]), `April ${column}`).toBe(0);
			}
			expect(num(byMonth[`${yr}-04-01`].new_young_bird_count)).toBe(0);
			expect(num(byMonth[`${yr}-05-01`].adult_bird_count)).toBe(1);
		});

		it('returns a single ungrouped row pooling every species and period', async () => {
			const { data, error } = await fixtureClient.rpc(
				'stats_cache_bird_age_metrics',
				{
					ringing_group_filter: fixtureGroupId,
					from_date: `${yr}-03-01`,
					to_date: `${yr}-05-31`
				}
			);
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			const row = data![0];
			expect(row.species_id).toBeNull();
			expect(row.time_period).toBeNull();
			expect(num(row.pullus_bird_count)).toBe(1);
			// Both the March Robin juv and the March Wren juv.
			expect(num(row.juv_bird_count)).toBe(2);
			expect(num(row.postjuv_bird_count)).toBe(1);
			// March's adult plus May's.
			expect(num(row.adult_bird_count)).toBe(2);
			expect(num(row.unknown_age_bird_count)).toBe(1);
			// pullusThenAdultN, juvNew and wrenJuv.
			expect(num(row.new_young_bird_count)).toBe(3);
		});
	});
});
