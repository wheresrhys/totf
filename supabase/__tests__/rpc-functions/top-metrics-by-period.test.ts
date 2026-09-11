/**
 * Integration tests for the `top_metrics_by_period` Postgres RPC function.
 *
 * Requires local Supabase running and e2e seed data loaded:
 *   npm run db:start:local
 *   npm run db:seed:e2e
 *
 * Run with: npm run test:integration
 */

import { describe, it, beforeAll, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveAlphaBetaGammaClients } from './helpers/group-clients';

describe('top_metrics_by_period', () => {
	let alphaId: number;
	let alphaClient: SupabaseClient;

	beforeAll(async () => {
		({ alphaId, alphaClient } = await resolveAlphaBetaGammaClients());
	});

	// Default params used unless overridden within a describe block:
	//   metric_name='encounters', result_limit=3, temporal_unit='day'

	describe('temporal_unit parameter', () => {
		it('day groups results by individual session date', async () => {
			const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
				temporal_unit: 'day',
				metric_name: 'encounters',
				result_limit: 3,
				filters: { ringing_group_filter: alphaId }
			} as never);
			expect(error).toBeNull();
			expect(data).toHaveLength(3);
			// Top 2 days tie at 11 encounters (secondary sort: visit_date DESC → 2022-06-15 wins)
			expect(data![0]).toEqual({
				visit_date: '2022-06-15',
				metric_value: 11
			});
			expect(data![1]).toEqual({
				visit_date: '2022-04-30',
				metric_value: 11
			});
			expect(data![2]).toEqual({
				visit_date: '2023-05-12',
				metric_value: 10
			});
		});

		it('month aggregates results into calendar months', async () => {
			const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
				temporal_unit: 'month',
				metric_name: 'encounters',
				result_limit: 3,
				filters: { ringing_group_filter: alphaId }
			} as never);
			expect(error).toBeNull();
			expect(data).toHaveLength(3);
			expect(data![0]).toEqual({
				visit_date: '2022-06-01',
				metric_value: 11
			});
			expect(data![1]).toEqual({
				visit_date: '2022-04-01',
				metric_value: 11
			});
			expect(data![2]).toEqual({
				visit_date: '2023-05-01',
				metric_value: 10
			});
		});

		it('year aggregates results into calendar years', async () => {
			const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
				temporal_unit: 'year',
				metric_name: 'encounters',
				result_limit: 3,
				filters: { ringing_group_filter: alphaId }
			} as never);
			expect(error).toBeNull();
			expect(data).toHaveLength(3);
			expect(data![0]).toEqual({
				visit_date: '2022-01-01',
				metric_value: 35
			});
			expect(data![1]).toEqual({
				visit_date: '2023-01-01',
				metric_value: 15
			});
			expect(data![2]).toEqual({ visit_date: '2024-01-01', metric_value: 5 });
		});
	});

	describe('metric_name parameter', () => {
		it('encounters counts all encounter records per day', async () => {
			const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
				temporal_unit: 'day',
				metric_name: 'encounters',
				result_limit: 3,
				filters: { ringing_group_filter: alphaId }
			} as never);
			expect(error).toBeNull();
			expect(data![0]).toEqual({
				visit_date: '2022-06-15',
				metric_value: 11
			});
		});

		it('individuals counts distinct rings per day', async () => {
			const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
				temporal_unit: 'day',
				metric_name: 'individuals',
				result_limit: 3,
				filters: { ringing_group_filter: alphaId }
			} as never);
			expect(error).toBeNull();
			// Each bird is caught once per session in seed data → same as encounters
			expect(data![0]).toEqual({
				visit_date: '2022-06-15',
				metric_value: 11
			});
		});

		it('species counts distinct species present per day', async () => {
			const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
				temporal_unit: 'day',
				metric_name: 'species',
				result_limit: 3,
				filters: { ringing_group_filter: alphaId }
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
				filters: { ringing_group_filter: alphaId }
			} as never);
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			expect(data![0]).toEqual({
				visit_date: '2022-06-15',
				metric_value: 11
			});
		});

		it('result_limit=3 returns top 3 results', async () => {
			const { data, error } = await alphaClient.rpc('top_metrics_by_period', {
				temporal_unit: 'day',
				metric_name: 'encounters',
				result_limit: 3,
				filters: { ringing_group_filter: alphaId }
			} as never);
			expect(error).toBeNull();
			expect(data).toHaveLength(3);
		});
	});
});
