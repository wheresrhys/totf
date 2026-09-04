import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { LineChartData } from 'react-chartkick';
import {
	toYearOnYearSeries,
	YearComparisonTrendChart
} from '../YearComparisonTrendChart';

// chartkick registers Chart.js as a side effect; the chart itself is mocked so
// no real canvas renders. The mock surfaces its `data`/`xtitle` props so tests
// can assert what each chart was handed.
vi.mock('chartkick/chart.js', () => ({}));
vi.mock('react-chartkick', () => ({
	LineChart: ({ data, xtitle }: { data: LineChartData[]; xtitle: string }) => (
		<div
			data-testid="line-chart"
			data-xtitle={xtitle}
			data-series={JSON.stringify(data.map((series) => series.name))}
		/>
	)
}));

const MONTHS = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec'
];

describe('toYearOnYearSeries', () => {
	describe('Usual: regrouping monthly points by year', () => {
		it('produces one series per calendar year, named by year', () => {
			const metric: LineChartData = {
				name: 'encounters',
				data: [
					['2023-03-01', 5],
					['2023-06-01', 9],
					['2024-03-01', 7]
				]
			};
			const result = toYearOnYearSeries(metric);
			expect(result.map((series) => series.name)).toEqual(['2023', '2024']);
		});
	});

	describe('Structure: fixed twelve-month axis', () => {
		it('gives every year series all twelve months in Jan→Dec order', () => {
			const metric: LineChartData = {
				name: 'encounters',
				data: [
					['2023-03-01', 5],
					['2024-11-01', 7]
				]
			};
			for (const series of toYearOnYearSeries(metric)) {
				expect(series.data.map(([month]) => month)).toEqual(MONTHS);
			}
		});

		it('places each value in its own calendar-month slot', () => {
			const metric: LineChartData = {
				name: 'encounters',
				data: [
					['2024-01-01', 10],
					['2024-03-01', 30],
					['2024-12-01', 120]
				]
			};
			const [year2024] = toYearOnYearSeries(metric);
			expect(year2024.data[0]).toEqual(['Jan', 10]);
			expect(year2024.data[2]).toEqual(['Mar', 30]);
			expect(year2024.data[11]).toEqual(['Dec', 120]);
		});
	});

	describe('Edge: gaps, emptiness and ordering', () => {
		it('represents months with no data as null', () => {
			const metric: LineChartData = {
				name: 'encounters',
				data: [['2024-03-01', 30]]
			};
			const [year2024] = toYearOnYearSeries(metric);
			expect(year2024.data[0]).toEqual(['Jan', null]);
			expect(year2024.data[2]).toEqual(['Mar', 30]);
		});

		it('returns an empty array for a metric with no points', () => {
			expect(toYearOnYearSeries({ name: 'encounters', data: [] })).toEqual([]);
		});

		it('orders years oldest-first regardless of input order', () => {
			const metric: LineChartData = {
				name: 'encounters',
				data: [
					['2024-01-01', 1],
					['2022-01-01', 1],
					['2023-01-01', 1]
				]
			};
			expect(toYearOnYearSeries(metric).map((series) => series.name)).toEqual([
				'2022',
				'2023',
				'2024'
			]);
		});
	});
});

describe('YearComparisonTrendChart', () => {
	afterEach(cleanup);

	const series: LineChartData[] = [
		{
			name: 'encounters',
			data: [
				['2023-01-01', 5],
				['2024-01-01', 8]
			]
		},
		{
			name: 'birds',
			data: [
				['2023-01-01', 3],
				['2024-01-01', 6]
			]
		}
	];

	describe('Usual: default all-time view', () => {
		it('renders a single chart of every metric across the full timeline', () => {
			render(<YearComparisonTrendChart series={series} />);
			const charts = screen.getAllByTestId('line-chart');
			expect(charts).toHaveLength(1);
			expect(charts[0].dataset.xtitle).toBe('Year');
			expect(charts[0].dataset.series).toBe(
				JSON.stringify(['encounters', 'birds'])
			);
		});
	});

	describe('Structure: year-on-year view', () => {
		it('renders one month-axis chart per metric when toggled on', () => {
			render(<YearComparisonTrendChart series={series} />);
			fireEvent.click(screen.getByRole('radio', { name: 'Year on year' }));
			const charts = screen.getAllByTestId('line-chart');
			expect(charts).toHaveLength(2);
			for (const chart of charts) {
				expect(chart.dataset.xtitle).toBe('Month');
			}
		});
	});

	describe('Structure: toggling back to all-time', () => {
		it('restores the single all-time chart', () => {
			render(<YearComparisonTrendChart series={series} />);
			fireEvent.click(screen.getByRole('radio', { name: 'Year on year' }));
			fireEvent.click(screen.getByRole('radio', { name: 'All time' }));
			expect(screen.getAllByTestId('line-chart')).toHaveLength(1);
		});
	});
});
