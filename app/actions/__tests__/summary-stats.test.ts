import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchAuthorisedAggregateStats } from '@/app/lib/auth/group-summary-access';
import type { AggregateStatsResult } from '@/app/models/db';
import {
	fetchSummaryStats,
	fetchPeriodStats,
	fetchYearlyTotals
} from '../summary-stats';

vi.mock('@/app/lib/auth/group-summary-access', () => ({
	fetchAuthorisedAggregateStats: vi.fn()
}));

const ROW = { encounter_count: 5 } as unknown as AggregateStatsResult;

describe('summary-stats actions — route through the group-summary access helper', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('fetchSummaryStats', () => {
		it('returns the first row from the access helper', async () => {
			vi.mocked(fetchAuthorisedAggregateStats).mockResolvedValue({
				accessLevel: 'own',
				rows: [ROW]
			});

			const result = await fetchSummaryStats(1, '2026-01-01', '2026-01-31');

			expect(result).toBe(ROW);
			expect(fetchAuthorisedAggregateStats).toHaveBeenCalledWith(1, {
				from_date: '2026-01-01',
				to_date: '2026-01-31'
			});
		});

		it('returns null when the access helper has nothing accessible', async () => {
			vi.mocked(fetchAuthorisedAggregateStats).mockResolvedValue({
				accessLevel: 'blocked',
				rows: []
			});

			const result = await fetchSummaryStats(1);

			expect(result).toBeNull();
			expect(fetchAuthorisedAggregateStats).toHaveBeenCalledWith(1, {});
		});
	});

	describe('fetchPeriodStats', () => {
		it('passes the timeInterval and date range through to the access helper', async () => {
			vi.mocked(fetchAuthorisedAggregateStats).mockResolvedValue({
				accessLevel: 'own',
				rows: [ROW]
			});

			const result = await fetchPeriodStats(
				1,
				'month',
				'2026-01-01',
				'2026-12-31'
			);

			expect(result).toEqual([ROW]);
			expect(fetchAuthorisedAggregateStats).toHaveBeenCalledWith(1, {
				group_by_species: false,
				group_by_time_period: 'month',
				from_date: '2026-01-01',
				to_date: '2026-12-31'
			});
		});
	});

	describe('fetchYearlyTotals', () => {
		it('requests year-grouped, ungrouped-by-species stats with no date range', async () => {
			vi.mocked(fetchAuthorisedAggregateStats).mockResolvedValue({
				accessLevel: 'own',
				rows: [ROW]
			});

			const result = await fetchYearlyTotals(1);

			expect(result).toEqual([ROW]);
			expect(fetchAuthorisedAggregateStats).toHaveBeenCalledWith(1, {
				group_by_species: false,
				group_by_time_period: 'year'
			});
		});
	});
});
