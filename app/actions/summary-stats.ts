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

/**
 * Per-period (ungrouped by species) totals for a summary range — one row per
 * `grouping` bucket the RPC found within `fromDate`..`toDate`. The RPC's spine
 * only spans actual session dates, so callers that need every calendar bucket
 * present (e.g. all 12 months) zero-fill the gaps themselves.
 */
export async function fetchPeriodStats(
	viewedGroupId: number,
	grouping: 'year' | 'month' | 'day',
	fromDate?: string,
	toDate?: string
): Promise<AggregateStatsResult[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('aggregate_stats', {
			ringing_group_filter: viewedGroupId,
			group_by_species: false,
			group_by_time_period: grouping,
			...(fromDate ? { from_date: fromDate } : {}),
			...(toDate ? { to_date: toDate } : {})
		})
		.then(catchSupabaseErrors) as Promise<AggregateStatsResult[]>;
}

/**
 * One row per year with data, for the all-time summary page's "Year totals"
 * tab. `aggregate_stats`'s `period_spine` CTE is already dense across the
 * group's earliest-to-latest session year and arrives `ORDER BY time_period
 * ASC` — no client-side zero-fill or re-sorting needed.
 */
export async function fetchYearlyTotals(
	viewedGroupId: number
): Promise<AggregateStatsResult[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('aggregate_stats', {
			ringing_group_filter: viewedGroupId,
			group_by_species: false,
			group_by_time_period: 'year'
		})
		.then(catchSupabaseErrors) as Promise<AggregateStatsResult[]>;
}
