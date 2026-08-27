'use server';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { AggregateStatsResult } from '@/app/models/db';
import type { PeriodTotalsGrouping } from '@/app/models/period-totals';

/**
 * Per-time-period totals for a summary period — `aggregate_stats` grouped by
 * time period rather than species, so it returns one row per year/month/day
 * that actually had sessions (the day spine is sparse — days with no session
 * never appear), ordered ascending by date. Feeds the shared
 * `PeriodTotalsTable`.
 */
export async function fetchPeriodTotals(
	viewedGroupId: number,
	grouping: PeriodTotalsGrouping,
	fromDate?: string,
	toDate?: string
): Promise<AggregateStatsResult[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('aggregate_stats', {
			...(fromDate ? { from_date: fromDate } : {}),
			...(toDate ? { to_date: toDate } : {}),
			ringing_group_filter: viewedGroupId,
			group_by_species: false,
			group_by_time_period: grouping
		})
		.then(catchSupabaseErrors) as Promise<AggregateStatsResult[]>;
}
