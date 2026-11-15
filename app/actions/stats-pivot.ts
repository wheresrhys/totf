'use server';
import { readStatsCacheRows, type StatsCacheResult } from '@/modules/stats';
import type { StatsTemporalUnit } from '@/app/models/temporal-unit';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { PivotSourceRows } from '@/app/lib/stats-pivot';

async function readAllSpeciesRows(
	viewedGroup: ViewedGroup,
	temporalUnit: StatsTemporalUnit
): Promise<StatsCacheResult[]> {
	const rows = await readStatsCacheRows({
		viewedGroup,
		bySpecies: false,
		temporalUnit
	});
	return rows as StatsCacheResult[];
}

/**
 * The stats-pivot page's only fetch: the month-grain cells for the grid body,
 * plus the year, month-squashed and all-time cells for its totals — read
 * straight from the cache rather than summed, since distinct counts don't sum.
 * Metric selection is a client-side filter over these rows.
 */
export async function fetchStatsPivotRows(
	viewedGroup: ViewedGroup
): Promise<PivotSourceRows> {
	const [monthRows, yearRows, monthSquashedRows, allTimeRows] =
		await Promise.all([
			readAllSpeciesRows(viewedGroup, 'month'),
			readAllSpeciesRows(viewedGroup, 'year'),
			readAllSpeciesRows(viewedGroup, 'month-squashed'),
			readAllSpeciesRows(viewedGroup, 'all-time')
		]);
	return { monthRows, yearRows, monthSquashedRows, allTimeRows };
}
