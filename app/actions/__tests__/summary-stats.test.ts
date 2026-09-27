import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchAuthorisedCoreStats } from '@/app/lib/auth/group-summary-access';
import type { CoreStatsResult } from '@/app/models/db';
import {
	fetchSummaryStats,
	fetchPeriodStats,
	fetchYearlyTotals,
	fetchCombinedMonthSpeciesCounts
} from '../summary-stats';

vi.mock('@/app/lib/auth/group-summary-access', () => ({
	fetchAuthorisedCoreStats: vi.fn()
}));

const ROW = { encounter_count: 5 } as CoreStatsResult;

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

			const result = await fetchSummaryStats(1, '2026-01-01', '2026-01-31');

			expect(result).toBe(ROW);
			expect(fetchAuthorisedCoreStats).toHaveBeenCalledWith(1, {
				from_date: '2026-01-01',
				to_date: '2026-01-31'
			});
		});

		it('returns null when the access helper has nothing accessible', async () => {
			vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({
				accessLevel: 'blocked',
				rows: []
			});

			const result = await fetchSummaryStats(1);

			expect(result).toBeNull();
			expect(fetchAuthorisedCoreStats).toHaveBeenCalledWith(1, {});
		});
	});

	describe('fetchPeriodStats', () => {
		it('passes the timeInterval and date range through to the access helper', async () => {
			vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({
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
			expect(fetchAuthorisedCoreStats).toHaveBeenCalledWith(1, {
				group_by_species: false,
				group_by_time_period: 'month',
				from_date: '2026-01-01',
				to_date: '2026-12-31'
			});
		});
	});

	describe('fetchCombinedMonthSpeciesCounts', () => {
		it('calls the access helper once per calendar month with month_filter 1-12, ungrouped by species', async () => {
			vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({
				accessLevel: 'own',
				rows: [{ ...ROW, species_count: 3 }]
			});

			await fetchCombinedMonthSpeciesCounts(1);

			expect(fetchAuthorisedCoreStats).toHaveBeenCalledTimes(12);
			for (let month = 1; month <= 12; month++) {
				expect(fetchAuthorisedCoreStats).toHaveBeenCalledWith(1, {
					group_by_species: false,
					month_filter: month
				});
			}
		});

		it("returns a record keyed by zeroIndexedMonth (0-11) with each month's distinct species_count", async () => {
			vi.mocked(fetchAuthorisedCoreStats).mockImplementation(
				async (_groupId, params) => ({
					accessLevel: 'own',
					rows: [{ ...ROW, species_count: (params?.month_filter ?? 0) * 10 }]
				})
			);

			const result = await fetchCombinedMonthSpeciesCounts(1);

			expect(result).toEqual({
				0: 10,
				1: 20,
				2: 30,
				3: 40,
				4: 50,
				5: 60,
				6: 70,
				7: 80,
				8: 90,
				9: 100,
				10: 110,
				11: 120
			});
		});

		it('defaults a month to 0 when the access helper returns no rows for it', async () => {
			vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({
				accessLevel: 'blocked',
				rows: []
			});

			const result = await fetchCombinedMonthSpeciesCounts(1);

			expect(result[0]).toBe(0);
		});
	});

	describe('fetchYearlyTotals', () => {
		it('requests year-grouped, ungrouped-by-species stats with no date range', async () => {
			vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({
				accessLevel: 'own',
				rows: [ROW]
			});

			const result = await fetchYearlyTotals(1);

			expect(result).toEqual([ROW]);
			expect(fetchAuthorisedCoreStats).toHaveBeenCalledWith(1, {
				group_by_species: false,
				group_by_time_period: 'year'
			});
		});
	});
});
