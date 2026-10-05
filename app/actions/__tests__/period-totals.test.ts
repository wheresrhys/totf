import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchAuthorisedCoreStats } from '@/app/lib/auth/group-summary-access';
import type { CoreStatsResult } from '@/app/models/db';
import type { ViewedGroup } from '@/app/lib/group-slug';
import { fetchPeriodTotals } from '../period-totals';

vi.mock('@/app/lib/auth/group-summary-access', () => ({
	fetchAuthorisedCoreStats: vi.fn()
}));

const ROW = { encounter_count: 5 } as CoreStatsResult;
const viewedGroup: ViewedGroup = { id: 1, slug: 'alpha' };

describe('fetchPeriodTotals — routes through the group-summary access helper', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('passes the timeInterval and date range through to the access helper', async () => {
		vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({
			accessLevel: 'own',
			rows: [ROW]
		});

		const result = await fetchPeriodTotals(
			viewedGroup,
			'day',
			'2026-03-01',
			'2026-03-31'
		);

		expect(result).toEqual([ROW]);
		expect(fetchAuthorisedCoreStats).toHaveBeenCalledWith(viewedGroup, {
			from_date: '2026-03-01',
			to_date: '2026-03-31',
			group_by_species: false,
			group_by_time_period: 'day'
		});
	});

	it('omits from/to date keys entirely when not supplied', async () => {
		vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({
			accessLevel: 'blocked',
			rows: []
		});

		await fetchPeriodTotals(viewedGroup, 'year');

		expect(fetchAuthorisedCoreStats).toHaveBeenCalledWith(viewedGroup, {
			group_by_species: false,
			group_by_time_period: 'year'
		});
	});

	it('passes month_filter through when a monthFilter is supplied', async () => {
		vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({
			accessLevel: 'own',
			rows: [ROW]
		});

		await fetchPeriodTotals(viewedGroup, 'day', undefined, undefined, 3);

		expect(fetchAuthorisedCoreStats).toHaveBeenCalledWith(viewedGroup, {
			month_filter: 3,
			group_by_species: false,
			group_by_time_period: 'day'
		});
	});

	it('omits month_filter when no monthFilter is supplied', async () => {
		vi.mocked(fetchAuthorisedCoreStats).mockResolvedValue({
			accessLevel: 'own',
			rows: [ROW]
		});

		await fetchPeriodTotals(viewedGroup, 'day');

		expect(fetchAuthorisedCoreStats).toHaveBeenCalledWith(viewedGroup, {
			group_by_species: false,
			group_by_time_period: 'day'
		});
	});
});
