/**
 * Integration tests for the `group_ticks` Postgres RPC function.
 *
 * Requires local Supabase running and e2e seed data loaded:
 *   npm run db:start:local
 *   npm run db:seed:e2e
 *
 * Run with: npm run test:integration
 */

import { describe, it, beforeAll, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getLocationIdByName } from './helpers/seed-lookups';
import { resolveAlphaBetaGammaClients } from './helpers/group-clients';

describe('group_ticks', () => {
	let alphaId: number;
	let betaId: number;
	let gammaId: number;
	let alphaClient: SupabaseClient;
	let betaClient: SupabaseClient;
	let gammaClient: SupabaseClient;

	beforeAll(async () => {
		({ alphaId, betaId, gammaId, alphaClient, betaClient, gammaClient } =
			await resolveAlphaBetaGammaClients());
	});

	// Alpha species first-encounter dates (across all locations, all record types):
	//   Reed Warbler 2022-06-15, Blue Tit 2022-04-30, Kingfisher 2022-04-30,
	//   Robin 2021-06-20, Wren 2021-06-20
	let alphaSiteBLocationId: number;

	beforeAll(async () => {
		alphaSiteBLocationId = await getLocationIdByName(
			alphaClient,
			'Alpha Site B',
			alphaId
		);
	});

	it('a group with multiple species returns them ordered by most recent first_encounter_date first', async () => {
		const { data, error } = await alphaClient.rpc('group_ticks', {
			ringing_group_filter: alphaId
		});
		expect(error).toBeNull();
		expect(data).toEqual([
			{ species_name: 'Reed Warbler', first_encounter_date: '2022-06-15' },
			{ species_name: 'Blue Tit', first_encounter_date: '2022-04-30' },
			{ species_name: 'Kingfisher', first_encounter_date: '2022-04-30' },
			{ species_name: 'Robin', first_encounter_date: '2021-06-20' },
			{ species_name: 'Wren', first_encounter_date: '2021-06-20' }
		]);
	});

	describe('ringing_group_filter parameter', () => {
		it('scopes to that group only — a species encountered by a different group is excluded', async () => {
			const { data, error } = await betaClient.rpc('group_ticks', {
				ringing_group_filter: betaId
			});
			expect(error).toBeNull();
			expect(data).toEqual([
				{ species_name: 'Chaffinch', first_encounter_date: '2023-06-01' },
				{ species_name: 'Robin', first_encounter_date: '2023-06-01' }
			]);
			// Alpha-only species (e.g. Kingfisher) never appear when filtered to Beta
			expect(data!.some((r) => r.species_name === 'Kingfisher')).toBe(false);
		});
	});

	describe('location_filter parameter', () => {
		it('scopes to that location only — a species first encountered at a different location is excluded', async () => {
			const { data, error } = await alphaClient.rpc('group_ticks', {
				ringing_group_filter: alphaId,
				location_filter: alphaSiteBLocationId
			});
			expect(error).toBeNull();
			expect(data).toEqual([
				{ species_name: 'Reed Warbler', first_encounter_date: '2023-09-14' },
				{ species_name: 'Blue Tit', first_encounter_date: '2022-10-20' },
				{ species_name: 'Robin', first_encounter_date: '2022-10-20' }
			]);
			// Kingfisher and Wren were only ever encountered at Alpha Site A (CES)
			expect(data!.some((r) => r.species_name === 'Kingfisher')).toBe(false);
			expect(data!.some((r) => r.species_name === 'Wren')).toBe(false);
		});
	});

	describe('result_limit parameter', () => {
		it('truncates the returned rows to N', async () => {
			const { data, error } = await alphaClient.rpc('group_ticks', {
				ringing_group_filter: alphaId,
				result_limit: 2
			});
			expect(error).toBeNull();
			expect(data).toEqual([
				{ species_name: 'Reed Warbler', first_encounter_date: '2022-06-15' },
				{ species_name: 'Blue Tit', first_encounter_date: '2022-04-30' }
			]);
		});
	});

	it('a group with zero encounters returns an empty array', async () => {
		const { data, error } = await gammaClient.rpc('group_ticks', {
			ringing_group_filter: gammaId
		});
		expect(error).toBeNull();
		expect(data).toEqual([]);
	});

	it('two species sharing the same first_encounter_date are tie-broken by species_name ASC', async () => {
		const { data, error } = await alphaClient.rpc('group_ticks', {
			ringing_group_filter: alphaId
		});
		expect(error).toBeNull();
		const tiedAtJune2021 = data!.filter(
			(r) => r.first_encounter_date === '2021-06-20'
		);
		expect(tiedAtJune2021.map((r) => r.species_name)).toEqual([
			'Robin',
			'Wren'
		]);
		const tiedAtApril2022 = data!.filter(
			(r) => r.first_encounter_date === '2022-04-30'
		);
		expect(tiedAtApril2022.map((r) => r.species_name)).toEqual([
			'Blue Tit',
			'Kingfisher'
		]);
	});

	it("a species' first-ever encounter logged with a non-'N' record_type still sets first_encounter_date", async () => {
		// Beta's only Robin encounter is SHARED01, logged as record_type 'S' (a retrap-type
		// record — the bird was originally ringed by Alpha). group_ticks must not filter to
		// record_type = 'N' only, or Robin would be missing from Beta's results entirely.
		const { data, error } = await betaClient.rpc('group_ticks', {
			ringing_group_filter: betaId
		});
		expect(error).toBeNull();
		const robinRow = data!.find((r) => r.species_name === 'Robin');
		expect(robinRow).toEqual({
			species_name: 'Robin',
			first_encounter_date: '2023-06-01'
		});
	});
});
