import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const { mockFrom } = vi.hoisted(() => ({
	mockFrom: vi.fn()
}));

vi.mock('@/lib/supabase', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../../lib/supabase')>();
	return { ...actual, supabase: { from: mockFrom } };
});

import { fetchRingingGroups, fetchSpeciesNames } from '../global-nav-data';

function makeChain(data: unknown) {
	return {
		select: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		contains: vi.fn().mockReturnThis(),
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data, error: null }).then(resolve)
	};
}

describe('fetchRingingGroups', () => {
	it("returns every ringing group, ordered by name, for the nav's group picker", async () => {
		const groups = [
			{ id: 1, group_name: 'Alpha' },
			{ id: 2, group_name: 'Beta' }
		];
		mockFrom.mockReturnValue(makeChain(groups));

		expect(await fetchRingingGroups()).toEqual(groups);
		expect(mockFrom).toHaveBeenCalledWith('RingingGroups');
	});
});

describe('fetchSpeciesNames', () => {
	it('fetches species names filtered to the viewed group, through the client passed in', async () => {
		const species = [{ id: 1, species_name: 'Robin' }];
		const chain = makeChain(species);
		const client = { from: vi.fn().mockReturnValue(chain) };

		const result = await fetchSpeciesNames(
			{ id: 1, slug: 'alpha' },
			// eslint-disable-next-line no-restricted-syntax -- partial client, only `.from` is exercised
			client as unknown as SupabaseClient
		);

		expect(result).toEqual(species);
		expect(client.from).toHaveBeenCalledWith('Species');
		expect(chain.contains).toHaveBeenCalledWith('Birds.ringing_group_ids', [1]);
	});
});
