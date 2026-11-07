import { describe, it, expect, vi, beforeEach } from 'vitest';
import { regenerateStatsCache } from '../regenerate-stats-cache';
import { getGroupCookie } from '../group-cookie';

const { mockRequestManualStatsCacheRegenerate } = vi.hoisted(() => ({
	mockRequestManualStatsCacheRegenerate: vi.fn()
}));

vi.mock('@/modules/stats', () => ({
	requestManualStatsCacheRegenerate: mockRequestManualStatsCacheRegenerate
}));

describe('regenerateStatsCache', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequestManualStatsCacheRegenerate.mockResolvedValue({ success: true });
	});

	it('resolves the group id from the session cookie, never from an input param, and passes it to requestManualStatsCacheRegenerate', async () => {
		vi.mocked(getGroupCookie).mockResolvedValueOnce(42);

		await regenerateStatsCache({ temporalUnit: 'month' });

		expect(getGroupCookie).toHaveBeenCalled();
		expect(mockRequestManualStatsCacheRegenerate).toHaveBeenCalledWith(42, {
			temporalUnit: 'month'
		});
	});

	it('forwards the given params unchanged alongside the resolved groupId', async () => {
		vi.mocked(getGroupCookie).mockResolvedValueOnce(7);
		const params = {
			temporalUnit: 'year' as const,
			periods: ['2024-01-01'],
			speciesIds: [101]
		};

		await regenerateStatsCache(params);

		expect(mockRequestManualStatsCacheRegenerate).toHaveBeenCalledWith(
			7,
			params
		);
	});

	it('returns whatever result requestManualStatsCacheRegenerate resolves with', async () => {
		mockRequestManualStatsCacheRegenerate.mockResolvedValueOnce({
			success: false,
			error: 'Invalid temporal unit'
		});

		const result = await regenerateStatsCache({ temporalUnit: 'month' });

		expect(result).toEqual({
			success: false,
			error: 'Invalid temporal unit'
		});
	});

	it('returns a failure result, not a throw, if no group is selected, without calling requestManualStatsCacheRegenerate', async () => {
		vi.mocked(getGroupCookie).mockResolvedValueOnce(null);

		const result = await regenerateStatsCache({ temporalUnit: 'month' });

		expect(result).toEqual({ success: false, error: 'No group selected' });
		expect(mockRequestManualStatsCacheRegenerate).not.toHaveBeenCalled();
	});
});
