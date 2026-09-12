import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchAuthorisedAggregateStats } from '@/app/lib/auth/group-summary-access';
import type { AggregateStatsResult } from '@/app/models/db';
import { fetchPeriodTotals } from '../period-totals';

vi.mock('@/app/lib/auth/group-summary-access', () => ({
	fetchAuthorisedAggregateStats: vi.fn()
}));

const ROW = { encounter_count: 5 } as unknown as AggregateStatsResult;

describe('fetchPeriodTotals — routes through the group-summary access helper', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('passes the timeInterval and date range through to the access helper', async () => {
		vi.mocked(fetchAuthorisedAggregateStats).mockResolvedValue({
			accessLevel: 'own',
			rows: [ROW]
		});

		const result = await fetchPeriodTotals(
			1,
			'day',
			'2026-03-01',
			'2026-03-31'
		);

		expect(result).toEqual([ROW]);
		expect(fetchAuthorisedAggregateStats).toHaveBeenCalledWith(1, {
			from_date: '2026-03-01',
			to_date: '2026-03-31',
			group_by_species: false,
			group_by_time_period: 'day'
		});
	});

	it('omits from/to date keys entirely when not supplied', async () => {
		vi.mocked(fetchAuthorisedAggregateStats).mockResolvedValue({
			accessLevel: 'blocked',
			rows: []
		});

		await fetchPeriodTotals(1, 'year');

		expect(fetchAuthorisedAggregateStats).toHaveBeenCalledWith(1, {
			group_by_species: false,
			group_by_time_period: 'year'
		});
	});
});
