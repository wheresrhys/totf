/**
 * Integration tests for the `stats_cache_encounter_age_metrics` Postgres RPC
 * function (#1149).
 *
 * One of six small, read-only "metric-group" RPCs a later orchestrator (T8a,
 * `refresh_simple_stats_cache`) will call to populate the merged
 * `SimpleStatsCache` table (T1a). It collapses into one place the
 * ENCOUNTER-level age-bucket projection `core_stats` (the five
 * mutually-exclusive, exhaustive buckets) and `demographics_stats` (the
 * young-trends slices) each derive independently today, in a near-identical
 * `encounter_age_bucket_counts` CTE apiece — `juv_enc_count` and
 * `postjuv_enc_count` appear in BOTH with byte-identical definitions, so the
 * comparisons below against each caller are what actually verify the dedup.
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

/** The five mutually-exclusive, exhaustive encounter-level buckets, in core_stats' order. */
const BUCKET_COLUMNS = [
	'pullus_enc_count',
	'juv_enc_count',
	'postjuv_enc_count',
	'adult_enc_count',
	'unknown_age_enc_count'
] as const;

/** The three young-trends columns demographics_stats owns, plus the two it shares with core_stats. */
const DEMOGRAPHICS_COLUMNS = [
	'juv_enc_count',
	'postjuv_enc_count',
	'postjuv_juv_enc_count',
	'new_postjuv_juv_enc_count',
	'new_postjuv_enc_count'
] as const;

