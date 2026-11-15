import type { StatsCacheResult } from '@/modules/stats/browser';

/** Selection + pivot-grid logic for the `/stats-pivot` page. */

export type PivotMetricColumn = Exclude<
	keyof StatsCacheResult,
	'species_name' | 'time_period'
>;

export const PIVOT_METRICS: { column: PivotMetricColumn; label: string }[] = [
	{ column: 'species_count', label: 'Species' },
	{ column: 'bird_count', label: 'Birds' },
	{ column: 'encounter_count', label: 'Encounters' },
	{ column: 'new_bird_count', label: 'New birds' },
	{ column: 'session_count', label: 'Sessions' },
	{ column: 'avg_encounters_per_session', label: 'Avg per session' },
	{ column: 'max_per_session', label: 'Max per session' },
	{ column: 'max_new_per_session', label: 'Max new per session' },
	{ column: 'max_weight', label: 'Max weight (g)' },
	{ column: 'avg_weight', label: 'Avg weight (g)' },
	{ column: 'min_weight', label: 'Min weight (g)' },
	{ column: 'median_weight', label: 'Median weight (g)' },
	{ column: 'max_wing', label: 'Max wing (mm)' },
	{ column: 'avg_wing', label: 'Avg wing (mm)' },
	{ column: 'min_wing', label: 'Min wing (mm)' },
	{ column: 'median_wing', label: 'Median wing (mm)' },
	{ column: 'pullus_bird_count', label: 'Pulli birds' },
	{ column: 'juv_bird_count', label: 'Juv birds' },
	{ column: 'postjuv_bird_count', label: 'Postjuv birds' },
	{ column: 'adult_bird_count', label: 'Adult birds' },
	{ column: 'unknown_age_bird_count', label: 'Not aged birds' },
	{ column: 'new_young_bird_count', label: 'New young birds' },
	{ column: 'pullus_enc_count', label: 'Pulli encounters' },
	{ column: 'juv_enc_count', label: 'Juv encounters' },
	{ column: 'postjuv_enc_count', label: 'Postjuv encounters' },
	{ column: 'adult_enc_count', label: 'Adult encounters' },
	{ column: 'unknown_age_enc_count', label: 'Not aged encounters' },
	{ column: 'postjuv_juv_enc_count', label: 'Postjuv + juv encounters' },
	{
		column: 'new_postjuv_juv_enc_count',
		label: 'New postjuv + juv encounters'
	},
	{ column: 'new_postjuv_enc_count', label: 'New postjuv encounters' }
];

// Literal class strings so Tailwind's scanner picks them up. Pastel in light
// mode, dark shades in dark mode, so text stays legible on either.
export const METRIC_COLOURS = [
	'bg-stone-300 dark:bg-stone-700',
	'bg-blue-200 dark:bg-blue-800',
	'bg-red-200 dark:bg-red-800',
	'bg-green-200 dark:bg-green-800',
	'bg-amber-200 dark:bg-amber-800',
	'bg-purple-200 dark:bg-purple-800',
	'bg-pink-200 dark:bg-pink-800',
	'bg-teal-200 dark:bg-teal-800'
];

export type MetricSelection = {
	column: PivotMetricColumn;
	colourIndex: number;
}[];

/**
 * Deselects a selected metric (leaving every other metric's colour alone), or
 * selects an unselected one with the lowest colour not already in use. A no-op
 * once every colour is taken.
 */
export function toggleMetricSelection(
	selection: MetricSelection,
	column: PivotMetricColumn
): MetricSelection {
	if (selection.some((selected) => selected.column === column)) {
		return selection.filter((selected) => selected.column !== column);
	}
	const usedColourIndexes = new Set(
		selection.map((selected) => selected.colourIndex)
	);
	const colourIndex = METRIC_COLOURS.findIndex(
		(_, index) => !usedColourIndexes.has(index)
	);
	if (colourIndex === -1) {
		return selection;
	}
	return [...selection, { column, colourIndex }];
}

export type PivotGridRow = {
	year: number;
	months: (StatsCacheResult | undefined)[];
};

/** One row per year (latest first), each with a slot per calendar month. */
export function buildPivotGrid(rows: StatsCacheResult[]): PivotGridRow[] {
	const gridRowsByYear = new Map<number, PivotGridRow>();
	rows.forEach((row) => {
		const year = parseInt(row.time_period.slice(0, 4));
		const monthIndex = parseInt(row.time_period.slice(5, 7)) - 1;
		if (!gridRowsByYear.has(year)) {
			gridRowsByYear.set(year, { year, months: Array(12).fill(undefined) });
		}
		gridRowsByYear.get(year)!.months[monthIndex] = row;
	});
	return [...gridRowsByYear.values()].sort(
		(oneRow, otherRow) => otherRow.year - oneRow.year
	);
}

export function formatMetricValue(value: number | null | undefined): string {
	if (value === null || value === undefined) {
		return '–';
	}
	return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
