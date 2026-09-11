/**
 * Integration tests for the `notable_retraps` Postgres RPC function.
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
	PER_SPECIES_AGGREGATES,
	ARRETRAP_ENCOUNTERS,
	ARRETRAP_DATES
} from './helpers/alpha-seed-constants';

const ARRETRAP_PROVEN_AGE = 3;

describe('notable_retraps', () => {
	let alphaId: number;
	let alphaClient: SupabaseClient;

	beforeAll(async () => {
		({ alphaId, alphaClient } = await resolveAlphaBetaGammaClients());
	});

	it('min_encounter_count=6 returns only ARRETRAP (9 encounters)', async () => {
		const { data, error } = await alphaClient.rpc('notable_retraps', {
			ringing_group_filter: alphaId,
			min_encounter_count: 6
		});
		expect(error).toBeNull();
		expect(data).toHaveLength(1);
		expect(data![0]).toMatchObject({
			species_name: 'Robin',
			ring_no: 'ARRETRAP',
			encounter_count: ARRETRAP_ENCOUNTERS,
			encounter_dates: ARRETRAP_DATES,
			proven_age: ARRETRAP_PROVEN_AGE
		});
	});

	it('min_proven_age=3 returns ARRETRAP and the long-absence Wren (both proven_age=3)', async () => {
		// AWREN001 was ringed as a juvenile in 2021 and recaught in 2024, so it is
		// also a proven-age-3 bird. Ordered by encounter_count DESC → ARRETRAP first.
		const { data, error } = await alphaClient.rpc('notable_retraps', {
			ringing_group_filter: alphaId,
			min_proven_age: 3
		});
		expect(error).toBeNull();
		expect(data).toHaveLength(2);
		expect(data![0]).toMatchObject({
			ring_no: 'ARRETRAP',
			encounter_count: ARRETRAP_ENCOUNTERS,
			proven_age: ARRETRAP_PROVEN_AGE
		});
		expect(data![1]).toMatchObject({
			ring_no: 'AWREN001',
			species_name: 'Wren',
			encounter_count: 2,
			proven_age: 3
		});
	});

	it('species_filter=Robin returns all 23 Robin birds with min_encounter_count=1', async () => {
		const { data, error } = await alphaClient.rpc('notable_retraps', {
			ringing_group_filter: alphaId,
			species_filter: 'Robin',
			min_encounter_count: 1
		});
		expect(error).toBeNull();
		expect(data).toHaveLength(PER_SPECIES_AGGREGATES['Robin'].bird_count);
		expect(data!.every((r) => r.species_name === 'Robin')).toBe(true);
		expect(data![0].ring_no).toBe('ARRETRAP');
	});

	it('min_encounter_count=100 returns no birds', async () => {
		const { data, error } = await alphaClient.rpc('notable_retraps', {
			ringing_group_filter: alphaId,
			min_encounter_count: 100
		});
		expect(error).toBeNull();
		expect(data).toHaveLength(0);
	});

	// ARRETRAP is the seed's long-lived Robin, encountered on every ARRETRAP_DATES
	// date (2021-06-20 → 2024-05-10). `from_date`/`to_date` filter `visit_date`
	// inclusively, so both `encounter_count` and `encounter_dates` shrink to the
	// in-range encounters. Each test pulls the ARRETRAP row out of a Robin query
	// (`min_encounter_count: 1`) and checks its date-scoped shape.
	describe('date-range filtering', () => {
		const findArretrap = (
			rows: {
				ring_no: string;
				encounter_count: number;
				encounter_dates: string[];
			}[]
		) => rows.find((r) => r.ring_no === 'ARRETRAP');

		it('both from_date and to_date returns only encounters within the range', async () => {
			const { data, error } = await alphaClient.rpc('notable_retraps', {
				ringing_group_filter: alphaId,
				species_filter: 'Robin',
				min_encounter_count: 1,
				from_date: '2023-01-01',
				to_date: '2023-12-31'
			});
			expect(error).toBeNull();
			// Every returned bird's encounter dates fall within the range.
			expect(
				data!.every((r) =>
					r.encounter_dates.every((d) => d >= '2023-01-01' && d <= '2023-12-31')
				)
			).toBe(true);
			expect(findArretrap(data!)).toMatchObject({
				encounter_count: 3,
				encounter_dates: ['2023-05-12', '2023-07-08', '2023-09-14']
			});
		});

		it('from_date only leaves the upper bound open', async () => {
			const { data, error } = await alphaClient.rpc('notable_retraps', {
				ringing_group_filter: alphaId,
				species_filter: 'Robin',
				min_encounter_count: 1,
				from_date: '2023-01-01'
			});
			expect(error).toBeNull();
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

		it('to_date only leaves the lower bound open', async () => {
			const { data, error } = await alphaClient.rpc('notable_retraps', {
				ringing_group_filter: alphaId,
				species_filter: 'Robin',
				min_encounter_count: 1,
				to_date: '2022-12-31'
			});
			expect(error).toBeNull();
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

		it('neither provided is unchanged all-time behaviour', async () => {
			const { data, error } = await alphaClient.rpc('notable_retraps', {
				ringing_group_filter: alphaId,
				species_filter: 'Robin',
				min_encounter_count: 1
			});
			expect(error).toBeNull();
			expect(findArretrap(data!)).toMatchObject({
				encounter_count: ARRETRAP_ENCOUNTERS,
				encounter_dates: ARRETRAP_DATES
			});
		});

		it('an encounter exactly on from_date is included', async () => {
			const { data, error } = await alphaClient.rpc('notable_retraps', {
				ringing_group_filter: alphaId,
				species_filter: 'Robin',
				min_encounter_count: 1,
				from_date: '2024-05-10' // ARRETRAP's last encounter date
			});
			expect(error).toBeNull();
			expect(findArretrap(data!)).toMatchObject({
				encounter_count: 1,
				encounter_dates: ['2024-05-10']
			});
		});

		it('an encounter exactly on to_date is included', async () => {
			const { data, error } = await alphaClient.rpc('notable_retraps', {
				ringing_group_filter: alphaId,
				species_filter: 'Robin',
				min_encounter_count: 1,
				to_date: '2021-06-20' // ARRETRAP's first encounter date
			});
			expect(error).toBeNull();
			expect(findArretrap(data!)).toMatchObject({
				encounter_count: 1,
				encounter_dates: ['2021-06-20']
			});
		});

		it('a range with no matching encounters returns an empty array', async () => {
			const { data, error } = await alphaClient.rpc('notable_retraps', {
				ringing_group_filter: alphaId,
				species_filter: 'Robin',
				min_encounter_count: 1,
				from_date: '2025-01-01',
				to_date: '2025-12-31'
			});
			expect(error).toBeNull();
			expect(data).toHaveLength(0);
		});
	});
});