describe('stats_cache_encounter_age_metrics', () => {
	// A dedicated throwaway group rather than a shared seed group — a Sessions
	// row is keyed on (visit_date, ringing_group_id), and these dates are drawn
	// from the same narrow random-year range other RPC integration test files
	// also draw from, so an isolated group's unique id is the only collision-free
	// option (same reasoning as stats-cache-bird-age-metrics.test.ts).
	let fixtureGroupId: number;
	let fixtureClient: SupabaseClient;

	const locationIds: number[] = [];
	const sessionIds: number[] = [];
	const birdIds: number[] = [];

	let robinId: number;
	let wrenId: number;
	let yr: number;
	let march: string, may: string;

	beforeAll(async () => {
		const testSuffix = randomTestSuffix();
		fixtureGroupId = createIsolatedGroup(`StatsCacheEncAge ${testSuffix}`);
		fixtureClient = await getAuthenticatedSupabaseClientForGroup(fixtureGroupId);

		yr = 2080 + Math.floor(Math.random() * 18);
		march = `${yr}-03-10`;
		may = `${yr}-05-10`;

		robinId = await getSpeciesId('Robin');
		wrenId = await getSpeciesId('Wren');

		const locationId = await insertTestLocation(
			fixtureClient,
			fixtureGroupId,
			`StatsCacheEncAge Loc ${testSuffix}`
		);
		locationIds.push(locationId);

		const getSession = createSessionResolver();
		const nextRing = createRingNoSequence(`SCENCAGE-${testSuffix}`);

		/**
		 * Seeds one encounter on its own bird. Counts here are per ENCOUNTER, so
		 * one bird per encounter keeps the fixture's arithmetic readable and
		 * sidesteps the (bird_id, location_id, visit_date) uniqueness key.
		 */
		async function addEncounter(
			speciesId: number,
			date: string,
			ageCode: number,
			isJuv: boolean,
			recordType: string
		): Promise<void> {
			const birdId = await insertTestBird(fixtureClient, nextRing(), speciesId);
			birdIds.push(birdId);
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

		// March Robins — eight encounters chosen so every column below has a
		// DIFFERENT expected value from its neighbours, and so each young-trends
		// slice has a sibling that must NOT be counted:
		//   bucket counts:  pullus 1, juv 3, postjuv 2, adult 1, unknown 1 (sum 8)
		//   young trends:   postjuv_juv 2, new_postjuv_juv 1, new_postjuv 1
		await addEncounter(robinId, march, 1, false, 'N'); // pullus (1, not juv)
		await addEncounter(robinId, march, 1, true, 'R'); // juv via 1J — NOT postjuv_juv
		await addEncounter(robinId, march, 3, true, 'N'); // juv via 3J, postjuv_juv, new_postjuv_juv
		await addEncounter(robinId, march, 3, true, 'R'); // juv via 3J, postjuv_juv, not new
		await addEncounter(robinId, march, 3, false, 'N'); // postjuv, new_postjuv
		await addEncounter(robinId, march, 3, false, 'R'); // postjuv, not new
		await addEncounter(robinId, march, 4, false, 'N'); // adult
		await addEncounter(robinId, march, 2, false, 'R'); // unknown (even age_code)
		// A second Robin cell two months later, for the time-period-grouping shape.
		await addEncounter(robinId, may, 4, false, 'N'); // adult
		// A Wren, for the species-grouping shape.
		await addEncounter(wrenId, march, 3, true, 'N'); // juv via 3J, postjuv_juv, new_postjuv_juv
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

	/** Every encounter the fixture seeded for March, pooled (Robins + the Wren). */
	const marchFilters = () => ({
		ringing_group_filter: fixtureGroupId,
		from_date: `${yr}-03-01`,
		to_date: `${yr}-03-31`
	});

	/** Just the March Robins — the eight-encounter cell the bucket arithmetic is built on. */
	const marchRobinFilters = () => ({
		...marchFilters(),
		species_name_filter: 'Robin'
	});

	describe('core-shaped encounter age buckets', () => {
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

		it("matches core_stats' own pullus/juv/postjuv/adult/unknown_age_enc_count for identical filters", async () => {
			const filters = { ringing_group_filter: alphaId, group_by_species: true };
			const { data, error } = await alphaClient.rpc(
				'stats_cache_encounter_age_metrics',
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
					expect(num(row[column]), `${column} for "${speciesName}"`).toBe(
						num(coreRow![column])
					);
				}
			}
		});

		it("the 5 bucket counts sum to the cell's total encounter_count", async () => {
			// Monthly grouping, so the assertion covers populated cells and the
			// empty in-between months the dense month spine emits (0 = 0) alike.
			const filters = {
				ringing_group_filter: alphaId,
				species_name_filter: 'Robin',
				group_by_time_period: 'month'
			};
			const { data, error } = await alphaClient.rpc(
				'stats_cache_encounter_age_metrics',
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
				expect(
					coreRow,
					`no core_stats row for ${row.time_period}`
				).toBeDefined();
				const bucketSum = BUCKET_COLUMNS.reduce(
					(total, column) => total + num(row[column]),
					0
				);
				expect(bucketSum, `bucket sum for ${row.time_period}`).toBe(
					num(coreRow!.encounter_count)
				);
			}
		});

		it('places each age_code/is_juv combination in exactly one bucket', async () => {
			// The eight March Robins give every bucket a distinct count, so a
			// mis-scoped filter (e.g. 1J leaking into pullus, or bare age 3 into juv)
			// shows up as a wrong number rather than cancelling out.
			const { data, error } = await fixtureClient.rpc(
				'stats_cache_encounter_age_metrics',
				marchRobinFilters()
			);
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			expect(num(data![0].pullus_enc_count)).toBe(1);
			expect(num(data![0].juv_enc_count)).toBe(3);
			expect(num(data![0].postjuv_enc_count)).toBe(2);
			expect(num(data![0].adult_enc_count)).toBe(1);
			expect(num(data![0].unknown_age_enc_count)).toBe(1);
		});
	});

	describe('young-trends encounter counts', () => {
		it("matches demographics_stats' own postjuv_juv/new_postjuv_juv/new_postjuv_enc_count for identical filters", async () => {
			const alphaId = await getGroupIdByName('Alpha');
			const alphaClient = await getAuthenticatedSupabaseClientForGroup(alphaId);
			// demographics_stats' only real call shape (per-species monthly history).
			const filters = {
				ringing_group_filter: alphaId,
				species_name_filter: 'Robin',
				group_by_time_period: 'month'
			};
			const { data, error } = await alphaClient.rpc(
				'stats_cache_encounter_age_metrics',
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
				// juv/postjuv_enc_count are in this list too: they are the two columns
				// core_stats and demographics_stats each computed separately before the
				// merge, so asserting the single deduplicated column against BOTH
				// callers is what proves the dedup didn't change either one's answer.
				for (const column of DEMOGRAPHICS_COLUMNS) {
					expect(num(row[column]), `${column} for ${row.time_period}`).toBe(
						num(demographicsRow![column])
					);
				}
			}
		});

		it('counts only the age_code = 3 half of juv_enc_count in postjuv_juv_enc_count', async () => {
			// The March Robins hold three juv encounters — two 3J and one 1J — so a
			// postjuv_juv that wrongly took the whole juv bucket would read 3.
			const { data, error } = await fixtureClient.rpc(
				'stats_cache_encounter_age_metrics',
				marchRobinFilters()
			);
			expect(error).toBeNull();
			expect(num(data![0].juv_enc_count)).toBe(3);
			expect(num(data![0].postjuv_juv_enc_count)).toBe(2);
		});

		it("excludes non-'N' record types from new_postjuv_juv_enc_count and new_postjuv_enc_count", async () => {
			// Each of the two age-3 slices has exactly one 'N' and one 'R' encounter,
			// so both columns read 1 against a postjuv_juv of 2 and a postjuv of 2.
			const { data, error } = await fixtureClient.rpc(
				'stats_cache_encounter_age_metrics',
				marchRobinFilters()
			);
			expect(error).toBeNull();
			expect(num(data![0].new_postjuv_juv_enc_count)).toBe(1);
			expect(num(data![0].new_postjuv_enc_count)).toBe(1);
		});
	});

	describe('grouping shapes', () => {
		it('returns a single ungrouped row pooling every species and period', async () => {
			const { data, error } = await fixtureClient.rpc(
				'stats_cache_encounter_age_metrics',
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
			expect(num(row.pullus_enc_count)).toBe(1);
			// March's three Robin juvs plus the March Wren.
			expect(num(row.juv_enc_count)).toBe(4);
			expect(num(row.postjuv_enc_count)).toBe(2);
			// March's adult plus May's.
			expect(num(row.adult_enc_count)).toBe(2);
			expect(num(row.unknown_age_enc_count)).toBe(1);
			// Both Robin 3Js plus the Wren's.
			expect(num(row.postjuv_juv_enc_count)).toBe(3);
			expect(num(row.new_postjuv_juv_enc_count)).toBe(2);
			expect(num(row.new_postjuv_enc_count)).toBe(1);
		});

		it('returns one row per species when group_by_species is true', async () => {
			const { data, error } = await fixtureClient.rpc(
				'stats_cache_encounter_age_metrics',
				{ ...marchFilters(), group_by_species: true }
			);
			expect(error).toBeNull();
			expect(data).toHaveLength(2);
			const bySpecies = Object.fromEntries(
				data!.map((row) => [row.species_id, row])
			);
			expect(bySpecies[robinId].time_period).toBeNull();
			expect(num(bySpecies[robinId].juv_enc_count)).toBe(3);
			expect(num(bySpecies[robinId].adult_enc_count)).toBe(1);
			// The Wren's single 3J 'N' encounter is split out, not pooled with the Robins.
			expect(num(bySpecies[wrenId].juv_enc_count)).toBe(1);
			expect(num(bySpecies[wrenId].adult_enc_count)).toBe(0);
			expect(num(bySpecies[wrenId].new_postjuv_juv_enc_count)).toBe(1);
		});

		it('returns one row per month, empty months included, when group_by_time_period is "month"', async () => {
			const { data, error } = await fixtureClient.rpc(
				'stats_cache_encounter_age_metrics',
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
			expect(num(byMonth[`${yr}-03-01`].juv_enc_count)).toBe(3);
			expect(num(byMonth[`${yr}-03-01`].adult_enc_count)).toBe(1);
			// April has no encounters — the dense month spine still emits it, as
			// zeros rather than NULLs (unlike the biometrics metric group).
			for (const column of BUCKET_COLUMNS) {
				expect(num(byMonth[`${yr}-04-01`][column]), `April ${column}`).toBe(0);
			}
			expect(num(byMonth[`${yr}-04-01`].postjuv_juv_enc_count)).toBe(0);
			expect(num(byMonth[`${yr}-05-01`].adult_enc_count)).toBe(1);
		});
	});
});
