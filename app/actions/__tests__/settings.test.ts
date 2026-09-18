import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updatePublicSummaryEnabled } from '../settings';
import { getGroupCookie } from '../group-cookie';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

type UpdateCall = { payload: unknown; id: number };

function makeClient(
	initialPublicAreas: string[],
	selectCalls: number[] = [],
	updateCalls: UpdateCall[] = []
) {
	return {
		from: vi.fn(() => ({
			select: vi.fn(() => {
				const chain = {
					eq: vi.fn((_column: string, id: number) => {
						selectCalls.push(id);
						return chain;
					}),
					single: vi.fn(() => chain),
					then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
						Promise.resolve({
							data: { public_areas: initialPublicAreas },
							error: null
						}).then(resolve)
				};
				return chain;
			}),
			update: vi.fn((payload: unknown) => {
				const chain = {
					eq: vi.fn((_column: string, id: number) => {
						updateCalls.push({ payload, id });
						return chain;
					}),
					then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
						Promise.resolve({ data: null, error: null }).then(resolve)
				};
				return chain;
			})
		}))
	};
}

describe('updatePublicSummaryEnabled', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('usual cases', () => {
		it("adds 'summary' to public_areas when enabling", async () => {
			const updateCalls: UpdateCall[] = [];
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(
				makeClient([], [], updateCalls)
			);

			const result = await updatePublicSummaryEnabled(true);

			expect(result).toEqual({ success: true, enabled: true });
			expect(updateCalls[0].payload).toEqual({ public_areas: ['summary'] });
		});

		it("removes 'summary' from public_areas when disabling", async () => {
			const updateCalls: UpdateCall[] = [];
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(
				makeClient(['summary', 'other'], [], updateCalls)
			);

			const result = await updatePublicSummaryEnabled(false);

			expect(result).toEqual({ success: true, enabled: false });
			expect(updateCalls[0].payload).toEqual({ public_areas: ['other'] });
		});
	});

	describe('structure — idempotency', () => {
		it('enabling when already enabled is a no-op (idempotent, no duplicate array entries)', async () => {
			const updateCalls: UpdateCall[] = [];
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(
				makeClient(['summary'], [], updateCalls)
			);

			const result = await updatePublicSummaryEnabled(true);

			expect(result).toEqual({ success: true, enabled: true });
			expect(updateCalls[0].payload).toEqual({ public_areas: ['summary'] });
		});

		it('disabling when already disabled is a no-op', async () => {
			const updateCalls: UpdateCall[] = [];
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(
				makeClient(['other'], [], updateCalls)
			);

			const result = await updatePublicSummaryEnabled(false);

			expect(result).toEqual({ success: true, enabled: false });
			expect(updateCalls[0].payload).toEqual({ public_areas: ['other'] });
		});
	});

	describe('edge cases', () => {
		it("only ever updates the caller's own group's row", async () => {
			vi.mocked(getGroupCookie).mockResolvedValueOnce(42);
			const selectCalls: number[] = [];
			const updateCalls: UpdateCall[] = [];
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(
				makeClient([], selectCalls, updateCalls)
			);

			await updatePublicSummaryEnabled(true);

			expect(selectCalls).toEqual([42]);
			expect(updateCalls[0].id).toBe(42);
		});
	});
});
