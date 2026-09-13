'use server';
import { fetchAuthorisedCoreStats } from '@/app/lib/auth/group-summary-access';
import type { AggregateStatsResult } from '@/app/models/db';
import type { PeriodTotalsGrouping } from '@/app/lib/period-totals';

/**
 * Per-time-period totals for a summary period — `core_stats` grouped by
 * time period rather than species, so it returns one row per year/month/day
 * that actually had sessions (the day spine is sparse — days with no session
 * never appear), ordered ascending by date. Feeds the shared
 * `PeriodTotalsTable`.
 */
export async function fetchPeriodTotals(
	viewedGroupId: number,
	timeInterval: PeriodTotalsGrouping,
	fromDate?: string,
	toDate?: string
): Promise<AggregateStatsResult[]> {
	const { rows } = await fetchAuthorisedCoreStats(viewedGroupId, {
		...(fromDate ? { from_date: fromDate } : {}),
		...(toDate ? { to_date: toDate } : {}),
		group_by_species: false,
		group_by_time_period: timeInterval
	});
	return rows;
}
