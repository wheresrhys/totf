import { describe, it, expect } from 'vitest';
import {
	buildPivotGrid,
	buildStatsPivotQuery,
	parseStatsPivotSearchParams,
	seedMetricSelection,
	formatMetricValue,
	METRIC_COLOURS,
	PIVOT_METRICS,
	toggleMetricSelection,
	type MetricSelection,
	type PivotSourceRows,
	type PivotMetricColumn
} from '../stats-pivot';
import { buildCoreStatsRow } from '@/app/__tests__/helpers/core-stats-fixtures';

function selectInTurn(columns: PivotMetricColumn[]): MetricSelection {
	return columns.reduce(toggleMetricSelection, [] as MetricSelection);
}

describe('toggling a metric', () => {
	it('gives the first selected metric the first colour', () => {
		expect(selectInTurn(['bird_count'])).toEqual([
			{ column: 'bird_count', colourIndex: 0 }
		]);
	});

	it('gives each further metric the next unused colour', () => {
		expect(selectInTurn(['bird_count', 'encounter_count'])).toEqual([
			{ column: 'bird_count', colourIndex: 0 },
			{ column: 'encounter_count', colourIndex: 1 }
		]);
	});

	it('removes a selected metric when toggled again', () => {
		expect(selectInTurn(['bird_count', 'bird_count'])).toEqual([]);
	});

	it("keeps remaining metrics' colours when an earlier one is deselected", () => {
		expect(
			selectInTurn(['bird_count', 'encounter_count', 'bird_count'])
		).toEqual([{ column: 'encounter_count', colourIndex: 1 }]);
	});

	it('reuses the lowest freed colour for a newly selected metric', () => {
		expect(
			selectInTurn([
				'bird_count',
				'encounter_count',
				'species_count',
				'bird_count',
				'session_count'
			])
		).toEqual([
			{ column: 'encounter_count', colourIndex: 1 },
			{ column: 'species_count', colourIndex: 2 },
			{ column: 'session_count', colourIndex: 0 }
		]);
	});

	it('ignores a new selection once every colour is in use', () => {
		const fullSelection = selectInTurn(
			PIVOT_METRICS.slice(0, METRIC_COLOURS.length).map(({ column }) => column)
		);
		const unselectedColumn = PIVOT_METRICS[METRIC_COLOURS.length].column;
		expect(toggleMetricSelection(fullSelection, unselectedColumn)).toBe(
			fullSelection
		);
	});
});

function buildSourceRows(
	overrides: Partial<PivotSourceRows> = {}
): PivotSourceRows {
	return {
		monthRows: [],
		yearRows: [],
		monthSquashedRows: [],
		allTimeRows: [],
		...overrides
	};
}

describe('building the pivot grid', () => {
	it('creates one row per year, latest first', () => {
		const grid = buildPivotGrid(
			buildSourceRows({
				monthRows: [
					buildCoreStatsRow({ time_period: '2024-03-01' }),
					buildCoreStatsRow({ time_period: '2026-01-01' }),
					buildCoreStatsRow({ time_period: '2024-05-01' })
				]
			})
		);
		expect(grid.years.map(({ year }) => year)).toEqual([2026, 2024]);
	});

	it('places each month row under its month, leaving months without data empty', () => {
		const marchRow = buildCoreStatsRow({ time_period: '2024-03-01' });
		const {
			years: [{ months }]
		} = buildPivotGrid(buildSourceRows({ monthRows: [marchRow] }));
		expect(months).toHaveLength(12);
		expect(months[2]).toBe(marchRow);
		expect(months.filter(Boolean)).toHaveLength(1);
	});

	describe('totals', () => {
		it("uses each year's year-grain cell as its row total", () => {
			const yearRow = buildCoreStatsRow({ time_period: '2024-01-01' });
			const {
				years: [{ total }]
			} = buildPivotGrid(
				buildSourceRows({
					monthRows: [buildCoreStatsRow({ time_period: '2024-03-01' })],
					yearRows: [yearRow]
				})
			);
			expect(total).toBe(yearRow);
		});

		it('uses the month-squashed cells as the month totals', () => {
			const squashedMayRow = buildCoreStatsRow({ time_period: '0001-05-01' });
			const { monthTotals } = buildPivotGrid(
				buildSourceRows({ monthSquashedRows: [squashedMayRow] })
			);
			expect(monthTotals[4]).toBe(squashedMayRow);
			expect(monthTotals.filter(Boolean)).toHaveLength(1);
		});

		it('uses the all-time cell as the grand total', () => {
			const allTimeRow = buildCoreStatsRow({ time_period: '0001-01-01' });
			const { grandTotal } = buildPivotGrid(
				buildSourceRows({ allTimeRows: [allTimeRow] })
			);
			expect(grandTotal).toBe(allTimeRow);
		});
	});
});

describe('formatting metric values', () => {
	it('shows a dash for a missing value', () => {
		expect(formatMetricValue(null)).toBe('–');
	});

	it('rounds fractional values to one decimal place', () => {
		expect(formatMetricValue(1.75)).toBe('1.8');
	});

	it('shows whole numbers as they are', () => {
		expect(formatMetricValue(40)).toBe('40');
	});
});

describe('reading the URL', () => {
	it('reads the species', () => {
		expect(parseStatsPivotSearchParams({ species: 'Robin' }).species).toBe(
			'Robin'
		);
	});

	it('treats a missing or empty species as all species', () => {
		expect(parseStatsPivotSearchParams({}).species).toBeNull();
		expect(parseStatsPivotSearchParams({ species: '' }).species).toBeNull();
	});

	it('accepts a single stats value', () => {
		expect(
			parseStatsPivotSearchParams({ stats: 'bird_count' }).selectedStats
		).toEqual(['bird_count']);
	});

	it('keeps known stats in order, dropping unknown and repeated ones', () => {
		expect(
			parseStatsPivotSearchParams({
				stats: [
					'encounter_count',
					'not_a_column',
					'bird_count',
					'encounter_count'
				]
			}).selectedStats
		).toEqual(['encounter_count', 'bird_count']);
	});
});

describe('seeding a selection from the URL', () => {
	it('assigns colours in listed order', () => {
		expect(seedMetricSelection(['encounter_count', 'bird_count'])).toEqual([
			{ column: 'encounter_count', colourIndex: 0 },
			{ column: 'bird_count', colourIndex: 1 }
		]);
	});
});

describe('writing the URL', () => {
	it('writes the species and the stats in colour order', () => {
		const selection: MetricSelection = [
			{ column: 'bird_count', colourIndex: 2 },
			{ column: 'encounter_count', colourIndex: 0 }
		];
		expect(buildStatsPivotQuery('Robin', selection)).toBe(
			'species=Robin&stats=encounter_count&stats=bird_count'
		);
	});

	it('writes nothing for all species and no stats', () => {
		expect(buildStatsPivotQuery(null, [])).toBe('');
	});
});
