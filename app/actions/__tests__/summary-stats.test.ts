import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchAuthorisedCoreStats } from '@/app/lib/auth/group-summary-access';
import type { CoreStatsResult } from '@/app/models/db';
import type { ViewedGroup } from '@/app/lib/group-slug';
import {
	fetchSummaryStats,
	fetchPeriodStats,
	fetchYearlyTotals,
	fetchCombinedMonthTotals
} from '../summary-stats';

vi.mock('@/app/lib/auth/group-summary-access', () => ({
	fetchAuthorisedCoreStats: vi.fn()
}));

const ROW = { encounter_count: 5 } as CoreStatsResult;
const viewedGroup: ViewedGroup = { id: 1, slug: 'alpha' };

describe('summary-stats actions — route through the group-summary access helper', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('fetchSummaryStats', () => {
		it('returns the first row from the access helper', async () => {
			vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({
				accessLevel: 'own',
				rows: [ROW]
			});

			const result = await fetchSummaryStats(
				viewedGroup,
				'2026-01-01',
				'2026-01-31'
			);

			expect(result).toBe(ROW);
			expect(fetchAuthorisedCoreStats).toHaveBeenCalledWith(viewedGroup, {
				from_date: '2026-01-01',
				to_date: '2026-01-31'
			});
		});

		it('returns null when the access helper has nothing accessible', async () => {
			vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({
				accessLevel: 'blocked',
				rows: []
			});

			const result = await fetchSummaryStats(viewedGroup);

			expect(result).toBeNull();
			expect(fetchAuthorisedCoreStats).toHaveBeenCalledWith(viewedGroup, {});
		});

		it('passes month_filter through when a monthFilter is supplied', async () => {
			vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({
				accessLevel: 'own',
				rows: [ROW]
			});

			await fetchSummaryStats(viewedGroup, undefined, undefined, 1);

			expect(fetchAuthorisedCoreStats).toHaveBeenCalledWith(viewedGroup, {
				month_filter: 1
			});
		});

		it('omits month_filter when no monthFilter is supplied', async () => {
			vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({
				accessLevel: 'own',
				rows: [ROW]
			});

			await fetchSummaryStats(viewedGroup);

			expect(fetchAuthorisedCoreStats).toHaveBeenCalledWith(viewedGroup, {});
		});
	});

	describe('fetchPeriodStats', () => {
		it('passes the timeInterval and date range through to the access helper', async () => {
			vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({
				accessLevel: 'own',
				rows: [ROW]
			});

			const result = await fetchPeriodStats(
				viewedGroup,
				'month',
				'2026-01-01',
				'2026-12-31'
			);

			expect(result).toEqual([ROW]);
			expect(fetchAuthorisedCoreStats).toHaveBeenCalledWith(viewedGroup, {
				group_by_species: false,
				group_by_time_period: 'month',
				from_date: '2026-01-01',
				to_date: '2026-12-31'
			});
		});

		it('passes month_filter through when a monthFilter is supplied', async () => {
			vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({
				accessLevel: 'own',
				rows: [ROW]
			});

			await fetchPeriodStats(viewedGroup, 'year', undefined, undefined, 1);

			expect(fetchAuthorisedCoreStats).toHaveBeenCalledWith(viewedGroup, {
				group_by_species: false,
				group_by_time_period: 'year',
				month_filter: 1
			});
		});

		it('omits month_filter when no monthFilter is supplied', async () => {
			vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({
				accessLevel: 'own',
				rows: [ROW]
			});

			await fetchPeriodStats(viewedGroup, 'day');

			expect(fetchAuthorisedCoreStats).toHaveBeenCalledWith(viewedGroup, {
				group_by_species: false,
				group_by_time_period: 'day'
			});
		});
	});

	describe('fetchCombinedMonthTotals', () => {
		it("requests 'month-squashed'-grouped, ungrouped-by-species stats with no date range", async () => {
			vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({
				accessLevel: 'own',
				rows: [ROW]
			});

			const result = await fetchCombinedMonthTotals(viewedGroup);

			expect(result).toEqual([ROW]);
			expect(fetchAuthorisedCoreStats).toHaveBeenCalledWith(viewedGroup, {
				group_by_species: false,
				group_by_time_period: 'month-squashed'
			});
		});

		it('returns an empty array when the access helper has nothing accessible', async () => {
			vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({
				accessLevel: 'blocked',
				rows: []
			});

			const result = await fetchCombinedMonthTotals(viewedGroup);

			expect(result).toEqual([]);
		});
	});

	describe('fetchYearlyTotals', () => {
		it('requests year-grouped, ungrouped-by-species stats with no date range', async () => {
			vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({
				accessLevel: 'own',
				rows: [ROW]
			});

			const result = await fetchYearlyTotals(viewedGroup);

			expect(result).toEqual([ROW]);
			expect(fetchAuthorisedCoreStats).toHaveBeenCalledWith(viewedGroup, {
				group_by_species: false,
				group_by_time_period: 'year'
			});
		});
	});
});
