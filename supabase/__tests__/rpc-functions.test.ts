/**
 * Integration tests for Postgres RPC functions.
 *
 * Requires local Supabase running and e2e seed data loaded:
 *   npm run db:start:local
 *   npm run db:seed:e2e
 *
 * Run with: npm run test:integration
 */

import { describe, it, beforeAll, expect } from 'vitest';
import { getAuthenticatedSupabaseClientForGroup } from '../../lib/group-auth';
import { supabase } from '../../lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

async function getGroupIdByName(name: string): Promise<number> {
	const { data, error } = await supabase
		.from('RingingGroups')
		.select('id')
		.eq('group_name', name)
		.single();
	if (error || !data) throw new Error(`Group "${name}" not found — run npm run db:seed:e2e first`);
	return data.id;
}

// Seed has 9 Alpha sessions: 2021-06-20, 2022-04-30, 2022-06-15, 2022-08-10,
// 2022-10-20, 2023-05-12, 2023-07-08, 2023-09-14, 2024-05-10
const ALPHA_SESSION_COUNT = 9;
const ALPHA_TOTAL_ENCOUNTERS = 57;
const ALPHA_TOTAL_BIRDS = 46;
const ALPHA_SPECIES_COUNT = 5; // Blue Tit, Kingfisher, Reed Warbler, Robin, Wren
const CES_2022_ENCOUNTERS = 30; // Apr–Aug 2022 only

// Per-species aggregates for Alpha — reused across multiple tests
const PER_SPECIES_AGGREGATES = {
	'Blue Tit':     { encounter_count: 7,  bird_count: 6  },
	'Kingfisher':   { encounter_count: 2,  bird_count: 1  },
	'Reed Warbler': { encounter_count: 15, bird_count: 15 },
	'Robin':        { encounter_count: 31, bird_count: 23 },
	'Wren':         { encounter_count: 2,  bird_count: 1  },
} as const;

const ARRETRAP_ENCOUNTERS = 9;
const ARRETRAP_DATES = [
	'2021-06-20', '2022-04-30', '2022-06-15', '2022-08-10',
	'2022-10-20', '2023-05-12', '2023-07-08', '2023-09-14', '2024-05-10',
];
const ARRETRAP_PROVEN_AGE = 3;

