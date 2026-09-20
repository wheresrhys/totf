import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveRingSearchDestination } from '../ring-search';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

function makeClient(exactMatch: { id: number } | null) {
	const fromChain = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		maybeSingle: vi.fn().mockReturnThis(),
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data: exactMatch, error: null }).then(resolve)
	};
	return { from: vi.fn().mockReturnValue(fromChain) };
}

describe('resolveRingSearchDestination', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('usual cases', () => {
		it('resolves to the bird page when the ring exactly matches a bird', async () => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(
				makeClient({ id: 1 })
			);

			const result = await resolveRingSearchDestination('AR0021');

			expect(result).toEqual({ isExactMatch: true, path: '/bird/AR0021' });
		});

		it('resolves to the search results page when no ring matches exactly', async () => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeClient(null));

			const result = await resolveRingSearchDestination('AR00');

			expect(result).toEqual({
				isExactMatch: false,
				path: '/search?q=AR00'
			});
		});
	});

	describe('structure', () => {
		it('looks up the ring uppercased regardless of the casing searched', async () => {
			const client = makeClient({ id: 1 });
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);

			await resolveRingSearchDestination('ar0021');

			expect(client.from().eq).toHaveBeenCalledWith('ring_no', 'AR0021');
		});

		it('preserves the original casing of the ring in the resolved bird path', async () => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(
				makeClient({ id: 1 })
			);

			const result = await resolveRingSearchDestination('ar0021');

			expect(result.path).toBe('/bird/ar0021');
		});
	});

	describe('edge cases', () => {
		it('resolves two different rings independently, each to its own destination', async () => {
			mockGetAuthenticatedSupabaseClient
				.mockResolvedValueOnce(makeClient({ id: 1 }))
				.mockResolvedValueOnce(makeClient({ id: 2 }));

			const first = await resolveRingSearchDestination('AR0021');
			const second = await resolveRingSearchDestination('AR0020');

			expect(first.path).toBe('/bird/AR0021');
			expect(second.path).toBe('/bird/AR0020');
		});
	});
});
