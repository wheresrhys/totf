'use server';
import { readStatsCacheRows, type StatsResult } from '@/modules/stats';
import type { StatsTemporalUnit } from '@/app/models/temporal-unit';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { PivotSourceRows } from '@/app/lib/stats-pivot';

async function readPivotRows(
	viewedGroup: ViewedGroup,
	species: string | null,
	temporalUnit: StatsTemporalUnit
): Promise<StatsResult[]> {
	const rows = await readStatsCacheRows({
		viewedGroup,
		bySpecies: species !== null,
		species: species ?? undefined,
		temporalUnit
	});
	return rows as StatsResult[];
}

/**
 * The stats-pivot page's stats fetch: the month-grain cells for the grid body,
 * plus the year, month-squashed and all-time cells for its totals — read
 * straight from the cache rather than summed, since distinct counts don't sum.
 * All species combined when `species` is null, else that one species' cells.
 * Metric selection is a client-side filter over these rows.
 */
export async function fetchStatsPivotRows(
	viewedGroup: ViewedGroup,
	species: string | null
): Promise<PivotSourceRows> {
	const [monthRows, yearRows, monthSquashedRows, allTimeRows] =
		await Promise.all([
			readPivotRows(viewedGroup, species, 'month'),
			readPivotRows(viewedGroup, species, 'year'),
			readPivotRows(viewedGroup, species, 'month-squashed'),
			readPivotRows(viewedGroup, species, 'all-time')
		]);
	return { monthRows, yearRows, monthSquashedRows, allTimeRows };
}