describe('Postgres RPC integration tests', () => {
	let alphaId: number;
	let betaId: number;
	let alphaClient: SupabaseClient;
	let betaClient: SupabaseClient;

	beforeAll(async () => {
		alphaId = await getGroupIdByName('Alpha');
		betaId = await getGroupIdByName('Beta');

		[alphaClient, betaClient] = await Promise.all([
			getAuthenticatedSupabaseClientForGroup(alphaId),
			getAuthenticatedSupabaseClientForGroup(betaId),
		]);
	});

	describe('aggregate_stats', () => {
		it('no filters returns total aggregate across all alpha data', async () => {
			const { data, error } = await alphaClient.rpc('aggregate_stats', {
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			const row = data![0];
			expect(row.species_name).toBeNull();
			expect(row.time_period).toBeNull();
			expect(row.session_count).toBe(ALPHA_SESSION_COUNT);
			expect(row.encounter_count).toBe(ALPHA_TOTAL_ENCOUNTERS);
			expect(row.bird_count).toBe(ALPHA_TOTAL_BIRDS);
			expect(row.species_count).toBe(ALPHA_SPECIES_COUNT);
		});

		it('species_name_filter=Robin returns single Robin aggregate', async () => {
			const { data, error } = await alphaClient.rpc('aggregate_stats', {
				ringing_group_filter: alphaId,
				species_name_filter: 'Robin',
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			const row = data![0];
			expect(row.encounter_count).toBe(PER_SPECIES_AGGREGATES['Robin'].encounter_count);
			expect(row.bird_count).toBe(PER_SPECIES_AGGREGATES['Robin'].bird_count);
			expect(row.species_count).toBe(1);
		});

		it('date range Apr–Aug 2022 (CES months) returns 30 encounters', async () => {
			const { data, error } = await alphaClient.rpc('aggregate_stats', {
				ringing_group_filter: alphaId,
				from_date: '2022-04-01',
				to_date: '2022-08-31',
			});
			expect(error).toBeNull();
			expect(data![0].encounter_count).toBe(CES_2022_ENCOUNTERS);
		});

		it('group_by_species returns one row per species with correct counts', async () => {
			const { data, error } = await alphaClient.rpc('aggregate_stats', {
				ringing_group_filter: alphaId,
				group_by_species: true,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(ALPHA_SPECIES_COUNT);
			const sorted = data!.slice().sort((a, b) => a.species_name.localeCompare(b.species_name));
			expect(
				sorted.map((r) => ({ sp: r.species_name, enc: r.encounter_count, birds: r.bird_count }))
			).toEqual(
				Object.entries(PER_SPECIES_AGGREGATES)
					.sort(([a], [b]) => a.localeCompare(b))
					.map(([sp, { encounter_count, bird_count }]) => ({ sp, enc: encounter_count, birds: bird_count }))
			);
		});

		it('group_by_time_period=month returns one row per month (36 months Jun 2021–May 2024)', async () => {
			const { data, error } = await alphaClient.rpc('aggregate_stats', {
				ringing_group_filter: alphaId,
				group_by_time_period: 'month',
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(36);
			const apr2022 = data!.find((r) => r.time_period === '2022-04-01');
			expect(apr2022!.encounter_count).toBe(11);
			expect(data!.every((r) => r.time_period !== null)).toBe(true);
		});

		it('group_by_time_period=year returns one row per year with correct totals', async () => {
			const { data, error } = await alphaClient.rpc('aggregate_stats', {
				ringing_group_filter: alphaId,
				group_by_time_period: 'year',
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(4);
			const byYear = Object.fromEntries(
				data!.map((r) => [new Date(r.time_period).getFullYear(), r.encounter_count])
			);
			expect(byYear).toEqual({ 2021: 2, 2022: 35, 2023: 15, 2024: 5 });
		});
	});

	describe('top_metrics_by_period', () => {
		// Default params used unless overridden within a describe block:
		//   metric_name='encounters', result_limit=3, temporal_unit='day'

		describe('temporal_unit parameter', () => {
			it('day groups results by individual session date', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
					temporal_unit: 'day',
					metric_name: 'encounters',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				expect(data).toHaveLength(3);
				// Top 2 days tie at 11 encounters (secondary sort: visit_date DESC → 2022-06-15 wins)
				expect(data![0]).toEqual({ visit_date: '2022-06-15', metric_value: 11 });
				expect(data![1]).toEqual({ visit_date: '2022-04-30', metric_value: 11 });
				expect(data![2]).toEqual({ visit_date: '2023-05-12', metric_value: 10 });
			});

			it('month aggregates results into calendar months', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
					temporal_unit: 'month',
					metric_name: 'encounters',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				expect(data).toHaveLength(3);
				expect(data![0]).toEqual({ visit_date: '2022-06-01', metric_value: 11 });
				expect(data![1]).toEqual({ visit_date: '2022-04-01', metric_value: 11 });
				expect(data![2]).toEqual({ visit_date: '2023-05-01', metric_value: 10 });
			});

			it('year aggregates results into calendar years', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
					temporal_unit: 'year',
					metric_name: 'encounters',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				expect(data).toHaveLength(3);
				expect(data![0]).toEqual({ visit_date: '2022-01-01', metric_value: 35 });
				expect(data![1]).toEqual({ visit_date: '2023-01-01', metric_value: 15 });
				expect(data![2]).toEqual({ visit_date: '2024-01-01', metric_value: 5 });
			});
		});

		describe('metric_name parameter', () => {
			it('encounters counts all encounter records per day', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
					temporal_unit: 'day',
					metric_name: 'encounters',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				expect(data![0]).toEqual({ visit_date: '2022-06-15', metric_value: 11 });
			});

			it('individuals counts distinct rings per day', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
					temporal_unit: 'day',
					metric_name: 'individuals',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				// Each bird is caught once per session in seed data → same as encounters
				expect(data![0]).toEqual({ visit_date: '2022-06-15', metric_value: 11 });
			});

			it('species counts distinct species present per day', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
					temporal_unit: 'day',
					metric_name: 'species',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				// Several days had 3 species; tie broken by visit_date DESC
				expect(data![0].metric_value).toBe(3);
				expect(data!.every((r) => r.metric_value === 3)).toBe(true);
			});
		});

		describe('result_limit parameter', () => {
			it('result_limit=1 returns only the single top result', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
					temporal_unit: 'day',
					metric_name: 'encounters',
					result_limit: 1,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				expect(data).toHaveLength(1);
				expect(data![0]).toEqual({ visit_date: '2022-06-15', metric_value: 11 });
			});

			it('result_limit=3 returns top 3 results', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
					temporal_unit: 'day',
					metric_name: 'encounters',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				expect(data).toHaveLength(3);
			});
		});
	});

	describe('top_metrics_by_species_and_period', () => {
		// Default params: metric_name='encounters', result_limit=3, temporal_unit='day'

		describe('temporal_unit parameter', () => {
			it('day groups results by individual session date', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_species_and_period', {
					temporal_unit: 'day',
					metric_name: 'encounters',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				expect(data).toHaveLength(3);
				expect(data![0]).toEqual({ species_name: 'Robin', visit_date: '2023-05-12', metric_value: 7 });
				expect(data![1]).toEqual({ species_name: 'Robin', visit_date: '2022-04-30', metric_value: 7 });
				expect(data![2]).toEqual({ species_name: 'Robin', visit_date: '2022-06-15', metric_value: 6 });
			});

			it('month aggregates results into calendar months', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_species_and_period', {
					temporal_unit: 'month',
					metric_name: 'encounters',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				expect(data).toHaveLength(3);
				expect(data![0]).toEqual({ species_name: 'Robin', visit_date: '2023-05-01', metric_value: 7 });
				expect(data![1]).toEqual({ species_name: 'Robin', visit_date: '2022-04-01', metric_value: 7 });
				expect(data![2]).toEqual({ species_name: 'Robin', visit_date: '2022-06-01', metric_value: 6 });
			});

			it('year aggregates results into calendar years', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_species_and_period', {
					temporal_unit: 'year',
					metric_name: 'encounters',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				expect(data).toHaveLength(3);
				expect(data![0]).toEqual({ species_name: 'Robin', visit_date: '2022-01-01', metric_value: 20 });
				expect(data![1]).toEqual({ species_name: 'Robin', visit_date: '2023-01-01', metric_value: 9 });
				expect(data![2]).toEqual({ species_name: 'Reed Warbler', visit_date: '2022-01-01', metric_value: 8 });
			});
		});

		describe('metric_name parameter', () => {
			it('encounters counts all encounter records per species per day', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_species_and_period', {
					temporal_unit: 'day',
					metric_name: 'encounters',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				expect(data![0]).toEqual({ species_name: 'Robin', visit_date: '2023-05-12', metric_value: 7 });
			});

			it('individuals counts distinct rings per species per day', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_species_and_period', {
					temporal_unit: 'day',
					metric_name: 'individuals',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				// Each bird is caught once per session in seed data → same as encounters
				expect(data![0]).toEqual({ species_name: 'Robin', visit_date: '2023-05-12', metric_value: 7 });
			});
		});

		describe('result_limit parameter', () => {
			it('result_limit=1 returns only the top result', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_species_and_period', {
					temporal_unit: 'day',
					metric_name: 'encounters',
					result_limit: 1,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				expect(data).toHaveLength(1);
				expect(data![0]).toEqual({ species_name: 'Robin', visit_date: '2023-05-12', metric_value: 7 });
			});

			it('result_limit=3 returns top 3 results', async () => {
				const { data, error } = await alphaClient.rpc('top_metrics_by_species_and_period', {
					temporal_unit: 'day',
					metric_name: 'encounters',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId },
				} as never);
				expect(error).toBeNull();
				expect(data).toHaveLength(3);
			});
		});
	});

	describe('metrics_by_period_and_species', () => {
		it('temporal_unit=month returns 23 species-month rows', async () => {
			const { data, error } = await alphaClient.rpc('metrics_by_period_and_species', {
				temporal_unit: 'month',
				metric_name: 'encounters',
				filters: { ringing_group_filter: alphaId },
			} as never);
			expect(error).toBeNull();
			expect(data).toHaveLength(23);
			const robin2021 = data!.find(
				(r) => r.species_name === 'Robin' && r.visit_date === '2021-06-01'
			);
			expect(robin2021!.metric_value).toBe(1);
			const robinApr2022 = data!.find(
				(r) => r.species_name === 'Robin' && r.visit_date === '2022-04-01'
			);
			expect(robinApr2022!.metric_value).toBe(7);
		});

		it('temporal_unit=year returns 13 species-year rows spanning 2021–2024', async () => {
			const { data, error } = await alphaClient.rpc('metrics_by_period_and_species', {
				temporal_unit: 'year',
				metric_name: 'encounters',
				filters: { ringing_group_filter: alphaId },
			} as never);
			expect(error).toBeNull();
			expect(data).toHaveLength(13);
			const years = [...new Set(data!.map((r) => new Date(r.visit_date).getFullYear()))].sort();
			expect(years).toEqual([2021, 2022, 2023, 2024]);
			const robin2022 = data!.find(
				(r) => r.species_name === 'Robin' && new Date(r.visit_date).getFullYear() === 2022
			);
			expect(robin2022!.metric_value).toBe(20);
		});
	});

	describe('fuzzy_search_rings', () => {
		it('exact match returns ring with closeness_score 0 and correct species', async () => {
			const { data, error } = await alphaClient.rpc('fuzzy_search_rings', { q: 'ARRETRAP' });
			expect(error).toBeNull();
			expect(data).toEqual([{ ring_no: 'ARRETRAP', closeness_score: 0, species_name: 'Robin' }]);
		});

		it('off-by-one match returns ARRETRAP with closeness_score 1', async () => {
			const { data, error } = await alphaClient.rpc('fuzzy_search_rings', { q: 'ARRETR' });
			expect(error).toBeNull();
			// ARRETR is 2 chars shorter → levenshtein=2, score = 2 - 0.5*(8-6) = 1
			const match = data!.find((r) => r.ring_no === 'ARRETRAP');
			expect(match).toBeDefined();
			expect(match!.closeness_score).toBe(1);
		});

		it('no match returns empty array', async () => {
			const { data, error } = await alphaClient.rpc('fuzzy_search_rings', { q: 'ZZZZZZZZZ' });
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});
	});

	describe('most_caught_birds', () => {
		describe('significance_threshold parameter', () => {
			it('default threshold=3 returns only ARRETRAP (only bird with ≥3 encounters)', async () => {
				const { data, error } = await alphaClient.rpc('most_caught_birds', {
					ringing_group_filter: alphaId,
				});
				expect(error).toBeNull();
				expect(data).toHaveLength(1);
				expect(data![0]).toMatchObject({
					species_name: 'Robin',
					ring_no: 'ARRETRAP',
					encounter_count: ARRETRAP_ENCOUNTERS,
					encounter_dates: ARRETRAP_DATES,
				});
			});

			it('threshold=1 returns all 46 birds with at least 1 encounter', async () => {
				const { data, error } = await alphaClient.rpc('most_caught_birds', {
					ringing_group_filter: alphaId,
					significance_threshold: 1,
				});
				expect(error).toBeNull();
				expect(data).toHaveLength(ALPHA_TOTAL_BIRDS);
				expect(data![0].ring_no).toBe('ARRETRAP');
			});

			it('threshold=10 returns no birds (max encounters is 9 for ARRETRAP)', async () => {
				const { data, error } = await alphaClient.rpc('most_caught_birds', {
					ringing_group_filter: alphaId,
					significance_threshold: 10,
				});
				expect(error).toBeNull();
				expect(data).toHaveLength(0);
			});
		});

		it('species_filter=Robin returns only ARRETRAP (only Robin with ≥3 encounters)', async () => {
			const { data, error } = await alphaClient.rpc('most_caught_birds', {
				ringing_group_filter: alphaId,
				species_filter: 'Robin',
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			expect(data![0].ring_no).toBe('ARRETRAP');
		});

		it('year_filter=2022 returns ARRETRAP with exactly 4 encounters in 2022', async () => {
			const { data, error } = await alphaClient.rpc('most_caught_birds', {
				ringing_group_filter: alphaId,
				year_filter: 2022,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			expect(data![0]).toMatchObject({
				ring_no: 'ARRETRAP',
				encounter_count: 4,
				encounter_dates: ['2022-04-30', '2022-06-15', '2022-08-10', '2022-10-20'],
			});
		});

		it('max_per_species=1 returns at most 1 row per species (ARRETRAP is only result)', async () => {
			const { data, error } = await alphaClient.rpc('most_caught_birds', {
				ringing_group_filter: alphaId,
				max_per_species: 1,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			expect(data![0].ring_no).toBe('ARRETRAP');
		});
	});

	describe('notable_retraps', () => {
		it('min_encounter_count=6 returns only ARRETRAP (9 encounters)', async () => {
			const { data, error } = await alphaClient.rpc('notable_retraps', {
				ringing_group_filter: alphaId,
				min_encounter_count: 6,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			expect(data![0]).toMatchObject({
				species_name: 'Robin',
				ring_no: 'ARRETRAP',
				encounter_count: ARRETRAP_ENCOUNTERS,
				encounter_dates: ARRETRAP_DATES,
				proven_age: ARRETRAP_PROVEN_AGE,
			});
		});

		it('min_proven_age=3 returns ARRETRAP and the long-absence Wren (both proven_age=3)', async () => {
			// AWREN001 was ringed as a juvenile in 2021 and recaught in 2024, so it is
			// also a proven-age-3 bird. Ordered by encounter_count DESC → ARRETRAP first.
			const { data, error } = await alphaClient.rpc('notable_retraps', {
				ringing_group_filter: alphaId,
				min_proven_age: 3,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(2);
			expect(data![0]).toMatchObject({
				ring_no: 'ARRETRAP',
				encounter_count: ARRETRAP_ENCOUNTERS,
				proven_age: ARRETRAP_PROVEN_AGE,
			});
			expect(data![1]).toMatchObject({
				ring_no: 'AWREN001',
				species_name: 'Wren',
				encounter_count: 2,
				proven_age: 3,
			});
		});

		it('species_filter=Robin returns all 23 Robin birds with min_encounter_count=1', async () => {
			const { data, error } = await alphaClient.rpc('notable_retraps', {
				ringing_group_filter: alphaId,
				species_filter: 'Robin',
				min_encounter_count: 1,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(PER_SPECIES_AGGREGATES['Robin'].bird_count);
			expect(data!.every((r) => r.species_name === 'Robin')).toBe(true);
			expect(data![0].ring_no).toBe('ARRETRAP');
		});

		it('min_encounter_count=100 returns no birds', async () => {
			const { data, error } = await alphaClient.rpc('notable_retraps', {
				ringing_group_filter: alphaId,
				min_encounter_count: 100,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});
	});

	describe('find_discrepencies', () => {
		it('alpha group returns 5 discrepancy rows across 3 birds', async () => {
			const { data, error } = await alphaClient.rpc('find_discrepencies', {
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			const rows = data!
				.map((r) => ({ ring_no: r.ring_no, type: r.discrepency_type }))
				.sort((a, b) => a.ring_no.localeCompare(b.ring_no) || a.type.localeCompare(b.type));
			expect(rows).toEqual([
				{ ring_no: 'ABTITMIS',  type: 'age' },
				{ ring_no: 'ABTITMIS',  type: 'sex' },
				{ ring_no: 'AKINGF001', type: 'age' },
				{ ring_no: 'ARRETRAP',  type: 'age' },
				{ ring_no: 'ARRETRAP',  type: 'wing_length' },
			]);
		});

		it('beta group returns empty (clean data, no discrepancies)', async () => {
			const { data, error } = await betaClient.rpc('find_discrepencies', {
				ringing_group_filter: betaId,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});
	});

	describe('long_absence_retraps', () => {
		// Seed: AWREN001 (Wren) was ringed on 2021-06-20 and only recaught on
		// 2024-05-10 — a 1055-day gap, the sole ≥730-day retrap in the seed.
		it('returns the long-absence bird with correct previous_date and gap_days', async () => {
			const { data, error } = await alphaClient.rpc('long_absence_retraps', {
				session_date: '2024-05-10',
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			expect(data).toEqual([
				{
					ring_no: 'AWREN001',
					species_name: 'Wren',
					previous_date: '2021-06-20',
					gap_days: 1055,
				},
			]);
		});

		it('excludes retraps with gaps under min_gap_days', async () => {
			// On 2024-05-10, ARRETRAP was last seen 2023-09-14 (239 days) — under the
			// 730-day default, so only the Wren (1055 days) qualifies.
			const { data, error } = await alphaClient.rpc('long_absence_retraps', {
				session_date: '2024-05-10',
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			expect(data!.map((r) => r.ring_no)).toEqual(['AWREN001']);
		});

		it('excludes birds ringed for the first time this session', async () => {
			// 2021-06-20 is the group's first session: every bird is newly ringed,
			// so none has a prior visit to compare against.
			const { data, error } = await alphaClient.rpc('long_absence_retraps', {
				session_date: '2021-06-20',
				ringing_group_filter: alphaId,
				min_gap_days: 1,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});

		it('honours a custom min_gap_days', async () => {
			// Lowering the threshold to 200 days lets ARRETRAP (239 days) through
			// alongside the Wren, ordered by gap_days DESC.
			const { data, error } = await alphaClient.rpc('long_absence_retraps', {
				session_date: '2024-05-10',
				ringing_group_filter: alphaId,
				min_gap_days: 200,
			});
			expect(error).toBeNull();
			expect(data!.map((r) => ({ ring_no: r.ring_no, gap_days: r.gap_days }))).toEqual([
				{ ring_no: 'AWREN001', gap_days: 1055 },
				{ ring_no: 'ARRETRAP', gap_days: 239 },
			]);
		});

		it('returns empty for a date with no session', async () => {
			const { data, error } = await alphaClient.rpc('long_absence_retraps', {
				session_date: '2099-01-01',
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});
	});

	describe('session_weight_extremes', () => {
		// Seed Alpha weights (weighed encounters, per species and date):
		//   Robin — prior to 2023-05-12 the heaviest was 20.5 (AR0008, 2022-06-15);
		//     on 2023-05-12 AR0018 = 21.0 beats it, and 21 prior weighed encounters
		//     comfortably clear the default min_prior_weighed of 3.
		//   Reed Warbler — prior to 2022-08-10 min 11.0 (2022-06-15) / max 12.0
		//     (2022-06-15) over 4 weighed encounters; on 2022-08-10 ARWRBL006 = 11.0
		//     ties the lightest and ARWRBL007 = 12.1 beats the heaviest.
		it('returns a heaviest record beating the prior max with enough prior weights', async () => {
			const { data, error } = await alphaClient.rpc('session_weight_extremes', {
				session_date: '2023-05-12',
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			expect(data).toEqual([
				{
					species_name: 'Robin',
					ring_no: 'AR0018',
					weight: 21,
					extreme_type: 'heaviest',
					previous_extreme: 20.5,
					previous_extreme_date: '2022-06-15',
				},
			]);
		});

		it('excludes species with fewer than min_prior_weighed prior weighed encounters', async () => {
			// On 2022-04-30 the only prior weighed encounter is ARRETRAP (Robin, 18.5,
			// 2021-06-20) — a single prior weight, below the default min of 3 — so no
			// species qualifies for a comparison.
			const { data, error } = await alphaClient.rpc('session_weight_extremes', {
				session_date: '2022-04-30',
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});

		it('returns ties with previous_extreme and previous_extreme_date populated', async () => {
			const { data, error } = await alphaClient.rpc('session_weight_extremes', {
				session_date: '2022-08-10',
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			expect(data).toEqual([
				{
					species_name: 'Reed Warbler',
					ring_no: 'ARWRBL007',
					weight: 12.1,
					extreme_type: 'heaviest',
					previous_extreme: 12,
					previous_extreme_date: '2022-06-15',
				},
				{
					species_name: 'Reed Warbler',
					ring_no: 'ARWRBL006',
					weight: 11,
					extreme_type: 'lightest',
					previous_extreme: 11,
					previous_extreme_date: '2022-06-15',
				},
			]);
		});

		it('returns lightest extreme and one row per species when min_prior_weighed=1', async () => {
			// On 2022-04-30 the sole prior weight is ARRETRAP (Robin, 18.5, 2021-06-20).
			// With min_prior_weighed=1 the Robins beat it both ways: AR0003 (20.0) is the
			// heaviest and AR0002 (16.8) the lightest — one row per (species, extreme).
			const { data, error } = await alphaClient.rpc('session_weight_extremes', {
				session_date: '2022-04-30',
				ringing_group_filter: alphaId,
				min_prior_weighed: 1,
			});
			expect(error).toBeNull();
			expect(data).toEqual([
				{
					species_name: 'Robin',
					ring_no: 'AR0003',
					weight: 20,
					extreme_type: 'heaviest',
					previous_extreme: 18.5,
					previous_extreme_date: '2021-06-20',
				},
				{
					species_name: 'Robin',
					ring_no: 'AR0002',
					weight: 16.8,
					extreme_type: 'lightest',
					previous_extreme: 18.5,
					previous_extreme_date: '2021-06-20',
				},
			]);
		});

		it('returns empty for a date with no session', async () => {
			const { data, error } = await alphaClient.rpc('session_weight_extremes', {
				session_date: '2099-01-01',
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});
	});
});
