'use server';
import { fetchAuthorisedCoreStats } from '@/app/lib/auth/group-summary-access';
import type { CoreStatsResult } from '@/app/models/db';

/**
 * Page-wide (ungrouped) totals for a summary period — no `group_by_species`/
 * `group_by_time_period`, so `core_stats` returns at most one row.
 */
export async function fetchSummaryStats(
	viewedGroupId: number,
	fromDate?: string,
	toDate?: string
): Promise<CoreStatsResult | null> {
	const { rows } = await fetchAuthorisedCoreStats(viewedGroupId, {
		...(fromDate ? { from_date: fromDate } : {}),
		...(toDate ? { to_date: toDate } : {})
	});
	return rows[0] ?? null;
}

/**
 * Per-period (ungrouped by species) totals for a summary range — one row per
 * `timeInterval` bucket the RPC found within `fromDate`..`toDate`. The RPC's spine
 * only spans actual session dates, so callers that need every calendar bucket
 * present (e.g. all 12 months) zero-fill the gaps themselves.
 */
export async function fetchPeriodStats(
	viewedGroupId: number,
	timeInterval: 'year' | 'month' | 'day',
	fromDate?: string,
	toDate?: string
): Promise<CoreStatsResult[]> {
	const { rows } = await fetchAuthorisedCoreStats(viewedGroupId, {
		group_by_species: false,
		group_by_time_period: timeInterval,
		...(fromDate ? { from_date: fromDate } : {}),
		...(toDate ? { to_date: toDate } : {})
	});
	return rows;
}

/**
 * One row per year with data, for the all-time summary page's "Year totals"
 * tab. `core_stats`'s `period_spine` CTE is already dense across the
 * group's earliest-to-latest session year and arrives `ORDER BY time_period
 * ASC` — no client-side zero-fill or re-sorting needed.
 */
export async function fetchYearlyTotals(
	viewedGroupId: number
): Promise<CoreStatsResult[]> {
	const { rows } = await fetchAuthorisedCoreStats(viewedGroupId, {
		group_by_species: false,
		group_by_time_period: 'year'
	});
	return rows;
}
