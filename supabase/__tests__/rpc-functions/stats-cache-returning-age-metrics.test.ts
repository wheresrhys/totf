/**
 * Integration tests for the `stats_cache_returning_age_metrics` Postgres RPC
 * function (#1151).
 *
 * One of six small, read-only "metric-group" RPCs a later orchestrator calls to
 * populate a stats cache table — like #1150's `stats_cache_new_adult_metrics`,
 * this one feeds T8b's lifetime-relative `ComplexStatsCache` rather than T8a's
 * period-local `SimpleStatsCache`: each bird's returning-age bucket is a
 * period-relative proven age resolved over its entire group-scoped encounter
 * history, so a cell's answer can change on any future encounter and must
 * always be fully recomputed (T8b's job, not this RPC's).
 *
 * A direct port of `demographics_stats`' own `returning_age_counts` CTE (#843),
 * keyed on `species_id` rather than `species_name`, with every other
 * `demographics_stats` column dropped. The bucket resolution itself lives
 * entirely in `stats_bird_returning_age_bucket` (unchanged by this ticket) —
 * this RPC is nothing more than `GROUP BY (species_id, time_period) +
 * COUNT(*) FILTER` over that utility RPC's output, joined onto the spine so a
 * cell with no matching adult birds still appears with zero counts rather than
 * vanishing (mirroring every sibling in this RPC family).
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
import { addDays, randomFutureDate, randomTestSuffix } from '../test-isolation';
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

describe('stats_cache_returning_age_metrics', () => {
	describe('returning-age buckets', () => {
		it("matches demographics_stats' own returning_age_1/2/3_plus/new_unknown_age_bird_count for identical filters", async () => {
			// demographics_stats' own cross-check call shape (per-species monthly
			// history) — same convention stats-cache-new-adult-metrics.test.ts uses.
			// Alpha/Robin's seeded history has non-trivial returning-age data across
			// several monthly cells (verified against the real RPC output while
			// building this test), so this isn't a trivially-all-zero comparison.
			const alphaId = await getGroupIdByName('Alpha');
			const alphaClient = await getAuthenticatedSupabaseClientForGroup(alphaId);
			const filters = {
				ringing_group_filter: alphaId,
				species_name_filter: 'Robin',
				group_by_time_period: 'month'
			};
			const { data, error } = await alphaClient.rpc(
				'stats_cache_returning_age_metrics',
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

			// Sanity: the seed fixture must actually exercise non-trivial
			// returning-age data, or this test would pass vacuously on an
			// all-zero comparison.
			expect(
				demographicsResult.data!.some(
					(row) =>
						num(row.returning_age_1_bird_count) > 0 ||
						num(row.returning_age_2_bird_count) > 0 ||
						num(row.returning_age_3_plus_bird_count) > 0 ||
						num(row.returning_new_unknown_age_bird_count) > 0
				)
			).toBe(true);

			for (const row of data!) {
				const demographicsRow = demographicsResult.data!.find(
					(candidate) => candidate.time_period === row.time_period
				);
				expect(
					demographicsRow,
					`no demographics_stats row for ${row.time_period}`
				).toBeDefined();
				expect(
					num(row.returning_age_1_bird_count),
					`returning_age_1_bird_count for ${row.time_period}`
				).toBe(num(demographicsRow!.returning_age_1_bird_count));
				expect(
					num(row.returning_age_2_bird_count),
					`returning_age_2_bird_count for ${row.time_period}`
				).toBe(num(demographicsRow!.returning_age_2_bird_count));
				expect(
					num(row.returning_age_3_plus_bird_count),
					`returning_age_3_plus_bird_count for ${row.time_period}`
				).toBe(num(demographicsRow!.returning_age_3_plus_bird_count));
				expect(
					num(row.returning_new_unknown_age_bird_count),
					`returning_new_unknown_age_bird_count for ${row.time_period}`
				).toBe(num(demographicsRow!.returning_new_unknown_age_bird_count));
			}
		});

		// The ticket sketched this test around a cell holding a "proven-age-0"
		// adult (one not yet proven to have returned, so it would contribute to
		// adult_bird_count but land in none of the four buckets) to show the sum
		// coming out STRICTLY LESS than adult_bird_count. Verified empirically
		// against the real RPC/trigger behaviour instead of transcribing that as
		// given: a proven-age-0 adult is structurally unreachable through this
		// RPC's public surface. period_relative_proven_age is period_year minus
		// the smallest max_hatch_year across the bird's history up to and
		// including period_year, and trg_set_encounter_generated_fields only
		// ever derives max_hatch_year <= V - 1 for ANY encounter whose age_code
		// buckets as 'adult' (age_code > 3) in calendar year V — so an
		// adult-bucketed bird's proven age is always >= 1, even on its first-ever
		// encounter. supabase/CLAUDE.md's "Companion stats RPCs" section
		// documents this explicitly ("an adult-bucketed bird can never compute a
		// period-relative age of 0 ... the RPC's zero/NULL guard is defensive
		// only"), and demographics-stats.test.ts's own equivalent test
		// ("the four returning-age columns partition the adult cohort for a cell
		// holding one bird of each kind") asserts exact equality for the same
		// reason, not a strict inequality. So this test instead verifies the
		// reachable claim: a cell mixing several DIFFERENT buckets (a precise
		// age-1 returner, a precise age-3-plus returner, and a first-ever
		// imprecise new_unknown_age bird) sums to exactly adult_bird_count, with
		// no bird double-counted across buckets. A dedicated isolated group
		// (not a shared seed group) since all three birds' encounters land on
		// the same random far-future date/cell and must not collide with any
		// concurrently-running test.
		describe('mutual exclusivity over the adult cohort', () => {
			let groupId: number;
			let groupClient: SupabaseClient;
			const locationIds: number[] = [];
			const sessionIds: number[] = [];
			const birdIds: number[] = [];
			let cellDate: string;

			beforeAll(async () => {
				const testSuffix = randomTestSuffix();
				groupId = createIsolatedGroup(`Returning Age Partition ${testSuffix}`);
				groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);
				const base = randomFutureDate();
				cellDate = base;
				const year = parseInt(cellDate.slice(0, 4), 10);

				const { data: robin } = await supabase
					.from('Species')
					.select('id')
					.eq('species_name', 'Robin')
					.single();
				const robinId = robin!.id;

				const locId = await insertTestLocation(
					groupClient,
					groupId,
					`Returning Age Partition Loc ${testSuffix}`
				);
				locationIds.push(locId);

				const getSession = createSessionResolver();
				const nextRing = createRingNoSequence(`RETPART-${testSuffix}`);

				async function addBird(
					encounters: { date: string; age_code: number }[]
				): Promise<number> {
					const birdId = await insertTestBird(groupClient, nextRing(), robinId);
					birdIds.push(birdId);
					for (const e of encounters) {
						const sessionId = await getSession(
							groupClient,
							e.date,
							locId,
							sessionIds
						);
						await insertTestEncounter(groupClient, birdId, sessionId, {
							age_code: e.age_code,
							is_juv: false,
							record_type: 'R'
						});
					}
					return birdId;
				}

				// Precise returner, period-relative proven age 1.
				await addBird([
					{ date: `${year - 1}-05-10`, age_code: 3 },
					{ date: cellDate, age_code: 4 }
				]);
				// Precise returner, period-relative proven age 4 (buckets 3_plus).
				await addBird([
					{ date: `${year - 4}-05-10`, age_code: 3 },
					{ date: cellDate, age_code: 4 }
				]);
				// First-ever imprecise encounter computing an apparent age of 1 —
				// the new_unknown_age carve-out.
				await addBird([{ date: cellDate, age_code: 4 }]);
			});

			afterAll(() => {
				psql(
					`DELETE FROM "Encounters" WHERE bird_id IN (${birdIds.join(', ')});` +
						`DELETE FROM "Birds" WHERE id IN (${birdIds.join(', ')});` +
						`DELETE FROM "Sessions" WHERE id IN (${sessionIds.join(', ')});` +
						`DELETE FROM "Locations" WHERE id IN (${locationIds.join(', ')});`
				);
				psql(`DELETE FROM "RingingGroups" WHERE id = ${groupId};`);
			});

			it('the four buckets are mutually exclusive over the adult cohort, summing to adult_bird_count for a cell with one bird of each reachable kind', async () => {
				const { data, error } = await groupClient.rpc(
					'stats_cache_returning_age_metrics',
					{
						ringing_group_filter: groupId,
						from_date: cellDate,
						to_date: cellDate
					}
				);
				expect(error).toBeNull();
				expect(data).toHaveLength(1);
				const row = data![0];

				const { data: demographicsData, error: demographicsError } =
					await groupClient.rpc('demographics_stats', {
						ringing_group_filter: groupId,
						from_date: cellDate,
						to_date: cellDate
					});
				expect(demographicsError).toBeNull();
				expect(demographicsData).toHaveLength(1);
				const adultBirdCount = num(demographicsData![0].adult_bird_count);

				expect(adultBirdCount).toBe(3);
				expect(num(row.returning_age_1_bird_count)).toBe(1);
				expect(num(row.returning_age_2_bird_count)).toBe(0);
				expect(num(row.returning_age_3_plus_bird_count)).toBe(1);
				expect(num(row.returning_new_unknown_age_bird_count)).toBe(1);
				const sum =
					num(row.returning_age_1_bird_count) +
					num(row.returning_age_2_bird_count) +
					num(row.returning_age_3_plus_bird_count) +
					num(row.returning_new_unknown_age_bird_count);
				expect(sum).toBeLessThanOrEqual(adultBirdCount);
				expect(sum).toBe(adultBirdCount);
			});
		});
	});

	// The narrow carve-out stats_bird_returning_age_bucket.sql's header documents:
	// a bird's very first-ever encounter, coded imprecisely (even age_code, so
	// min_hatch_year = 0), computing an apparent period-relative proven age of
	// exactly 1, is a coding artefact rather than evidence of return — it lands
	// in 'new_unknown_age', not '1'. Deliberately narrow: the same pattern
	// computing age 2 is NOT carved out. Same fixture shape as
	// demographics-stats.test.ts's own returning-age-buckets block, ported here
	// since this RPC wraps the same utility RPC and must reproduce the same
	// classification.
	describe('the new_unknown_age narrow carve-out', () => {
		let deltaId: number;
		let deltaClient: SupabaseClient;
		const locationIds: number[] = [];
		const sessionIds: number[] = [];
		const birdIds: number[] = [];

		let newImpreciseDate: string; // first-ever imprecise encounter, age 1
		let newImprecise2Date: string; // first-ever imprecise encounter, age 2

		beforeAll(async () => {
			deltaId = await getGroupIdByName('Delta');
			deltaClient = await getAuthenticatedSupabaseClientForGroup(deltaId);

			const testSuffix = randomTestSuffix();
			const base = randomFutureDate();

			const { data: robin } = await supabase
				.from('Species')
				.select('id')
				.eq('species_name', 'Robin')
				.single();
			const robinId = robin!.id;

			const deltaLocId = await insertTestLocation(
				deltaClient,
				deltaId,
				`New Unknown Age Delta Loc ${testSuffix}`
			);
			locationIds.push(deltaLocId);

			const getSession = createSessionResolver();
			const nextRing = createRingNoSequence(`NEWUNK-${testSuffix}`);

			async function addBird(enc: {
				date: string;
				age_code: number;
				is_juv: boolean;
			}): Promise<number> {
				const birdId = await insertTestBird(deltaClient, nextRing(), robinId);
				birdIds.push(birdId);
				const sessionId = await getSession(
					deltaClient,
					enc.date,
					deltaLocId,
					sessionIds
				);
				await insertTestEncounter(deltaClient, birdId, sessionId, {
					age_code: enc.age_code,
					is_juv: enc.is_juv,
					record_type: 'R'
				});
				return birdId;
			}

			// First-ever encounter, imprecise (age_code 4, min_hatch_year 0),
			// computing an apparent age of 1 — the carve-out case.
			newImpreciseDate = addDays(base, 0);
			await addBird({ date: newImpreciseDate, age_code: 4, is_juv: false });

			// First-ever encounter, imprecise (age_code 6), computing an age of
			// 2 — deliberately NOT carved out.
			newImprecise2Date = addDays(base, 20);
			await addBird({ date: newImprecise2Date, age_code: 6, is_juv: false });
		});

		afterAll(() => {
			psql(
				`DELETE FROM "Encounters" WHERE bird_id IN (${birdIds.join(', ')});` +
					`DELETE FROM "Birds" WHERE id IN (${birdIds.join(', ')});` +
					`DELETE FROM "Sessions" WHERE id IN (${sessionIds.join(', ')});` +
					`DELETE FROM "Locations" WHERE id IN (${locationIds.join(', ')});`
			);
		});

		async function returningAgeRow(date: string) {
			const { data, error } = await deltaClient.rpc(
				'stats_cache_returning_age_metrics',
				{
					ringing_group_filter: deltaId,
					from_date: date,
					to_date: date
				}
			);
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			return data![0];
		}

		it('a single first-ever imprecise encounter computing age 1 lands in new_unknown_age, not 1', async () => {
			const row = await returningAgeRow(newImpreciseDate);
			expect(num(row.returning_age_1_bird_count)).toBe(0);
			expect(num(row.returning_new_unknown_age_bird_count)).toBe(1);
		});

		it('the same imprecise-encounter pattern computing age 2 lands in 2 as an accepted quirk', async () => {
			const row = await returningAgeRow(newImprecise2Date);
			expect(num(row.returning_age_2_bird_count)).toBe(1);
			expect(num(row.returning_new_unknown_age_bird_count)).toBe(0);
		});
	});

	// Tripwire for a gross performance regression, not a benchmark. This RPC
	// wraps stats_bird_returning_age_bucket, the single most perf-sensitive
	// utility RPC in the whole stats_cache_*/demographics_stats/core_stats
	// family (see that function's header for the #932 "merge the streams"
	// rewrite and its 2026-09-20 plan-stability fix) — a regression that
	// reintroduces a bad join/estimate against its output would blow this bound
	// wide open on a group-wide monthly shape. No existing wall-clock/
	// multi-execution timing-bound test pattern was found anywhere in
	// supabase/__tests__/ to copy (confirmed while building this ticket), so
	// this is a new one. LANGUAGE sql STABLE (not plpgsql), so the
	// generic-plan-cliff that motivates `force_custom_plan` on the plpgsql
	// orchestrators doesn't apply here — this guards against a different class
	// of regression (a mis-plannable join reintroduced into the aggregation).
	describe('performance', () => {
		it('completes within a generous bound across repeated calls on one pooled connection', async () => {
			const alphaId = await getGroupIdByName('Alpha');
			const alphaClient = await getAuthenticatedSupabaseClientForGroup(alphaId);
			const filters = {
				ringing_group_filter: alphaId,
				group_by_species: true,
				group_by_time_period: 'month'
			};

			for (let i = 0; i < 10; i++) {
				const start = Date.now();
				const { error } = await alphaClient.rpc(
					'stats_cache_returning_age_metrics',
					filters
				);
				const elapsedMs = Date.now() - start;
				expect(error).toBeNull();
				// Deliberately loose — a tripwire for a gross regression (e.g. a
				// reintroduced bad-row-estimate join), not a benchmark pinning
				// normal variance.
				expect(elapsedMs).toBeLessThan(5000);
			}
		});
	});
});
