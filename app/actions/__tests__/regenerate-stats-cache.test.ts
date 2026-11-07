import { describe, it, expect, vi, beforeEach } from 'vitest';
import { regenerateStatsCache } from '../regenerate-stats-cache';
import { getGroupCookie } from '../group-cookie';

const { mockDispatchManualStatsCacheRegenerateEvent } = vi.hoisted(() => ({
	mockDispatchManualStatsCacheRegenerateEvent: vi.fn()
}));

vi.mock('@/modules/stats', () => ({
	dispatchManualStatsCacheRegenerateEvent:
		mockDispatchManualStatsCacheRegenerateEvent
}));

describe('regenerateStatsCache', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDispatchManualStatsCacheRegenerateEvent.mockResolvedValue(undefined);
	});

	it('resolves the group id from the session cookie, never from an input param', async () => {
		vi.mocked(getGroupCookie).mockResolvedValueOnce(42);

		await regenerateStatsCache({ temporalUnit: 'month' });

		expect(getGroupCookie).toHaveBeenCalled();
		expect(mockDispatchManualStatsCacheRegenerateEvent).toHaveBeenCalledWith(
			expect.objectContaining({ groupId: 42 })
		);
	});

	it('calls dispatchManualStatsCacheRegenerateEvent with the resolved groupId and the given temporalUnit/periods/speciesIds', async () => {
		vi.mocked(getGroupCookie).mockResolvedValueOnce(7);

		await regenerateStatsCache({
			temporalUnit: 'year',
			periods: ['2024-01-01'],
			speciesIds: [101]
		});

		expect(mockDispatchManualStatsCacheRegenerateEvent).toHaveBeenCalledWith({
			groupId: 7,
			temporalUnit: 'year',
			periods: ['2024-01-01'],
			speciesIds: [101]
		});
	});

	it('omits periods from the dispatched params when none are given', async () => {
		await regenerateStatsCache({ temporalUnit: 'year', speciesIds: [101] });

		const dispatchedParams =
			mockDispatchManualStatsCacheRegenerateEvent.mock.calls[0][0];
		expect(dispatchedParams).not.toHaveProperty('periods');
	});

	it('omits speciesIds from the dispatched params when none are given', async () => {
		await regenerateStatsCache({
			temporalUnit: 'year',
			periods: ['2024-01-01']
		});

		const dispatchedParams =
			mockDispatchManualStatsCacheRegenerateEvent.mock.calls[0][0];
		expect(dispatchedParams).not.toHaveProperty('speciesIds');
	});

	it('returns a failure result without calling dispatchManualStatsCacheRegenerateEvent for an invalid temporalUnit', async () => {
		const result = await regenerateStatsCache({
			// eslint-disable-next-line no-restricted-syntax -- deliberately invalid input under test
			temporalUnit: 'decade' as unknown as 'month'
		});

		expect(result).toEqual({ success: false, error: expect.any(String) });
		expect(mockDispatchManualStatsCacheRegenerateEvent).not.toHaveBeenCalled();
	});

	it('returns a failure result for an empty periods/speciesIds array', async () => {
		const emptyPeriodsResult = await regenerateStatsCache({
			temporalUnit: 'month',
			periods: []
		});
		const emptySpeciesIdsResult = await regenerateStatsCache({
			temporalUnit: 'month',
			speciesIds: []
		});

		expect(emptyPeriodsResult).toEqual({
			success: false,
			error: expect.any(String)
		});
		expect(emptySpeciesIdsResult).toEqual({
			success: false,
			error: expect.any(String)
		});
		expect(mockDispatchManualStatsCacheRegenerateEvent).not.toHaveBeenCalled();
	});

	it('returns a success result once dispatch resolves', async () => {
		const result = await regenerateStatsCache({ temporalUnit: 'all-time' });

		expect(result).toEqual({ success: true });
	});

	it('returns a failure result, not a throw, if no group is selected', async () => {
		vi.mocked(getGroupCookie).mockResolvedValueOnce(null);

		const result = await regenerateStatsCache({ temporalUnit: 'month' });

		expect(result).toEqual({ success: false, error: expect.any(String) });
		expect(mockDispatchManualStatsCacheRegenerateEvent).not.toHaveBeenCalled();
	});
});
