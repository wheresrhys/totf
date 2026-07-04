/**
 * Integration tests for Postgres RPC functions and cross-group RLS.
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
const ALPHA_TOTAL_ENCOUNTERS = 55;
const ALPHA_TOTAL_BIRDS = 45;
const ALPHA_SPECIES_COUNT = 4; // Blue Tit, Kingfisher, Reed Warbler, Robin
const CES_2022_ENCOUNTERS = 30; // Apr–Aug 2022 only

const ARRETRAP_ENCOUNTERS = 9;
const ARRETRAP_DATES = [
	'2021-06-20', '2022-04-30', '2022-06-15', '2022-08-10',
	'2022-10-20', '2023-05-12', '2023-07-08', '2023-09-14', '2024-05-10',
];
const ARRETRAP_PROVEN_AGE = 3;

describe('Postgres RPC integration tests', () => {
	let alphaId: number;
	let betaId: number;
	let gammaId: number;
	let alphaClient: SupabaseClient;
	let betaClient: SupabaseClient;
	let gammaClient: SupabaseClient;

	beforeAll(async () => {
		alphaId = await getGroupIdByName('Alpha');
		betaId = await getGroupIdByName('Beta');
		gammaId = await getGroupIdByName('Gamma');

		[alphaClient, betaClient, gammaClient] = await Promise.all([
			getAuthenticatedSupabaseClientForGroup(alphaId),
			getAuthenticatedSupabaseClientForGroup(betaId),
			getAuthenticatedSupabaseClientForGroup(gammaId),
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
			expect(row.encounter_count).toBe(31);
			expect(row.bird_count).toBe(23);
			expect(row.species_count).toBe(1);
		});

		it('date range Apr–Aug 2022 (CES months) returns fewer encounters than full dataset', async () => {
			const { data: cesOnly } = await alphaClient.rpc('aggregate_stats', {
				ringing_group_filter: alphaId,
				from_date: '2022-04-01',
				to_date: '2022-08-31',
			});
			expect(cesOnly![0].encounter_count).toBe(CES_2022_ENCOUNTERS);
		});

		it('group_by_species returns one row per species with correct counts', async () => {
			const { data, error } = await alphaClient.rpc('aggregate_stats', {
				ringing_group_filter: alphaId,
				group_by_species: true,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(ALPHA_SPECIES_COUNT);
			const sorted = data!.slice().sort((a, b) => a.species_name.localeCompare(b.species_name));
			expect(sorted.map((r) => ({ sp: r.species_name, enc: r.encounter_count, birds: r.bird_count }))).toEqual([
				{ sp: 'Blue Tit', enc: 7, birds: 6 },
				{ sp: 'Kingfisher', enc: 2, birds: 1 },
				{ sp: 'Reed Warbler', enc: 15, birds: 15 },
				{ sp: 'Robin', enc: 31, birds: 23 },
			]);
		});

		it('group_by_time_period=month returns one row per month (36 months Jun 2021–May 2024)', async () => {
			const { data, error } = await alphaClient.rpc('aggregate_stats', {
				ringing_group_filter: alphaId,
				group_by_time_period: 'month',
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(36);
			// Spot-check: Apr 2022 (busiest CES session) has 11 encounters
			const apr2022 = data!.find((r) => r.time_period === '2022-04-01');
			expect(apr2022!.encounter_count).toBe(11);
			// All time_periods are non-null
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
			expect(byYear).toEqual({ 2021: 1, 2022: 35, 2023: 15, 2024: 4 });
		});
	});

	describe('top_metrics_by_period', () => {
		it('temporal_unit=day metric_name=encounters returns top 5 busiest days', async () => {
			const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
				temporal_unit: 'day',
				metric_name: 'encounters',
				result_limit: 5,
				filters: { ringing_group_filter: alphaId },
			} as never);
			expect(error).toBeNull();
			expect(data).toHaveLength(5);
			// Tie at top: both 2022-06-15 and 2022-04-30 have 11 encounters
			const top2Dates = data!.slice(0, 2).map((r) => r.visit_date).sort();
			expect(top2Dates).toEqual(['2022-04-30', '2022-06-15']);
			expect(data![0].metric_value).toBe(11);
			expect(data![1].metric_value).toBe(11);
			expect(data![2]).toMatchObject({ visit_date: '2023-05-12', metric_value: 10 });
		});

		it('temporal_unit=month metric_name=species returns 9 months with species counts', async () => {
			const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
				temporal_unit: 'month',
				metric_name: 'species',
				result_limit: 10,
				filters: { ringing_group_filter: alphaId },
			} as never);
			expect(error).toBeNull();
			// 9 months with activity: Jun 2021, Apr/Jun/Aug/Oct 2022, May/Jul/Sep 2023, May 2024
			expect(data).toHaveLength(9);
			// Peak months (4 months had 3 species each)
			const peakCount = data!.filter((r) => r.metric_value === 3).length;
			expect(peakCount).toBe(4);
		});

		it('temporal_unit=year metric_name=individuals returns 4 years with correct individual counts', async () => {
			const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
				temporal_unit: 'year',
				metric_name: 'individuals',
				result_limit: 10,
				filters: { ringing_group_filter: alphaId },
			} as never);
			expect(error).toBeNull();
			expect(data).toHaveLength(4);
			const byYear = Object.fromEntries(
				data!.map((r) => [new Date(r.visit_date).getFullYear(), r.metric_value])
			);
			expect(byYear).toEqual({ 2021: 1, 2022: 31, 2023: 13, 2024: 4 });
		});
	});

	describe('top_metrics_by_species_and_period', () => {
		it('temporal_unit=day metric_name=encounters returns top 5 species+day combos', async () => {
			const { data, error } = await alphaClient.rpc('top_metrics_by_species_and_period', {
				temporal_unit: 'day',
				metric_name: 'encounters',
				result_limit: 5,
				filters: { ringing_group_filter: alphaId },
			} as never);
			expect(error).toBeNull();
			expect(data).toHaveLength(5);
			// Top entry: Robin on 2023-05-12 or 2022-04-30 (7 each, tied at top)
			const top2 = data!.slice(0, 2);
			expect(top2.every((r) => r.species_name === 'Robin' && r.metric_value === 7)).toBe(true);
		});

		it('temporal_unit=year metric_name=individuals returns 11 species-year rows', async () => {
			const { data, error } = await alphaClient.rpc('top_metrics_by_species_and_period', {
				temporal_unit: 'year',
				metric_name: 'individuals',
				result_limit: 20,
				filters: { ringing_group_filter: alphaId },
			} as never);
			expect(error).toBeNull();
			expect(data).toHaveLength(11);
			// Robin 2022 is the biggest: 17 individuals
			const robin2022 = data!.find(
				(r) => r.species_name === 'Robin' && new Date(r.visit_date).getFullYear() === 2022
			);
			expect(robin2022!.metric_value).toBe(17);
		});
	});

	describe('metrics_by_period_and_species', () => {
		it('temporal_unit=month returns 21 species-month rows', async () => {
			const { data, error } = await alphaClient.rpc('metrics_by_period_and_species', {
				temporal_unit: 'month',
				metric_name: 'encounters',
				filters: { ringing_group_filter: alphaId },
			} as never);
			expect(error).toBeNull();
			expect(data).toHaveLength(21);
			// Only month with 1 Robin before 2022 is Jun 2021
			const robin2021 = data!.find(
				(r) => r.species_name === 'Robin' && r.visit_date === '2021-06-01'
			);
			expect(robin2021!.metric_value).toBe(1);
			// Robin Apr 2022 had 7 encounters
			const robinApr2022 = data!.find(
				(r) => r.species_name === 'Robin' && r.visit_date === '2022-04-01'
			);
			expect(robinApr2022!.metric_value).toBe(7);
		});

		it('temporal_unit=year returns 11 species-year rows spanning 2021–2024', async () => {
			const { data, error } = await alphaClient.rpc('metrics_by_period_and_species', {
				temporal_unit: 'year',
				metric_name: 'encounters',
				filters: { ringing_group_filter: alphaId },
			} as never);
			expect(error).toBeNull();
			expect(data).toHaveLength(11);
			const years = [...new Set(data!.map((r) => new Date(r.visit_date).getFullYear()))].sort();
			expect(years).toEqual([2021, 2022, 2023, 2024]);
			// Robin 2022: 20 encounters
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
		it('default (significance_threshold=3) returns only ARRETRAP with all 9 encounters', async () => {
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

		it('min_proven_age=3 returns only ARRETRAP (proven_age=3)', async () => {
			const { data, error } = await alphaClient.rpc('notable_retraps', {
				ringing_group_filter: alphaId,
				min_proven_age: 3,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			expect(data![0]).toMatchObject({
				ring_no: 'ARRETRAP',
				encounter_count: ARRETRAP_ENCOUNTERS,
				proven_age: ARRETRAP_PROVEN_AGE,
			});
		});

		it('species_filter=Robin returns all 23 Robin birds with min_encounter_count=1', async () => {
			const { data, error } = await alphaClient.rpc('notable_retraps', {
				ringing_group_filter: alphaId,
				species_filter: 'Robin',
				min_encounter_count: 1,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(23);
			expect(data!.every((r) => r.species_name === 'Robin')).toBe(true);
			// ARRETRAP first (highest encounter count)
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
			// Order by discrepency_type for stable comparison (bird_id is seed-dependent)
			const rows = data!
				.map((r) => ({ ring_no: r.ring_no, type: r.discrepency_type }))
				.sort((a, b) => a.ring_no.localeCompare(b.ring_no) || a.type.localeCompare(b.type));
			expect(rows).toEqual([
				{ ring_no: 'ABTITMIS', type: 'age' },
				{ ring_no: 'ABTITMIS', type: 'sex' },
				{ ring_no: 'AKINGF001', type: 'age' },
				{ ring_no: 'ARRETRAP', type: 'age' },
				{ ring_no: 'ARRETRAP', type: 'wing_length' },
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

	describe('cross-group RLS', () => {
		it('beta client can read all 9 alpha sessions (share Alpha→Beta exists)', async () => {
			const { data, error } = await betaClient
				.from('Sessions')
				.select('id')
				.eq('ringing_group_id', alphaId);
			expect(error).toBeNull();
			expect(data).toHaveLength(ALPHA_SESSION_COUNT);
		});

		it('gamma client can read the 1 beta session (share Beta→Gamma exists)', async () => {
			const { data, error } = await gammaClient
				.from('Sessions')
				.select('id')
				.eq('ringing_group_id', betaId);
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
		});

		it('gamma client cannot read alpha sessions (transitivity blocked)', async () => {
			const { data, error } = await gammaClient
				.from('Sessions')
				.select('id')
				.eq('ringing_group_id', alphaId);
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});

		it('alpha client cannot read beta sessions (no reverse share)', async () => {
			const { data, error } = await alphaClient
				.from('Sessions')
				.select('id')
				.eq('ringing_group_id', betaId);
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});

		it('gamma own sessions are empty (gamma has no own data)', async () => {
			const { data, error } = await gammaClient
				.from('Sessions')
				.select('id')
				.eq('ringing_group_id', gammaId);
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});
	});
});
