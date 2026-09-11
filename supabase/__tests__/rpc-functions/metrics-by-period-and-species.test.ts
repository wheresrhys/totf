/**
 * Integration tests for the `metrics_by_period_and_species` Postgres RPC function.
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

describe('metrics_by_period_and_species', () => {
	let alphaId: number;
	let alphaClient: SupabaseClient;

	beforeAll(async () => {
		({ alphaId, alphaClient } = await resolveAlphaBetaGammaClients());
	});

	it('temporal_unit=month returns 23 species-month rows', async () => {
		const { data, error } = await alphaClient.rpc(
			'metrics_by_period_and_species',
			{
				temporal_unit: 'month',
				metric_name: 'encounters',
				filters: { ringing_group_filter: alphaId }
			} as never
		);
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
		const { data, error } = await alphaClient.rpc(
			'metrics_by_period_and_species',
			{
				temporal_unit: 'year',
				metric_name: 'encounters',
				filters: { ringing_group_filter: alphaId }
			} as never
		);
		expect(error).toBeNull();
		expect(data).toHaveLength(13);
		const years = [
			...new Set(data!.map((r) => new Date(r.visit_date).getFullYear()))
		].sort();
		expect(years).toEqual([2021, 2022, 2023, 2024]);
		const robin2022 = data!.find(
			(r) =>
				r.species_name === 'Robin' &&
				new Date(r.visit_date).getFullYear() === 2022
		);
		expect(robin2022!.metric_value).toBe(20);
	});
});
