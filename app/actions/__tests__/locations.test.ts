import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	fetchGroupLocations,
	resolveUnrecognisedLocations,
	type GroupLocationRow
} from '../locations';
import type { ViewedGroup } from '@/app/lib/group-slug';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

const GROUP_ID = 7;
const viewedGroup: ViewedGroup = { id: GROUP_ID, slug: 'alpha' };

function makeFormData(fields: Record<string, string>): FormData {
	const fd = new FormData();
	for (const [key, value] of Object.entries(fields)) fd.append(key, value);
	return fd;
}

type SelectQueryResult = { data: unknown; error: null };

function makeFetchClient(rows: GroupLocationRow[]) {
	const chain: Record<string, unknown> = {
		select: vi.fn(() => chain),
		eq: vi.fn(() => chain),
		order: vi.fn(() => chain),
		then: (resolve: (v: SelectQueryResult) => unknown) =>
			Promise.resolve({ data: rows, error: null }).then(resolve)
	};
	const from = vi.fn(() => chain);
	return { from, chain };
}

type InsertCall = { payload: unknown };
type UpdateCall = { payload: unknown; eqCalls: [string, unknown][] };

function makeWriteClient() {
	const insertCalls: InsertCall[] = [];
	const updateCalls: UpdateCall[] = [];
	const from = vi.fn(() => ({
		insert: vi.fn((payload: unknown) => {
			insertCalls.push({ payload });
			return {
				then: (resolve: (v: { data: null; error: null }) => unknown) =>
					Promise.resolve({ data: null, error: null }).then(resolve)
			};
		}),
		update: vi.fn((payload: unknown) => {
			const eqCalls: [string, unknown][] = [];
			const chain: Record<string, unknown> = {
				eq: vi.fn((column: string, value: unknown) => {
					eqCalls.push([column, value]);
					return chain;
				}),
				then: (resolve: (v: { data: null; error: null }) => unknown) => {
					updateCalls.push({ payload, eqCalls });
					return Promise.resolve({ data: null, error: null }).then(resolve);
				}
			};
			return chain;
		})
	}));
	return { from, insertCalls, updateCalls };
}

describe('fetchGroupLocations', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns the group's existing Locations ordered by name", async () => {
		const rows: GroupLocationRow[] = [
			{ id: 1, location_name: 'Alpha Marsh' },
			{ id: 2, location_name: 'Beta Wood' }
		];
		const { from, chain } = makeFetchClient(rows);
		mockGetAuthenticatedSupabaseClient.mockResolvedValue({ from });

		const result = await fetchGroupLocations(viewedGroup);

		expect(result).toEqual(rows);
		expect(from).toHaveBeenCalledWith('Locations');
		expect(chain.select).toHaveBeenCalledWith('id, location_name');
		expect(chain.eq).toHaveBeenCalledWith('ringing_group_id', GROUP_ID);
		expect(chain.order).toHaveBeenCalledWith('location_name');
	});

	it('returns an empty array for a group with no locations yet', async () => {
		const { from } = makeFetchClient([]);
		mockGetAuthenticatedSupabaseClient.mockResolvedValue({ from });

		const result = await fetchGroupLocations(viewedGroup);

		expect(result).toEqual([]);
	});
});

describe('resolveUnrecognisedLocations', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('a "new location" decision', () => {
		it('inserts a new Locations row with the unrecognised name for the group', async () => {
			const { from, insertCalls } = makeWriteClient();
			mockGetAuthenticatedSupabaseClient.mockResolvedValue({ from });

			const result = await resolveUnrecognisedLocations(
				null,
				makeFormData({
					viewed_group_id: String(GROUP_ID),
					decisions: JSON.stringify([{ name: 'New Reedbed', kind: 'new' }])
				})
			);

			expect(result).toEqual({ success: true });
			expect(insertCalls[0].payload).toEqual({
				location_name: 'New Reedbed',
				ringing_group_id: GROUP_ID
			});
		});
	});

	describe('a "rename" decision', () => {
		it("updates the chosen existing Location's location_name to the unrecognised name", async () => {
			const { from, updateCalls } = makeWriteClient();
			mockGetAuthenticatedSupabaseClient.mockResolvedValue({ from });

			const result = await resolveUnrecognisedLocations(
				null,
				makeFormData({
					viewed_group_id: String(GROUP_ID),
					decisions: JSON.stringify([
						{ name: 'CES972', kind: 'rename', existingLocationId: 42 }
					])
				})
			);

			expect(result).toEqual({ success: true });
			expect(updateCalls[0].payload).toEqual({ location_name: 'CES972' });
		});

		it('scopes the update to the given ringing_group_id', async () => {
			const { from, updateCalls } = makeWriteClient();
			mockGetAuthenticatedSupabaseClient.mockResolvedValue({ from });

			await resolveUnrecognisedLocations(
				null,
				makeFormData({
					viewed_group_id: String(GROUP_ID),
					decisions: JSON.stringify([
						{ name: 'CES972', kind: 'rename', existingLocationId: 42 }
					])
				})
			);

			expect(updateCalls[0].eqCalls).toEqual([
				['id', 42],
				['ringing_group_id', GROUP_ID]
			]);
		});
	});

	describe('validation', () => {
		it('returns an error and makes no writes when a rename decision has no existingLocationId', async () => {
			const { from, insertCalls, updateCalls } = makeWriteClient();
			mockGetAuthenticatedSupabaseClient.mockResolvedValue({ from });

			const result = await resolveUnrecognisedLocations(
				null,
				makeFormData({
					viewed_group_id: String(GROUP_ID),
					decisions: JSON.stringify([{ name: 'CES972', kind: 'rename' }])
				})
			);

			expect(result).toMatchObject({ success: false });
			expect(insertCalls).toHaveLength(0);
			expect(updateCalls).toHaveLength(0);
		});

		it('returns an error and makes no writes when the decisions payload is empty or malformed', async () => {
			const { from, insertCalls, updateCalls } = makeWriteClient();
			mockGetAuthenticatedSupabaseClient.mockResolvedValue({ from });

			const emptyResult = await resolveUnrecognisedLocations(
				null,
				makeFormData({
					viewed_group_id: String(GROUP_ID),
					decisions: JSON.stringify([])
				})
			);
			const malformedResult = await resolveUnrecognisedLocations(
				null,
				makeFormData({
					viewed_group_id: String(GROUP_ID),
					decisions: 'not json'
				})
			);

			expect(emptyResult).toMatchObject({ success: false });
			expect(malformedResult).toMatchObject({ success: false });
			expect(insertCalls).toHaveLength(0);
			expect(updateCalls).toHaveLength(0);
		});
	});
});
