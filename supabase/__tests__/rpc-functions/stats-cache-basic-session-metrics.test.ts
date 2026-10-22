/**
 * Integration tests for the `stats_cache_basic_session_metrics` Postgres RPC
 * function (#1146).
 *
 * One of six small, read-only "metric-group" RPCs a later orchestrator (T8a,
 * `refresh_simple_stats_cache`) will call to populate the merged
 * `SimpleStatsCache` table (T1a). A direct port of `core_stats`' basic-count
 * and session/effort CTE chain, keyed on `species_id` rather than the
 * display-oriented `species_name` and carrying none of `core_stats`'
 * age-dimension columns.
 *
 * Because it is a port, the first two describe blocks assert equivalence
 * against the real `core_stats` RPC rather than hand-rolled literal expected
 * rows: the seed data is already the baseline `core_stats`' own suite is
 * pinned against, and any divergence is by definition a port bug. The two
 * regression tests that follow do use purpose-built datasets, because the
 * behaviours they pin (#1049, #1021/#1024) are precisely the ones a careless
 * port silently loses.
 *
 * Requires local Supabase running and e2e seed data loaded:
 *   npm run db:start:local
 *   npm run db:seed:e2e
 *
 * Run with: npm run test:integration
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { getAuthenticatedSupabaseClientForGroup } from '../../../app/lib/auth/group-auth';
import { supabase } from '../../../lib/supabase';
import { randomTestSuffix, randomFutureDate, addDays } from '../test-isolation';
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

/** The four basic-count columns both RPCs share, by name. */
const BASIC_COUNT_COLUMNS = [
	'species_count',
	'bird_count',
	'encounter_count',
	'new_bird_count'
] as const;

/** The seven session/effort columns both RPCs share, by name. */
const SESSION_EFFORT_COLUMNS = [
	'session_count',
	'total_effort',
	'effort_per_session',
	'effort_per_encounter',
	'avg_encounters_per_session',
	'max_per_session',
	'max_new_per_session'
] as const;

type SharedColumn =
	| (typeof BASIC_COUNT_COLUMNS)[number]
	| (typeof SESSION_EFFORT_COLUMNS)[number];

/**
 * The slice of a `core_stats` / `stats_cache_basic_session_metrics` row the
 * cross-RPC comparison below reads. Both generated row types carry every
 * `SharedColumn`, so each widens to this directly — no double cast needed, and
 * the two differing identity columns (`species_name` vs `species_id`) are
 * resolved to a common cell key before a row is ever stored as one of these.
 */
type SharedColumnRow = Record<SharedColumn, unknown>;

