'use server';
import { readStatsCacheRows, type StatsCacheResult } from '@/modules/stats';
import type { ViewedGroup } from '@/app/lib/group-slug';

/**
 * Every all-species-combined month cell a group has — the stats-pivot page's
 * only fetch. Metric selection is a client-side filter over these rows.
 */
export async function fetchStatsPivotRows(
	viewedGroup: ViewedGroup
): Promise<StatsCacheResult[]> {
	const rows = await readStatsCacheRows({
		viewedGroup,
		bySpecies: false,
		temporalUnit: 'month'
	});
	return rows as StatsCacheResult[];
}
