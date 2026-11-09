import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchStatsCacheDiscrepancies } from '../stats-cache-discrepancies';
import { getGroupCookie } from '../group-cookie';
import type { StatsCacheDiscrepancy } from '@/modules/stats';

const {
	mockFindSimpleStatsCacheDiscrepancies,
	mockReadStatsCacheRows,
	mockGetAuthenticatedSupabaseClient
} = vi.hoisted(() => ({
	mockFindSimpleStatsCacheDiscrepancies: vi.fn(),
	mockReadStatsCacheRows: vi.fn(),
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/modules/stats', () => ({
	findSimpleStatsCacheDiscrepancies: mockFindSimpleStatsCacheDiscrepancies,
	readStatsCacheRows: mockReadStatsCacheRows
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
		mockReadStatsCacheRows.mockResolvedValue([]);
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
		expect(mockReadStatsCacheRows).not.toHaveBeenCalled();
	});

	it('leaves periods undefined for all-time when not given, without reading the cache for a default', async () => {
		vi.mocked(getGroupCookie).mockResolvedValueOnce(7);

		await fetchStatsCacheDiscrepancies({
			temporalUnit: 'all-time',
			bySpecies: false
		});

		const callArgs = mockFindSimpleStatsCacheDiscrepancies.mock.calls[0][1];
		expect(callArgs.periods).toBeUndefined();
		expect(callArgs.speciesIds).toBeUndefined();
		expect(mockReadStatsCacheRows).not.toHaveBeenCalled();
	});

	it("defaults periods to every period already cached for this scope when a narrowing temporalUnit's periods are omitted", async () => {
		vi.mocked(getGroupCookie).mockResolvedValueOnce(7);
		mockReadStatsCacheRows.mockResolvedValueOnce([
			{ time_period: '2026-01-01' },
			{ time_period: '2026-02-01' },
			// A duplicate period (e.g. a second species row on the same cell)
			// must not produce a duplicate entry in the resolved list.
			{ time_period: '2026-01-01' }
		]);

		await fetchStatsCacheDiscrepancies({
			temporalUnit: 'month',
			bySpecies: true
		});

		expect(mockReadStatsCacheRows).toHaveBeenCalledWith(
			expect.objectContaining({
				client: FAKE_CLIENT,
				viewedGroup: { id: 7, slug: null },
				bySpecies: true,
				temporalUnit: 'month'
			})
		);
		expect(mockFindSimpleStatsCacheDiscrepancies).toHaveBeenCalledWith(
			FAKE_CLIENT,
			expect.objectContaining({
				periods: ['2026-01-01', '2026-02-01']
			})
		);
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
