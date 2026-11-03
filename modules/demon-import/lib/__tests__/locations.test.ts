import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	findUnrecognisedLocationNames,
	getDistinctLocationNames
} from '../locations';
import { makeDemonRow } from './helpers/demon-rows';

describe('getDistinctLocationNames', () => {
	it('returns each loc_id value appearing in the rows, deduplicated', () => {
		const rows = [
			makeDemonRow({ loc_id: 'Garden Trap' }),
			makeDemonRow({ loc_id: 'CES972' }),
			makeDemonRow({ loc_id: 'Garden Trap' })
		];

		expect(getDistinctLocationNames(rows)).toEqual(['Garden Trap', 'CES972']);
	});

	it('ignores rows with an empty or missing loc_id', () => {
		// A surrounding-whitespace-only value is empty once
		// transformEmptyStringsToNull has trimmed it, exactly as it would be for
		// the Location upsert in writeEncounterRow.
		const rows = [
			makeDemonRow({ loc_id: 'Garden Trap' }),
			makeDemonRow({ loc_id: '' }),
			makeDemonRow({ loc_id: '   ' })
		];

		expect(getDistinctLocationNames(rows)).toEqual(['Garden Trap']);
	});
});

describe('findUnrecognisedLocationNames', () => {
	const ALPHA_GROUP_ID = 1;
	const BETA_GROUP_ID = 2;

	// A tiny stand-in for the Locations table, filtered the same way the real
	// PostgREST chain filters: by ringing_group_id, then by name membership.
	function makeClientWithLocations(
		existingLocations: { location_name: string; ringing_group_id: number }[]
	) {
		const mockIn = vi.fn(
			(_column: string, locationNames: string[], groupId = ALPHA_GROUP_ID) =>
				Promise.resolve({
					data: existingLocations
						.filter(
							(location) =>
								location.ringing_group_id === groupId &&
								locationNames.includes(location.location_name)
						)
						.map(({ location_name }) => ({ location_name })),
					error: null
				})
		);
		const mockEq = vi.fn((_column: string, groupId: number) => ({
			in: (column: string, locationNames: string[]) =>
				mockIn(column, locationNames, groupId)
		}));
		const mockSelect = vi.fn(() => ({ eq: mockEq }));
		const mockFrom = vi.fn(() => ({ select: mockSelect }));

		return {
			// eslint-disable-next-line no-restricted-syntax -- mock only implements the `from` chain this test needs, not the full SupabaseClient interface
			client: { from: mockFrom } as unknown as SupabaseClient,
			mockFrom,
			mockEq
		};
	}

	it('returns the subset of names with no matching Locations row for the group', async () => {
		const { client, mockFrom } = makeClientWithLocations([
			{ location_name: 'Garden Trap', ringing_group_id: ALPHA_GROUP_ID }
		]);

		const unrecognised = await findUnrecognisedLocationNames(
			client,
			['Garden Trap', 'CES972', 'Reedbed'],
			ALPHA_GROUP_ID
		);

		expect(mockFrom).toHaveBeenCalledWith('Locations');
		expect(unrecognised).toEqual(['CES972', 'Reedbed']);
	});

	it('returns an empty array when every name already has a matching Locations row', async () => {
		const { client } = makeClientWithLocations([
			{ location_name: 'Garden Trap', ringing_group_id: ALPHA_GROUP_ID },
			{ location_name: 'Reedbed', ringing_group_id: ALPHA_GROUP_ID }
		]);

		await expect(
			findUnrecognisedLocationNames(
				client,
				['Garden Trap', 'Reedbed'],
				ALPHA_GROUP_ID
			)
		).resolves.toEqual([]);
	});

	it("scopes the match to the given ringing_group_id, ignoring another group's matching name", async () => {
		const { client, mockEq } = makeClientWithLocations([
			{ location_name: 'Garden Trap', ringing_group_id: BETA_GROUP_ID }
		]);

		const unrecognised = await findUnrecognisedLocationNames(
			client,
			['Garden Trap'],
			ALPHA_GROUP_ID
		);

		expect(mockEq).toHaveBeenCalledWith('ringing_group_id', ALPHA_GROUP_ID);
		expect(unrecognised).toEqual(['Garden Trap']);
	});

	it('makes no query at all when the CSV named no locations', async () => {
		const { client, mockFrom } = makeClientWithLocations([]);

		await expect(
			findUnrecognisedLocationNames(client, [], ALPHA_GROUP_ID)
		).resolves.toEqual([]);
		expect(mockFrom).not.toHaveBeenCalled();
	});
});
