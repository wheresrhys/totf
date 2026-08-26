'use server';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { AggregateStatsResult } from '@/app/models/db';

/**
 * Page-wide (ungrouped) totals for a summary period — no `group_by_species`/
 * `group_by_time_period`, so `aggregate_stats` returns at most one row.
 */
export async function fetchSummaryStats(
	viewedGroupId: number,
	fromDate?: string,
	toDate?: string
): Promise<AggregateStatsResult | null> {
	const supabase = await getAuthenticatedSupabaseClient();
	const rows = (await supabase
		.rpc('aggregate_stats', {
			ringing_group_filter: viewedGroupId,
			...(fromDate ? { from_date: fromDate } : {}),
			...(toDate ? { to_date: toDate } : {})
		})
		.then(catchSupabaseErrors)) as AggregateStatsResult[] | null;
	return rows?.[0] ?? null;
}