describe('stats_cache_basic_session_metrics', () => {
	let alphaId: number;
	let alphaClient: SupabaseClient;
	/** species_name -> species_id, to bridge core_stats' key to this RPC's. */
	let speciesIdByName: Map<string, number>;

	beforeAll(async () => {
		alphaId = await getGroupIdByName('Alpha');
		alphaClient = await getAuthenticatedSupabaseClientForGroup(alphaId);

		const { data, error } = await supabase
			.from('Species')
			.select('id, species_name');
		if (error) throw error;
		speciesIdByName = new Map(
			data!.map((species) => [species.species_name, species.id])
		);
	});

	/**
	 * Calls `core_stats` and `stats_cache_basic_session_metrics` with one
	 * identical argument set and returns both results keyed on the same
	 * `(species_id, time_period)` cell identity — core_stats' `species_name`
	 * resolved to its id so the two key spaces line up.
	 */
	async function callBothKeyedByCell(
		args: Record<string, unknown>
	): Promise<{
		coreByCell: Map<string, SharedColumnRow>;
		cacheByCell: Map<string, SharedColumnRow>;
	}> {
		const [coreResult, cacheResult] = await Promise.all([
			alphaClient.rpc('core_stats', { ringing_group_filter: alphaId, ...args }),
			alphaClient.rpc('stats_cache_basic_session_metrics', {
				ringing_group_filter: alphaId,
				...args
			})
		]);
		expect(coreResult.error).toBeNull();
		expect(cacheResult.error).toBeNull();

		const cellKey = (speciesId: number | null, timePeriod: string | null) =>
			`${speciesId ?? 'all'}|${timePeriod ?? 'all'}`;

		const coreByCell = new Map(
			coreResult.data!.map((row) => {
				let speciesId: number | null = null;
				if (row.species_name !== null) {
					speciesId = speciesIdByName.get(row.species_name) ?? null;
					expect(
						speciesId,
						`core_stats returned unknown species "${row.species_name}"`
					).not.toBeNull();
				}
				return [
					cellKey(speciesId, row.time_period),
					row as SharedColumnRow
				] as const;
			})
		);
		const cacheByCell = new Map(
			cacheResult.data!.map(
				(row) =>
					[cellKey(row.species_id, row.time_period), row as SharedColumnRow] as const
			)
		);
		return { coreByCell, cacheByCell };
	}

	/** Asserts the named columns agree cell-for-cell between the two RPCs. */
	async function expectColumnsMatchCoreStats(
		args: Record<string, unknown>,
		columns: readonly SharedColumn[]
	): Promise<void> {
		const { coreByCell, cacheByCell } = await callBothKeyedByCell(args);
		expect(cacheByCell.size).toBe(coreByCell.size);
		expect(cacheByCell.size).toBeGreaterThan(0);

		for (const [cell, coreRow] of coreByCell) {
			const cacheRow = cacheByCell.get(cell);
			expect(cacheRow, `no stats_cache row for cell ${cell}`).toBeDefined();
			for (const column of columns) {
				const coreValue = coreRow[column];
				const cacheValue = cacheRow![column];
				if (typeof coreValue === 'string') {
					expect(cacheValue, `${column} @ ${cell}`).toBe(coreValue);
				} else {
					expect(num(cacheValue), `${column} @ ${cell}`).toBeCloseTo(
						num(coreValue),
						6
					);
				}
			}
		}
	}

	describe('basic counts', () => {
		it("matches core_stats' own species_count/bird_count/encounter_count/new_bird_count for identical filters", async () => {
			// Grouped per species AND per month — the shape that exercises both the
			// spine join and the COALESCE-to-0 path for empty cells, since Alpha's
			// dense monthly spine carries far more cells than it has encounters.
			await expectColumnsMatchCoreStats(
				{ group_by_species: true, group_by_time_period: 'month' },
				BASIC_COUNT_COLUMNS
			);
		});
	});

	describe('session/effort metrics', () => {
		it("matches core_stats' own session_count/total_effort/effort_per_session/effort_per_encounter/avg_encounters_per_session/max_per_session/max_new_per_session for identical filters", async () => {
			await expectColumnsMatchCoreStats(
				{ group_by_species: true, group_by_time_period: 'month' },
				SESSION_EFFORT_COLUMNS
			);
		});

		// The `session_counts` CTE must group by species only when the caller asked
		// for a per-species breakdown. Grouping by a bare species_id regardless
		// (#1049) makes a group-wide call's max_per_session ("Busiest session"),
		// max_new_per_session and avg_encounters_per_session describe the busiest/
		// average SPECIES WITHIN a session rather than the session itself — prod's
		// /summary/sep reported 39, its biggest single species, for a 2026 whose
		// busiest session held 62 birds. Two mixed-species group-days separate the
		// two readings: no single species accounts for a whole session, and a
		// species-split average divides by a different denominator.
		describe('honouring group_by_species in session_counts (the #1049 regression)', () => {
			let groupId: number;
			let groupClient: SupabaseClient;
			const locationIds: number[] = [];
			const sessionIds: number[] = [];
			const birdIds: number[] = [];
			// 5 encounters over two species (3 Robin, 2 Wren), 4 of them new. Its
			// biggest single species is 3, whose new count is 3.
			let busiestDate: string;
			// 2 encounters, both Robin, both new.
			let quieterDate: string;

			beforeAll(async () => {
				const testSuffix = randomTestSuffix();
				groupId = createIsolatedGroup(
					`StatsCacheBasicSession GroupBySpecies ${testSuffix}`
				);
				groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);

				busiestDate = randomFutureDate();
				quieterDate = addDays(busiestDate, 1);

				const robinId = speciesIdByName.get('Robin')!;
				const wrenId = speciesIdByName.get('Wren')!;

				const locationId = await insertTestLocation(
					groupClient,
					groupId,
					`StatsCacheBasicSession GBS Loc ${testSuffix}`
				);
				locationIds.push(locationId);

				const getSession = createSessionResolver();
				const nextRing = createRingNoSequence(`SCBSGBS-${testSuffix}`);
				async function addBird(
					speciesId: number,
					date: string,
					recordType: string
				): Promise<void> {
					const birdId = await insertTestBird(
						groupClient,
						nextRing(),
						speciesId
					);
					birdIds.push(birdId);
					const sessionId = await getSession(
						groupClient,
						date,
						locationId,
						sessionIds
					);
					await insertTestEncounter(groupClient, birdId, sessionId, {
						age_code: 4,
						record_type: recordType
					});
				}

				await addBird(robinId, busiestDate, 'N');
				await addBird(robinId, busiestDate, 'N');
				await addBird(robinId, busiestDate, 'N');
				await addBird(wrenId, busiestDate, 'N');
				await addBird(wrenId, busiestDate, 'R');
				await addBird(robinId, quieterDate, 'N');
				await addBird(robinId, quieterDate, 'N');
			});

			afterAll(() => {
				psql(
					`DELETE FROM "Encounters" WHERE bird_id IN (${birdIds.join(', ')});` +
						`DELETE FROM "Birds" WHERE id IN (${birdIds.join(', ')});` +
						`DELETE FROM "Sessions" WHERE id IN (${sessionIds.join(', ')});` +
						`DELETE FROM "Locations" WHERE id IN (${locationIds.join(', ')});` +
						`DELETE FROM "RingingGroups" WHERE id = ${groupId};`
				);
			});

			it('describes the busiest SESSION, not the busiest species within it, on a group-wide call', async () => {
				const { data, error } = await groupClient.rpc(
					'stats_cache_basic_session_metrics',
					{
						ringing_group_filter: groupId,
						from_date: busiestDate,
						to_date: quieterDate
					}
				);
				expect(error).toBeNull();
				expect(data).toHaveLength(1);
				const row = data![0];
				expect(row.species_id).toBeNull();
				// 5, not the 3 a bare species_id grouping would report.
				expect(num(row.max_per_session)).toBe(5);
				// 4, not 3.
				expect(num(row.max_new_per_session)).toBe(4);
				// (5 + 2) / 2, not (3 + 2 + 2) / 3.
				expect(num(row.avg_encounters_per_session)).toBeCloseTo(3.5, 6);
			});

			it('still describes the busiest species-within-a-session when group_by_species is true', async () => {
				const { data, error } = await groupClient.rpc(
					'stats_cache_basic_session_metrics',
					{
						ringing_group_filter: groupId,
						from_date: busiestDate,
						to_date: quieterDate,
						group_by_species: true
					}
				);
				expect(error).toBeNull();
				expect(data).toHaveLength(2);
				const bySpecies = new Map(data!.map((row) => [row.species_id, row]));
				const robin = bySpecies.get(speciesIdByName.get('Robin')!)!;
				const wren = bySpecies.get(speciesIdByName.get('Wren')!)!;
				// Robin: 3 on the busiest date, 2 on the quieter one.
				expect(num(robin.max_per_session)).toBe(3);
				expect(num(robin.avg_encounters_per_session)).toBeCloseTo(2.5, 6);
				// Wren: 2 on the busiest date only, 1 of them new.
				expect(num(wren.max_per_session)).toBe(2);
				expect(num(wren.max_new_per_session)).toBe(1);
			});
		});

		// session_effort/effort_per_period carry no session-type-equivalent filter
		// (#1021/#1024): Sessions.session_type is gone, and stats_raw_encounters'
		// record_type exclusion (#874) is the only thing deciding what counts as
		// real data. So a nestling-only group-day contributes its real effort span
		// like any other session, while a resighting-only date contributes nothing
		// at all — for the row-level #874 reason, not a session-type one.
		describe('session-type-blind effort (the #1021/#1024 behaviour)', () => {
			let groupId: number;
			let groupClient: SupabaseClient;
			const locationIds: number[] = [];
			const sessionIds: number[] = [];
			const birdIds: number[] = [];
			// Two nestling (age_code 1) captures, 09:00 and 13:00.
			let pulliOnlyDate: string;
			// One resighting-record_type encounter and nothing else.
			let fieldObservationOnlyDate: string;

			beforeAll(async () => {
				const testSuffix = randomTestSuffix();
				groupId = createIsolatedGroup(
					`StatsCacheBasicSession Effort ${testSuffix}`
				);
				groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);

				pulliOnlyDate = randomFutureDate();
				fieldObservationOnlyDate = addDays(pulliOnlyDate, 1);

				const robinId = speciesIdByName.get('Robin')!;

				const locationId = await insertTestLocation(
					groupClient,
					groupId,
					`StatsCacheBasicSession Effort Loc ${testSuffix}`
				);
				locationIds.push(locationId);

				const getSession = createSessionResolver();
				const nextRing = createRingNoSequence(`SCBSEFF-${testSuffix}`);
				async function addBird(
					date: string,
					fields: { age_code: number; record_type: string; capture_time: string }
				): Promise<void> {
					const birdId = await insertTestBird(groupClient, nextRing(), robinId);
					birdIds.push(birdId);
					const sessionId = await getSession(
						groupClient,
						date,
						locationId,
						sessionIds
					);
					await insertTestEncounter(groupClient, birdId, sessionId, fields);
				}

				await addBird(pulliOnlyDate, {
					age_code: 1,
					record_type: 'N',
					capture_time: '09:00:00'
				});
				await addBird(pulliOnlyDate, {
					age_code: 1,
					record_type: 'N',
					capture_time: '13:00:00'
				});
				await addBird(fieldObservationOnlyDate, {
					age_code: 4,
					record_type: 'U',
					capture_time: '10:00:00'
				});
			});

			afterAll(() => {
				psql(
					`DELETE FROM "Encounters" WHERE bird_id IN (${birdIds.join(', ')});` +
						`DELETE FROM "Birds" WHERE id IN (${birdIds.join(', ')});` +
						`DELETE FROM "Sessions" WHERE id IN (${sessionIds.join(', ')});` +
						`DELETE FROM "Locations" WHERE id IN (${locationIds.join(', ')});` +
						`DELETE FROM "RingingGroups" WHERE id = ${groupId};`
				);
			});

			it('gives a pulli-only session its real effort span, and leaves a field-observation-only date out entirely', async () => {
				const { data, error } = await groupClient.rpc(
					'stats_cache_basic_session_metrics',
					{
						ringing_group_filter: groupId,
						from_date: pulliOnlyDate,
						to_date: fieldObservationOnlyDate
					}
				);
				expect(error).toBeNull();
				expect(data).toHaveLength(1);
				const row = data![0];
				// Only the nestling date counts — the resighting-only date has no
				// in-hand encounter for stats_raw_encounters to surface (#874).
				expect(num(row.session_count)).toBe(1);
				expect(num(row.encounter_count)).toBe(2);
				// 09:00 to 13:00, well above the two-hour minimum-effort floor. Before
				// #1021/#1024 this date would have reported zero effort.
				expect(row.total_effort).toBe('04:00:00');
				expect(row.effort_per_session).toBe('04:00:00');
				expect(row.effort_per_encounter).toBe('02:00:00');
				expect(num(row.max_per_session)).toBe(2);
				expect(num(row.max_new_per_session)).toBe(2);
				expect(num(row.avg_encounters_per_session)).toBe(2);
			});
		});
	});

	// Thin shape-level smoke tests: the heavy per-column logic is already pinned
	// against core_stats above, so these assert only that each grouping mode
	// produces the SAME SET OF CELLS core_stats produces — i.e. that the
	// species_id/time_period projection and the spine join are wired up per mode.
	describe('grouping shapes', () => {
		async function expectSameCellsAsCoreStats(
			args: Record<string, unknown>
		): Promise<string[]> {
			const { coreByCell, cacheByCell } = await callBothKeyedByCell(args);
			expect([...cacheByCell.keys()].sort()).toEqual(
				[...coreByCell.keys()].sort()
			);
			return [...cacheByCell.keys()];
		}

		it('ungrouped', async () => {
			const cells = await expectSameCellsAsCoreStats({});
			expect(cells).toEqual(['all|all']);
		});

		it('grouped per species', async () => {
			const cells = await expectSameCellsAsCoreStats({
				group_by_species: true
			});
			expect(cells.every((cell) => cell.endsWith('|all'))).toBe(true);
			expect(cells.length).toBeGreaterThan(1);
		});

		it('grouped per day', async () => {
			const cells = await expectSameCellsAsCoreStats({
				group_by_time_period: 'day'
			});
			expect(cells.every((cell) => cell.startsWith('all|'))).toBe(true);
		});

		it('grouped per month', async () => {
			const cells = await expectSameCellsAsCoreStats({
				group_by_time_period: 'month'
			});
			// The month spine is dense, so it carries more cells than the sparse day
			// spine does.
			expect(cells.length).toBeGreaterThan(1);
		});

		it('grouped per year', async () => {
			await expectSameCellsAsCoreStats({ group_by_time_period: 'year' });
		});

		it('grouped per month-squashed', async () => {
			const cells = await expectSameCellsAsCoreStats({
				group_by_time_period: 'month-squashed'
			});
			// Always exactly twelve year-agnostic month buckets (#996).
			expect(cells).toHaveLength(12);
		});
	});
});
