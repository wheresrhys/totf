import { describe, it, expect } from 'vitest';
import {
	buildPivotGrid,
	formatMetricValue,
	METRIC_COLOURS,
	PIVOT_METRICS,
	toggleMetricSelection,
	type MetricSelection,
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

describe('building the pivot grid', () => {
	it('creates one row per year, latest first', () => {
		const grid = buildPivotGrid([
			buildCoreStatsRow({ time_period: '2024-03-01' }),
			buildCoreStatsRow({ time_period: '2026-01-01' }),
			buildCoreStatsRow({ time_period: '2024-05-01' })
		]);
		expect(grid.map(({ year }) => year)).toEqual([2026, 2024]);
	});

	it('places each row under its month, leaving months without data empty', () => {
		const marchRow = buildCoreStatsRow({ time_period: '2024-03-01' });
		const [{ months }] = buildPivotGrid([marchRow]);
		expect(months).toHaveLength(12);
		expect(months[2]).toBe(marchRow);
		expect(months.filter(Boolean)).toHaveLength(1);
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
