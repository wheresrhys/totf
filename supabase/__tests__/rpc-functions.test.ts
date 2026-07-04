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
		it('no filters returns aggregate across all alpha species', async () => {
			const { data, error } = await alphaClient.rpc('aggregate_stats', {
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			const row = data![0];
			expect(row.species_name).toBeNull();
			expect(row.encounter_count).toBeGreaterThan(0);
			expect(row.bird_count).toBeGreaterThan(0);
		});

		it('species_name_filter returns single species row', async () => {
			const { data, error } = await alphaClient.rpc('aggregate_stats', {
				ringing_group_filter: alphaId,
				species_name_filter: 'Robin',
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			expect(data![0].encounter_count).toBeGreaterThan(0);
		});

		it('date range covering only CES months returns fewer encounters than full year', async () => {
			const { data: fullYear } = await alphaClient.rpc('aggregate_stats', {
				ringing_group_filter: alphaId,
			});
			const { data: cesOnly } = await alphaClient.rpc('aggregate_stats', {
				ringing_group_filter: alphaId,
				from_date: '2022-04-01',
				to_date: '2022-08-31',
			});
			expect(cesOnly![0].encounter_count).toBeLessThan(fullYear![0].encounter_count);
		});

		it('group_by_species returns one row per species', async () => {
			const { data, error } = await alphaClient.rpc('aggregate_stats', {
				ringing_group_filter: alphaId,
				group_by_species: true,
			});
			expect(error).toBeNull();
			// Alpha seed has 4 species: Blue Tit, Kingfisher, Reed Warbler, Robin
			expect(data!.length).toBe(4);
			const speciesNames = data!.map((r) => r.species_name).sort();
			expect(speciesNames).toEqual(['Blue Tit', 'Kingfisher', 'Reed Warbler', 'Robin']);
		});

		it('group_by_time_period=month returns one row per month with non-null time_period', async () => {
			const { data, error } = await alphaClient.rpc('aggregate_stats', {
				ringing_group_filter: alphaId,
				group_by_time_period: 'month',
			});
			expect(error).toBeNull();
			expect(data!.length).toBeGreaterThan(1);
			expect(data![0].time_period).not.toBeNull();
		});

		it('group_by_time_period=year returns one row per year spanning 2021–2024', async () => {
			const { data, error } = await alphaClient.rpc('aggregate_stats', {
				ringing_group_filter: alphaId,
				group_by_time_period: 'year',
			});
			expect(error).toBeNull();
			// Seed has sessions in 2021, 2022, 2023, 2024
			expect(data!.length).toBe(4);
			const years = data!.map((r) => new Date(r.time_period).getFullYear()).sort();
			expect(years).toEqual([2021, 2022, 2023, 2024]);
		});
	});

	describe('top_metrics_by_period', () => {
		it('temporal_unit=day metric_name=encounters returns date+count rows', async () => {
			const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
				temporal_unit: 'day',
				metric_name: 'encounters',
				result_limit: 5,
				filters: { ringing_group_filter: alphaId },
			} as never);
			expect(error).toBeNull();
			expect(data!.length).toBeGreaterThan(0);
			expect(data![0]).toHaveProperty('visit_date');
			expect(data![0]).toHaveProperty('metric_value');
			expect(data![0].metric_value).toBeGreaterThan(0);
		});

		it('temporal_unit=month metric_name=species returns month aggregates', async () => {
			const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
				temporal_unit: 'month',
				metric_name: 'species',
				result_limit: 10,
				filters: { ringing_group_filter: alphaId },
			} as never);
			expect(error).toBeNull();
			expect(data!.length).toBeGreaterThan(0);
		});

		it('temporal_unit=year metric_name=individuals returns year aggregates', async () => {
			const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
				temporal_unit: 'year',
				metric_name: 'individuals',
				result_limit: 10,
				filters: { ringing_group_filter: alphaId },
			} as never);
			expect(error).toBeNull();
			// Seed spans 4 years
			expect(data!.length).toBe(4);
		});
	});

	describe('top_metrics_by_species_and_period', () => {
		it('returns species_name alongside date and metric_value', async () => {
			const { data, error } = await alphaClient.rpc('top_metrics_by_species_and_period', {
				temporal_unit: 'day',
				metric_name: 'encounters',
				result_limit: 5,
				filters: { ringing_group_filter: alphaId },
			} as never);
			expect(error).toBeNull();
			expect(data!.length).toBeGreaterThan(0);
			expect(data![0]).toHaveProperty('species_name');
			expect(data![0]).toHaveProperty('visit_date');
			expect(data![0]).toHaveProperty('metric_value');
		});

		it('temporal_unit=year metric_name=individuals returns per-species year rows', async () => {
			const { data, error } = await alphaClient.rpc('top_metrics_by_species_and_period', {
				temporal_unit: 'year',
				metric_name: 'individuals',
				result_limit: 20,
				filters: { ringing_group_filter: alphaId },
			} as never);
			expect(error).toBeNull();
			expect(data!.length).toBeGreaterThan(0);
			const robinRows = data!.filter((r) => r.species_name === 'Robin');
			expect(robinRows.length).toBeGreaterThan(0);
		});
	});

	describe('metrics_by_period_and_species', () => {
		it('temporal_unit=month returns month+species rows', async () => {
			const { data, error } = await alphaClient.rpc('metrics_by_period_and_species', {
				temporal_unit: 'month',
				metric_name: 'encounters',
				filters: { ringing_group_filter: alphaId },
			} as never);
			expect(error).toBeNull();
			expect(data!.length).toBeGreaterThan(0);
			expect(data![0]).toHaveProperty('species_name');
			expect(data![0]).toHaveProperty('visit_date');
		});

		it('temporal_unit=year returns year+species rows', async () => {
			const { data, error } = await alphaClient.rpc('metrics_by_period_and_species', {
				temporal_unit: 'year',
				metric_name: 'encounters',
				filters: { ringing_group_filter: alphaId },
			} as never);
			expect(error).toBeNull();
			expect(data!.length).toBeGreaterThan(0);
			const years = [...new Set(data!.map((r) => new Date(r.visit_date).getFullYear()))].sort();
			expect(years).toEqual([2021, 2022, 2023, 2024]);
		});
	});

	describe('fuzzy_search_rings', () => {
		it('exact match returns ring with closeness_score 0', async () => {
			const { data, error } = await alphaClient.rpc('fuzzy_search_rings', { q: 'ARRETRAP' });
			expect(error).toBeNull();
			const match = data!.find((r) => r.ring_no === 'ARRETRAP');
			expect(match).toBeDefined();
			expect(match!.closeness_score).toBe(0);
			expect(match!.species_name).toBe('Robin');
		});

		it('partial match returns rings containing the query', async () => {
			const { data, error } = await alphaClient.rpc('fuzzy_search_rings', { q: 'ARRETR' });
			expect(error).toBeNull();
			const match = data!.find((r) => r.ring_no === 'ARRETRAP');
			expect(match).toBeDefined();
		});

		it('no match returns empty array', async () => {
			const { data, error } = await alphaClient.rpc('fuzzy_search_rings', { q: 'ZZZZZZZZZ' });
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});
	});

	describe('most_caught_birds', () => {
		it('default call returns birds with ≥3 encounters including ARRETRAP', async () => {
			const { data, error } = await alphaClient.rpc('most_caught_birds', {
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			const arretrap = data!.find((r) => r.ring_no === 'ARRETRAP');
			expect(arretrap).toBeDefined();
			expect(arretrap!.encounter_count).toBeGreaterThanOrEqual(3);
		});

		it('species_filter limits results to that species', async () => {
			const { data, error } = await alphaClient.rpc('most_caught_birds', {
				ringing_group_filter: alphaId,
				species_filter: 'Robin',
			});
			expect(error).toBeNull();
			expect(data!.every((r) => r.species_name === 'Robin')).toBe(true);
		});

		it('year_filter limits results to encounters in that year', async () => {
			const { data, error } = await alphaClient.rpc('most_caught_birds', {
				ringing_group_filter: alphaId,
				year_filter: 2022,
			});
			expect(error).toBeNull();
			// ARRETRAP has 4 encounters in 2022 (≥3 threshold)
			const arretrap = data!.find((r) => r.ring_no === 'ARRETRAP');
			expect(arretrap).toBeDefined();
			// All encounter dates should be in 2022
			arretrap!.encounter_dates.forEach((d: string) => {
				expect(new Date(d).getFullYear()).toBe(2022);
			});
		});

		it('max_per_species=1 returns at most 1 bird per species', async () => {
			const { data, error } = await alphaClient.rpc('most_caught_birds', {
				ringing_group_filter: alphaId,
				max_per_species: 1,
			});
			expect(error).toBeNull();
			const speciesCounts: Record<string, number> = {};
			data!.forEach((r) => {
				speciesCounts[r.species_name] = (speciesCounts[r.species_name] ?? 0) + 1;
			});
			Object.values(speciesCounts).forEach((count) => expect(count).toBe(1));
		});
	});

	describe('notable_retraps', () => {
		it('min_encounter_count=6 returns ARRETRAP (9 encounters)', async () => {
			const { data, error } = await alphaClient.rpc('notable_retraps', {
				ringing_group_filter: alphaId,
				min_encounter_count: 6,
			});
			expect(error).toBeNull();
			const arretrap = data!.find((r) => r.ring_no === 'ARRETRAP');
			expect(arretrap).toBeDefined();
			expect(Number(arretrap!.encounter_count)).toBe(9);
		});

		it('min_proven_age=3 returns ARRETRAP (proven_age=3)', async () => {
			const { data, error } = await alphaClient.rpc('notable_retraps', {
				ringing_group_filter: alphaId,
				min_proven_age: 3,
			});
			expect(error).toBeNull();
			const arretrap = data!.find((r) => r.ring_no === 'ARRETRAP');
			expect(arretrap).toBeDefined();
			expect(arretrap!.proven_age).toBeGreaterThanOrEqual(3);
		});

		it('species_filter=Robin returns only Robin birds', async () => {
			const { data, error } = await alphaClient.rpc('notable_retraps', {
				ringing_group_filter: alphaId,
				species_filter: 'Robin',
				min_encounter_count: 1,
			});
			expect(error).toBeNull();
			expect(data!.every((r) => r.species_name === 'Robin')).toBe(true);
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
		it('alpha group returns known discrepancies including ABTITMIS, AKINGF001, ARRETRAP', async () => {
			const { data, error } = await alphaClient.rpc('find_discrepencies', {
				ringing_group_filter: alphaId,
			});
			expect(error).toBeNull();
			const ringNos = [...new Set(data!.map((r) => r.ring_no))];
			expect(ringNos).toContain('ABTITMIS');
			expect(ringNos).toContain('AKINGF001');
			expect(ringNos).toContain('ARRETRAP');
		});

		it('beta group returns empty (clean data)', async () => {
			const { data, error } = await betaClient.rpc('find_discrepencies', {
				ringing_group_filter: betaId,
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});
	});

	describe('cross-group RLS', () => {
		it('beta client can read alpha sessions (share exists)', async () => {
			const { data, error } = await betaClient
				.from('Sessions')
				.select('id')
				.eq('ringing_group_id', alphaId);
			expect(error).toBeNull();
			expect(data!.length).toBeGreaterThan(0);
		});

		it('gamma client can read beta sessions (share exists)', async () => {
			const { data, error } = await gammaClient
				.from('Sessions')
				.select('id')
				.eq('ringing_group_id', betaId);
			expect(error).toBeNull();
			expect(data!.length).toBeGreaterThan(0);
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

		it('gamma own-data queries return empty (no own sessions)', async () => {
			const { data, error } = await gammaClient
				.from('Sessions')
				.select('id')
				.eq('ringing_group_id', gammaId);
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});
	});
});
