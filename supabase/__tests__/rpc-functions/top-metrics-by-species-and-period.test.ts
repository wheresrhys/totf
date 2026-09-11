/**
 * Integration tests for the `top_metrics_by_species_and_period` Postgres RPC function.
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

describe('top_metrics_by_species_and_period', () => {
	let alphaId: number;
	let alphaClient: SupabaseClient;

	beforeAll(async () => {
		({ alphaId, alphaClient } = await resolveAlphaBetaGammaClients());
	});

	// Default params: metric_name='encounters', result_limit=3, temporal_unit='day'

	describe('temporal_unit parameter', () => {
		it('day groups results by individual session date', async () => {
			const { data, error } = await alphaClient.rpc(
				'top_metrics_by_species_and_period',
				{
					temporal_unit: 'day',
					metric_name: 'encounters',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId }
				} as never
			);
			expect(error).toBeNull();
			expect(data).toHaveLength(3);
			expect(data![0]).toEqual({
				species_name: 'Robin',
				visit_date: '2023-05-12',
				metric_value: 7
			});
			expect(data![1]).toEqual({
				species_name: 'Robin',
				visit_date: '2022-04-30',
				metric_value: 7
			});
			expect(data![2]).toEqual({
				species_name: 'Robin',
				visit_date: '2022-06-15',
				metric_value: 6
			});
		});

		it('month aggregates results into calendar months', async () => {
			const { data, error } = await alphaClient.rpc(
				'top_metrics_by_species_and_period',
				{
					temporal_unit: 'month',
					metric_name: 'encounters',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId }
				} as never
			);
			expect(error).toBeNull();
			expect(data).toHaveLength(3);
			expect(data![0]).toEqual({
				species_name: 'Robin',
				visit_date: '2023-05-01',
				metric_value: 7
			});
			expect(data![1]).toEqual({
				species_name: 'Robin',
				visit_date: '2022-04-01',
				metric_value: 7
			});
			expect(data![2]).toEqual({
				species_name: 'Robin',
				visit_date: '2022-06-01',
				metric_value: 6
			});
		});

		it('year aggregates results into calendar years', async () => {
			const { data, error } = await alphaClient.rpc(
				'top_metrics_by_species_and_period',
				{
					temporal_unit: 'year',
					metric_name: 'encounters',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId }
				} as never
			);
			expect(error).toBeNull();
			expect(data).toHaveLength(3);
			expect(data![0]).toEqual({
				species_name: 'Robin',
				visit_date: '2022-01-01',
				metric_value: 20
			});
			expect(data![1]).toEqual({
				species_name: 'Robin',
				visit_date: '2023-01-01',
				metric_value: 9
			});
			expect(data![2]).toEqual({
				species_name: 'Reed Warbler',
				visit_date: '2022-01-01',
				metric_value: 8
			});
		});
	});

	describe('metric_name parameter', () => {
		it('encounters counts all encounter records per species per day', async () => {
			const { data, error } = await alphaClient.rpc(
				'top_metrics_by_species_and_period',
				{
					temporal_unit: 'day',
					metric_name: 'encounters',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId }
				} as never
			);
			expect(error).toBeNull();
			expect(data![0]).toEqual({
				species_name: 'Robin',
				visit_date: '2023-05-12',
				metric_value: 7
			});
		});

		it('individuals counts distinct rings per species per day', async () => {
			const { data, error } = await alphaClient.rpc(
				'top_metrics_by_species_and_period',
				{
					temporal_unit: 'day',
					metric_name: 'individuals',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId }
				} as never
			);
			expect(error).toBeNull();
			// Each bird is caught once per session in seed data → same as encounters
			expect(data![0]).toEqual({
				species_name: 'Robin',
				visit_date: '2023-05-12',
				metric_value: 7
			});
		});
	});

	describe('result_limit parameter', () => {
		it('result_limit=1 returns only the top result', async () => {
			const { data, error } = await alphaClient.rpc(
				'top_metrics_by_species_and_period',
				{
					temporal_unit: 'day',
					metric_name: 'encounters',
					result_limit: 1,
					filters: { ringing_group_filter: alphaId }
				} as never
			);
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			expect(data![0]).toEqual({
				species_name: 'Robin',
				visit_date: '2023-05-12',
				metric_value: 7
			});
		});

		it('result_limit=3 returns top 3 results', async () => {
			const { data, error } = await alphaClient.rpc(
				'top_metrics_by_species_and_period',
				{
					temporal_unit: 'day',
					metric_name: 'encounters',
					result_limit: 3,
					filters: { ringing_group_filter: alphaId }
				} as never
			);
			expect(error).toBeNull();
			expect(data).toHaveLength(3);
		});
	});
});
