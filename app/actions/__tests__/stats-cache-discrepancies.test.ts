import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchStatsCacheDiscrepancies } from '../stats-cache-discrepancies';
import { getGroupCookie } from '../group-cookie';
import type { StatsCacheDiscrepancy } from '@/modules/stats';

const {
	mockFindSimpleStatsCacheDiscrepancies,
	mockGetAuthenticatedSupabaseClient
} = vi.hoisted(() => ({
	mockFindSimpleStatsCacheDiscrepancies: vi.fn(),
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/modules/stats', () => ({
	findSimpleStatsCacheDiscrepancies: mockFindSimpleStatsCacheDiscrepancies
}));

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

const FAKE_CLIENT = { fake: 'supabase-client' };

describe('fetchStatsCacheDiscrepancies', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(FAKE_CLIENT);
		mockFindSimpleStatsCacheDiscrepancies.mockResolvedValue([]);
	});

	it('resolves the group id from the session cookie, never from an input param', async () => {
		vi.mocked(getGroupCookie).mockResolvedValueOnce(42);

		await fetchStatsCacheDiscrepancies({
			temporalUnit: 'all-time',
			bySpecies: false
		});

		expect(getGroupCookie).toHaveBeenCalled();
		expect(mockFindSimpleStatsCacheDiscrepancies).toHaveBeenCalledWith(
			FAKE_CLIENT,
			expect.objectContaining({ groupId: 42 })
		);
	});

	it('calls the modules/stats comparison function with the resolved groupId and the given temporalUnit/bySpecies', async () => {
		vi.mocked(getGroupCookie).mockResolvedValueOnce(7);

		await fetchStatsCacheDiscrepancies({
			temporalUnit: 'year',
			bySpecies: true
		});

		expect(mockFindSimpleStatsCacheDiscrepancies).toHaveBeenCalledWith(
			FAKE_CLIENT,
			expect.objectContaining({
				groupId: 7,
				temporalUnit: 'year',
				groupBySpecies: true
			})
		);
	});

	it('passes periods/speciesIds through when given', async () => {
		vi.mocked(getGroupCookie).mockResolvedValueOnce(7);

		await fetchStatsCacheDiscrepancies({
			temporalUnit: 'month',
			bySpecies: true,
			periods: ['2026-01-01'],
			speciesIds: [101]
		});

		expect(mockFindSimpleStatsCacheDiscrepancies).toHaveBeenCalledWith(
			FAKE_CLIENT,
			expect.objectContaining({
				periods: ['2026-01-01'],
				speciesIds: [101]
			})
		);
	});

	it('omits periods/speciesIds from the call when not given', async () => {
		vi.mocked(getGroupCookie).mockResolvedValueOnce(7);

		await fetchStatsCacheDiscrepancies({
			temporalUnit: 'all-time',
			bySpecies: false
		});

		const callArgs = mockFindSimpleStatsCacheDiscrepancies.mock.calls[0][1];
		expect(callArgs.periods).toBeUndefined();
		expect(callArgs.speciesIds).toBeUndefined();
	});

	it('returns the discrepant cells returned by the comparison function', async () => {
		vi.mocked(getGroupCookie).mockResolvedValueOnce(7);
		const discrepancies: StatsCacheDiscrepancy[] = [
			{
				species_id: null,
				time_period: '2026-01-01',
				cachedRow: null,
				liveRow: null,
				mismatchedFields: []
			}
		];
		mockFindSimpleStatsCacheDiscrepancies.mockResolvedValueOnce(discrepancies);

		const result = await fetchStatsCacheDiscrepancies({
			temporalUnit: 'all-time',
			bySpecies: false
		});

		expect(result).toEqual({ success: true, discrepancies });
	});

	it('returns a failure result, not a throw, if no group is selected', async () => {
		vi.mocked(getGroupCookie).mockResolvedValueOnce(null);

		const result = await fetchStatsCacheDiscrepancies({
			temporalUnit: 'all-time',
			bySpecies: false
		});

		expect(result).toEqual({ success: false, error: 'No group selected' });
		expect(mockFindSimpleStatsCacheDiscrepancies).not.toHaveBeenCalled();
	});
});
