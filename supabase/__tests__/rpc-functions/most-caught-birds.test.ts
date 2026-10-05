/**
 * Integration tests for the `most_caught_birds` Postgres RPC function.
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
import {
	ALPHA_TOTAL_BIRDS,
	ARRETRAP_ENCOUNTERS,
	ARRETRAP_DATES
} from './helpers/alpha-seed-constants';

describe('most_caught_birds', () => {
	let alphaId: number;
	let alphaClient: SupabaseClient;

	beforeAll(async () => {
		({ alphaId, alphaClient } = await resolveAlphaBetaGammaClients());
	});

	describe('significance_threshold parameter', () => {
		it('default threshold=3 returns only ARRETRAP (only bird with ≥3 encounters)', async () => {
			const { data, error } = await alphaClient.rpc('most_caught_birds', {
				ringing_group_filter: alphaId
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
			expect(data![0]).toMatchObject({
				species_name: 'Robin',
				ring_no: 'ARRETRAP',
				encounter_count: ARRETRAP_ENCOUNTERS,
				encounter_dates: ARRETRAP_DATES
			});
		});

		it('threshold=1 returns all 46 birds with at least 1 encounter', async () => {
			const { data, error } = await alphaClient.rpc('most_caught_birds', {
				ringing_group_filter: alphaId,
				significance_threshold: 1
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(ALPHA_TOTAL_BIRDS);
			expect(data![0].ring_no).toBe('ARRETRAP');
		});

		it('threshold=10 returns no birds (max encounters is 9 for ARRETRAP)', async () => {
			const { data, error } = await alphaClient.rpc('most_caught_birds', {
				ringing_group_filter: alphaId,
				significance_threshold: 10
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});
	});

	it('species_filter=Robin returns only ARRETRAP (only Robin with ≥3 encounters)', async () => {
		const { data, error } = await alphaClient.rpc('most_caught_birds', {
			ringing_group_filter: alphaId,
			species_filter: 'Robin'
		});
		expect(error).toBeNull();
		expect(data).toHaveLength(1);
		expect(data![0].ring_no).toBe('ARRETRAP');
	});

	it('year_filter=2022 returns ARRETRAP with exactly 4 encounters in 2022', async () => {
		const { data, error } = await alphaClient.rpc('most_caught_birds', {
			ringing_group_filter: alphaId,
			year_filter: 2022
		});
		expect(error).toBeNull();
		expect(data).toHaveLength(1);
		expect(data![0]).toMatchObject({
			ring_no: 'ARRETRAP',
			encounter_count: 4,
			encounter_dates: ['2022-04-30', '2022-06-15', '2022-08-10', '2022-10-20']
		});
	});

	it('max_per_species=1 returns at most 1 row per species (ARRETRAP is only result)', async () => {
		const { data, error } = await alphaClient.rpc('most_caught_birds', {
			ringing_group_filter: alphaId,
			max_per_species: 1
		});
		expect(error).toBeNull();
		expect(data).toHaveLength(1);
		expect(data![0].ring_no).toBe('ARRETRAP');
	});

	// ARRETRAP is the seed's long-lived Robin, encountered on every ARRETRAP_DATES
	// date (2021-06-20 → 2024-05-10), so its row's encounter_count/encounter_dates
	// narrow to whichever of those dates the temporal filters admit. Every test here
	// passes significance_threshold=1 so the significance filter is a no-op and only
	// the temporal conditions are under test.
	const findArretrap = (
		rows: { ring_no: string }[] | null
	): { encounter_count: number; encounter_dates: string[] } | undefined =>
		rows?.find((r) => r.ring_no === 'ARRETRAP') as
			| { encounter_count: number; encounter_dates: string[] }
			| undefined;

	const allEncountersWithin = (
		rows: { encounter_dates: string[] }[],
		from: string,
		to: string
	) => rows.every((r) => r.encounter_dates.every((d) => d >= from && d <= to));

	describe('date-range filtering', () => {
		it('returns only encounters on or after from_date', async () => {
			const { data, error } = await alphaClient.rpc('most_caught_birds', {
				ringing_group_filter: alphaId,
				significance_threshold: 1,
				from_date: '2023-01-01'
			});
			expect(error).toBeNull();
			expect(allEncountersWithin(data!, '2023-01-01', '9999-12-31')).toBe(true);
			expect(findArretrap(data!)).toMatchObject({
				encounter_count: 4,
				encounter_dates: [
					'2023-05-12',
					'2023-07-08',
					'2023-09-14',
					'2024-05-10'
				]
			});
		});

		it('returns only encounters on or before to_date', async () => {
			const { data, error } = await alphaClient.rpc('most_caught_birds', {
				ringing_group_filter: alphaId,
				significance_threshold: 1,
				to_date: '2022-12-31'
			});
			expect(error).toBeNull();
			expect(allEncountersWithin(data!, '0001-01-01', '2022-12-31')).toBe(true);
			expect(findArretrap(data!)).toMatchObject({
				encounter_count: 5,
				encounter_dates: [
					'2021-06-20',
					'2022-04-30',
					'2022-06-15',
					'2022-08-10',
					'2022-10-20'
				]
			});
		});

		it('intersects the date range with the existing year_filter', async () => {
			// The range spans 2022-2023; year_filter narrows it further to 2023 alone.
			const { data, error } = await alphaClient.rpc('most_caught_birds', {
				ringing_group_filter: alphaId,
				significance_threshold: 1,
				from_date: '2022-01-01',
				to_date: '2023-12-31',
				year_filter: 2023
			});
			expect(error).toBeNull();
			expect(findArretrap(data!)).toMatchObject({
				encounter_count: 3,
				encounter_dates: ['2023-05-12', '2023-07-08', '2023-09-14']
			});
		});
	});

	describe('month filtering', () => {
		it('returns every occurrence of that calendar month across all years', async () => {
			// A bare month_filter is a recurring month, not a contiguous range:
			// ARRETRAP's two June encounters sit in different calendar years.
			const { data, error } = await alphaClient.rpc('most_caught_birds', {
				ringing_group_filter: alphaId,
				significance_threshold: 1,
				month_filter: 6
			});
			expect(error).toBeNull();
			expect(
				data!.every((r) =>
					r.encounter_dates.every((d) => d.slice(5, 7) === '06')
				)
			).toBe(true);
			expect(findArretrap(data!)).toMatchObject({
				encounter_count: 2,
				encounter_dates: ['2021-06-20', '2022-06-15']
			});
		});

		it('narrows a recurring month to one year when combined with year_filter', async () => {
			const { data, error } = await alphaClient.rpc('most_caught_birds', {
				ringing_group_filter: alphaId,
				significance_threshold: 1,
				month_filter: 6,
				year_filter: 2022
			});
			expect(error).toBeNull();
			expect(findArretrap(data!)).toMatchObject({
				encounter_count: 1,
				encounter_dates: ['2022-06-15']
			});
		});
	});
});
