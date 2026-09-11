import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { LineChartData } from 'react-chartkick';
import {
	toYearOnYearSeries,
	toThisYearSeries,
	yearColors,
	thisYearColors,
	normalizeSeriesByEffort,
	YearComparisonTrendChart
} from '../YearComparisonTrendChart';

// chartkick registers Chart.js as a side effect; the chart itself is mocked so
// no real canvas renders. The mock surfaces its `data`/`xtitle`/`ytitle`/`colors`
// props so tests can assert what each chart was handed.
vi.mock('chartkick/chart.js', () => ({}));
vi.mock('react-chartkick', () => ({
	LineChart: ({
		data,
		xtitle,
		ytitle,
		colors
	}: {
		data: LineChartData[];
		xtitle: string;
		ytitle: string;
		colors?: string[];
	}) => (
		<div
			data-testid="line-chart"
			data-xtitle={xtitle}
			data-ytitle={ytitle}
			data-colors={JSON.stringify(colors)}
			data-series={JSON.stringify(data.map((series) => series.name))}
			data-values={JSON.stringify(data.map((series) => series.data))}
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

		it('treats a dense-spine zero-count month as a gap, not a dip to zero', () => {
			const metric: LineChartData = {
				name: 'encounters',
				data: [
					['2024-01-01', 0],
					['2024-03-01', 30]
				]
			};
			const [year2024] = toYearOnYearSeries(metric);
			// The explicit 0 the RPC emits for a quiet month renders as a gap,
			// so the line doesn't dive to the baseline there.
			expect(year2024.data[0]).toEqual(['Jan', null]);
			expect(year2024.data[2]).toEqual(['Mar', 30]);
		});

		it('omits a year whose only points are zero-count months', () => {
			const metric: LineChartData = {
				name: 'encounters',
				data: [
					['2022-05-01', 0],
					['2022-06-01', 0],
					['2023-05-01', 4]
				]
			};
			expect(toYearOnYearSeries(metric).map((series) => series.name)).toEqual([
				'2023'
			]);
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

describe('toThisYearSeries', () => {
	const metric: LineChartData = {
		name: 'encounters',
		data: [
			// two previous years, plus the current year (2025)
			['2023-03-01', 4],
			['2024-03-01', 8],
			['2023-06-01', 10],
			['2024-06-01', 20],
			['2025-03-01', 99]
		]
	};

	describe('Structure: the four summary series', () => {
		it('emits previous max, min, median, then the current year, in that order', () => {
			const result = toThisYearSeries(metric, 2025);
			expect(result.map((series) => series.name)).toEqual([
				'Previous max',
				'Previous min',
				'Previous median',
				'2025'
			]);
		});

		it('makes the min series fill back to the preceding max series', () => {
			const [, min] = toThisYearSeries(metric, 2025);
			expect(min.dataset).toMatchObject({ fill: '-1' });
		});

		it('draws the band behind the median, and the median behind the current year', () => {
			// Chart.js sorts datasets ascending by `order` then draws in reverse, so
			// a lower `order` renders in front. The band (max + min) must sit at the
			// back or its fill covers the median/current-year lines and hides them.
			const [max, min, median, currentYear] = toThisYearSeries(metric, 2025);
			const orderOf = (series: LineChartData) =>
				(series.dataset as { order: number }).order;
			// Band shares the highest order (furthest back).
			expect(orderOf(max)).toBe(orderOf(min));
			expect(orderOf(max)).toBeGreaterThan(orderOf(median));
			// Median in front of the band, current-year line in front of everything.
			expect(orderOf(median)).toBeGreaterThan(orderOf(currentYear));
		});
	});

	describe('Usual: summarising previous years month-by-month', () => {
		it('takes max/min/median across previous years per month', () => {
			const [max, min, median] = toThisYearSeries(metric, 2025);
			// March: previous years 4 and 8
			expect(max.data[2]).toEqual(['Mar', 8]);
			expect(min.data[2]).toEqual(['Mar', 4]);
			expect(median.data[2]).toEqual(['Mar', 6]);
		});

		it('plots the current year on its own line, excluded from the summary', () => {
			const [max, , , currentYear] = toThisYearSeries(metric, 2025);
			expect(currentYear.data[2]).toEqual(['Mar', 99]);
			// 99 is current-year data, so it never inflates the previous-year max
			expect(max.data[2]).toEqual(['Mar', 8]);
		});
	});

	describe('Edge: months with no previous-year data', () => {
		it('emits null for every summary series in an empty month', () => {
			const [max, min, median] = toThisYearSeries(metric, 2025);
			expect(max.data[0]).toEqual(['Jan', null]);
			expect(min.data[0]).toEqual(['Jan', null]);
			expect(median.data[0]).toEqual(['Jan', null]);
		});
	});

	describe('Structure: every series shares one Jan→Dec x-domain', () => {
		it('gives the band, median and current-year lines identical month labels in order', () => {
			// The core alignment guarantee: the current-year line and the
			// previous-year summary lines are plotted against the same twelve
			// category labels, so a month lines up across all of them.
			for (const series of toThisYearSeries(metric, 2025)) {
				expect(series.data.map(([month]) => month)).toEqual(MONTHS);
			}
		});
	});

	describe('Edge: dense-spine zero-count months', () => {
		// The RPC emits an explicit `0` for a month with no encounters; a partial
		// current year would otherwise draw a flat zero baseline through its empty
		// months then cliff up to its first real value — the "broken spike" look.
		const withZeros: LineChartData = {
			name: 'encounters',
			data: [
				['2023-06-01', 10],
				['2024-06-01', 20],
				// current year 2025: quiet Jan (explicit 0), real data in June
				['2025-01-01', 0],
				['2025-06-01', 30]
			]
		};

		it('renders the current-year line as a gap for a zero-count month', () => {
			const [, , , currentYear] = toThisYearSeries(withZeros, 2025);
			expect(currentYear.data[0]).toEqual(['Jan', null]);
			expect(currentYear.data[5]).toEqual(['Jun', 30]);
		});

		it('excludes zero-count months from the previous-year summary', () => {
			const withPrevZero: LineChartData = {
				name: 'encounters',
				data: [
					['2023-03-01', 0],
					['2024-03-01', 8]
				]
			};
			const [max, min, median] = toThisYearSeries(withPrevZero, 2025);
			// Only 2024's 8 counts as data for March; 2023's 0 is a gap, so it
			// never drags the band's minimum down to zero.
			expect(max.data[2]).toEqual(['Mar', 8]);
			expect(min.data[2]).toEqual(['Mar', 8]);
			expect(median.data[2]).toEqual(['Mar', 8]);
		});
	});
});

describe('yearColors', () => {
	describe('Structure: current year vs previous years', () => {
		it('paints the current year black', () => {
			const colors = yearColors([2023, 2024, 2025], '#3366CC', 2025);
			expect(colors[2]).toBe('#000000');
		});

		it('keeps the most recent previous year at full base strength', () => {
			const colors = yearColors([2023, 2024, 2025], '#3366CC', 2025);
			expect(colors[1]).toBe('#3366cc');
		});

		it('paler for older previous years than for newer ones', () => {
			const colors = yearColors([2023, 2024, 2025], '#3366CC', 2025);
			// 2023 (oldest) is lightened, so its channels sit closer to white (255)
			expect(colors[0]).not.toBe('#3366cc');
			expect(colors[0].toLowerCase()).not.toBe(colors[1].toLowerCase());
		});
	});

	describe('Edge: a single previous year', () => {
		it('uses the full base colour with no lightening', () => {
			const colors = yearColors([2024, 2025], '#3366CC', 2025);
			expect(colors[0]).toBe('#3366cc');
		});
	});
});

describe('thisYearColors', () => {
	it('ends with the full base colour for the current-year line', () => {
		const colors = thisYearColors('#3366CC');
		expect(colors).toHaveLength(4);
		expect(colors[3]).toBe('#3366CC');
	});

	it('shares one pale band colour for the max and min series', () => {
		const colors = thisYearColors('#3366CC');
		expect(colors[0]).toBe(colors[1]);
		expect(colors[0]).not.toBe('#3366cc');
	});
});

describe('normalizeSeriesByEffort', () => {
	const effortHistory: LineChartData = {
		name: 'effort',
		data: [
			['2023-01-01', 4],
			['2024-01-01', 0]
		]
	};

	describe('Usual: dividing metric values by effort hours', () => {
		it("divides each metric's values by the matching date's effort hours", () => {
			const series: LineChartData[] = [
				{ name: 'encounters', data: [['2023-01-01', 8]] }
			];
			const [result] = normalizeSeriesByEffort(series, effortHistory);
			expect(result.data).toEqual([['2023-01-01', 2]]);
		});
	});

	describe('Structure: gaps stay gaps', () => {
		it('leaves null values as null rather than dividing them into 0', () => {
			const series: LineChartData[] = [
				{ name: 'encounters', data: [['2023-01-01', null]] }
			];
			const [result] = normalizeSeriesByEffort(series, effortHistory);
			expect(result.data).toEqual([['2023-01-01', null]]);
		});
	});

	describe('Edge: zero or missing effort hours', () => {
		it('maps a date with 0 effort hours to 0, not NaN/Infinity', () => {
			const series: LineChartData[] = [
				{ name: 'encounters', data: [['2024-01-01', 8]] }
			];
			const [result] = normalizeSeriesByEffort(series, effortHistory);
			expect(result.data).toEqual([['2024-01-01', 0]]);
		});

		it('maps a date absent from effortHistory to 0, not NaN/undefined', () => {
			const series: LineChartData[] = [
				{ name: 'encounters', data: [['2025-06-01', 8]] }
			];
			const [result] = normalizeSeriesByEffort(series, effortHistory);
			expect(result.data).toEqual([['2025-06-01', 0]]);
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

	// A single metric with known effort hours per date, so the divided value
	// is easy to compute by hand: 2023 → 4/2=2, 2024 → 8/4=2.
	const normSeries: LineChartData[] = [
		{
			name: 'encounters',
			data: [
				['2023-01-01', 4],
				['2024-01-01', 8]
			]
		}
	];
	const normEffort: LineChartData = {
		name: 'effort',
		data: [
			['2023-01-01', 2],
			['2024-01-01', 4]
		]
	};

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

		it('hands the all-time chart one base colour per metric', () => {
			render(<YearComparisonTrendChart series={series} />);
			const [chart] = screen.getAllByTestId('line-chart');
			expect(JSON.parse(chart.dataset.colors!)).toHaveLength(series.length);
		});

		it('uses the default palette (chartkick base colours) when no colors prop is passed', () => {
			// Regression guard for the `colors` prop's default fallback: with no
			// override, the all-time chart must still be handed the exact
			// METRIC_BASE_COLORS in series order, unchanged from before the prop.
			render(<YearComparisonTrendChart series={series} />);
			const [chart] = screen.getAllByTestId('line-chart');
			expect(JSON.parse(chart.dataset.colors!)).toEqual(['#3366CC', '#DC3912']);
		});
	});

	describe('Structure: colors override prop', () => {
		const override = ['#111111', '#222222'];

		it('all-time: uses the supplied colours in series order in place of the palette', () => {
			render(<YearComparisonTrendChart series={series} colors={override} />);
			const [chart] = screen.getAllByTestId('line-chart');
			expect(JSON.parse(chart.dataset.colors!)).toEqual(override);
		});

		it('compare-years: each per-metric chart derives its shades from the supplied base colour, not the default palette', () => {
			render(<YearComparisonTrendChart series={series} colors={override} />);
			fireEvent.click(screen.getByRole('radio', { name: 'Compare years' }));
			const charts = screen.getAllByTestId('line-chart');
			// series has only previous years (2023, 2024); the most-recent previous
			// year renders at the metric's full-strength base colour — which must be
			// the override, not METRIC_BASE_COLORS.
			const metric0Colors = JSON.parse(charts[0].dataset.colors!) as string[];
			const metric1Colors = JSON.parse(charts[1].dataset.colors!) as string[];
			expect(metric0Colors).toContain('#111111');
			expect(metric1Colors).toContain('#222222');
			expect(metric0Colors).not.toContain('#3366cc');
		});

		it('this-year: the current-year line uses the supplied base colour, not the default palette', () => {
			render(<YearComparisonTrendChart series={series} colors={override} />);
			fireEvent.click(screen.getByRole('radio', { name: 'This year' }));
			const charts = screen.getAllByTestId('line-chart');
			// thisYearColors puts the full-strength base colour last (current-year line).
			const metric0Colors = JSON.parse(charts[0].dataset.colors!) as string[];
			const metric1Colors = JSON.parse(charts[1].dataset.colors!) as string[];
			expect(metric0Colors[metric0Colors.length - 1]).toBe('#111111');
			expect(metric1Colors[metric1Colors.length - 1]).toBe('#222222');
		});

		it('falls back to the default palette for a metric index the colors array does not cover', () => {
			render(<YearComparisonTrendChart series={series} colors={['#111111']} />);
			const [chart] = screen.getAllByTestId('line-chart');
			// index 0 overridden, index 1 falls back to METRIC_BASE_COLORS[1].
			expect(JSON.parse(chart.dataset.colors!)).toEqual(['#111111', '#DC3912']);
		});
	});

	describe('Structure: compare-years view', () => {
		it('renders one month-axis chart per metric when toggled on', () => {
			render(<YearComparisonTrendChart series={series} />);
			fireEvent.click(screen.getByRole('radio', { name: 'Compare years' }));
			const charts = screen.getAllByTestId('line-chart');
			expect(charts).toHaveLength(2);
			for (const chart of charts) {
				expect(chart.dataset.xtitle).toBe('Month');
			}
		});
	});

	describe('Structure: this-year view', () => {
		it('renders one summary chart per metric when toggled on', () => {
			render(<YearComparisonTrendChart series={series} />);
			fireEvent.click(screen.getByRole('radio', { name: 'This year' }));
			const charts = screen.getAllByTestId('line-chart');
			expect(charts).toHaveLength(2);
			for (const chart of charts) {
				expect(JSON.parse(chart.dataset.series!)).toContain('Previous median');
			}
		});
	});

	describe('Structure: toggling back to all-time', () => {
		it('restores the single all-time chart', () => {
			render(<YearComparisonTrendChart series={series} />);
			fireEvent.click(screen.getByRole('radio', { name: 'Compare years' }));
			fireEvent.click(screen.getByRole('radio', { name: 'All time' }));
			expect(screen.getAllByTestId('line-chart')).toHaveLength(1);
		});
	});

	describe('Usual: normalize toggle visibility', () => {
		it('renders no Normalize toggle when effortHistory is not passed', () => {
			render(<YearComparisonTrendChart series={series} />);
			expect(screen.queryByText('Normalize')).toBeNull();
		});

		it('renders the Normalize toggle, defaulting to No, when effortHistory is passed', () => {
			render(
				<YearComparisonTrendChart series={series} effortHistory={normEffort} />
			);
			expect(screen.getByText('Normalize')).toBeTruthy();
			const no = screen.getByRole('radio', {
				name: 'No'
			}) as HTMLInputElement;
			const yes = screen.getByRole('radio', {
				name: 'Yes'
			}) as HTMLInputElement;
			expect(no.checked).toBe(true);
			expect(yes.checked).toBe(false);
		});
	});

	describe('Usual: compareYearsUrl swaps the switcher', () => {
		it('renders a Compare years link with the correct href and hides the mode radios', () => {
			render(
				<YearComparisonTrendChart
					series={series}
					compareYearsUrl="/group/alpha/species/robin/compare-years"
				/>
			);
			const link = screen.getByRole('link', { name: 'Compare years' });
			expect(link.getAttribute('href')).toBe(
				'/group/alpha/species/robin/compare-years'
			);
			expect(screen.queryByRole('radio', { name: 'All time' })).toBeNull();
			expect(screen.queryByRole('radio', { name: 'Compare years' })).toBeNull();
			expect(screen.queryByRole('radio', { name: 'This year' })).toBeNull();
		});

		it('still renders exactly one all-time chart when compareYearsUrl is passed', () => {
			render(
				<YearComparisonTrendChart series={series} compareYearsUrl="/compare" />
			);
			const charts = screen.getAllByTestId('line-chart');
			expect(charts).toHaveLength(1);
			expect(charts[0].dataset.xtitle).toBe('Year');
		});
	});

	describe('Structure: mode x normalize combinations', () => {
		it('all-time mode, normalize off: chart values match raw series, ytitle unchanged', () => {
			render(
				<YearComparisonTrendChart
					series={normSeries}
					ytitle="Count"
					effortHistory={normEffort}
				/>
			);
			const [chart] = screen.getAllByTestId('line-chart');
			expect(JSON.parse(chart.dataset.values!)).toEqual([normSeries[0].data]);
			expect(chart.dataset.ytitle).toBe('Count');
		});

		it('all-time mode, normalize on: chart values match value/effortHours per date; ytitle updated', () => {
			render(
				<YearComparisonTrendChart
					series={normSeries}
					ytitle="Count"
					effortHistory={normEffort}
				/>
			);
			fireEvent.click(screen.getByRole('radio', { name: 'Yes' }));
			const [chart] = screen.getAllByTestId('line-chart');
			expect(JSON.parse(chart.dataset.values!)).toEqual([
				[
					['2023-01-01', 2],
					['2024-01-01', 2]
				]
			]);
			expect(chart.dataset.ytitle).toBe('Count per hour');
		});

		it('compare-years mode, normalize off: per-year series values match raw series', () => {
			render(
				<YearComparisonTrendChart
					series={normSeries}
					effortHistory={normEffort}
				/>
			);
			fireEvent.click(screen.getByRole('radio', { name: 'Compare years' }));
			const [chart] = screen.getAllByTestId('line-chart');
			const [year2023] = JSON.parse(chart.dataset.values!);
			expect(year2023[0]).toEqual(['Jan', 4]);
		});

		it('compare-years mode, normalize on: per-year series values reflect normalized series; ytitle updated on each per-metric chart', () => {
			render(
				<YearComparisonTrendChart
					series={normSeries}
					ytitle="Count"
					effortHistory={normEffort}
				/>
			);
			fireEvent.click(screen.getByRole('radio', { name: 'Compare years' }));
			fireEvent.click(screen.getByRole('radio', { name: 'Yes' }));
			const [chart] = screen.getAllByTestId('line-chart');
			const [year2023] = JSON.parse(chart.dataset.values!);
			expect(year2023[0]).toEqual(['Jan', 2]);
			expect(chart.dataset.ytitle).toBe('Count per hour');
		});

		it('this-year mode, normalize off: current-year/median/band values match raw series', () => {
			render(
				<YearComparisonTrendChart
					series={normSeries}
					effortHistory={normEffort}
				/>
			);
			fireEvent.click(screen.getByRole('radio', { name: 'This year' }));
			const [chart] = screen.getAllByTestId('line-chart');
			const [max, min, median] = JSON.parse(chart.dataset.values!);
			expect(max[0]).toEqual(['Jan', 8]);
			expect(min[0]).toEqual(['Jan', 4]);
			expect(median[0]).toEqual(['Jan', 6]);
		});

		it('this-year mode, normalize on: current-year/median/band values reflect normalized series; ytitle updated', () => {
			render(
				<YearComparisonTrendChart
					series={normSeries}
					ytitle="Count"
					effortHistory={normEffort}
				/>
			);
			fireEvent.click(screen.getByRole('radio', { name: 'This year' }));
			fireEvent.click(screen.getByRole('radio', { name: 'Yes' }));
			const [chart] = screen.getAllByTestId('line-chart');
			const [max, min, median] = JSON.parse(chart.dataset.values!);
			expect(max[0]).toEqual(['Jan', 2]);
			expect(min[0]).toEqual(['Jan', 2]);
			expect(median[0]).toEqual(['Jan', 2]);
			expect(chart.dataset.ytitle).toBe('Count per hour');
		});
	});

	describe('Edge: division correctness across periods', () => {
		it('renders 0 (not NaN/blank) for a period with 0 effort hours', () => {
			const zeroEffortSeries: LineChartData[] = [
				{ name: 'encounters', data: [['2024-01-01', 8]] }
			];
			const zeroEffortHistory: LineChartData = {
				name: 'effort',
				data: [['2024-01-01', 0]]
			};
			render(
				<YearComparisonTrendChart
					series={zeroEffortSeries}
					effortHistory={zeroEffortHistory}
				/>
			);
			fireEvent.click(screen.getByRole('radio', { name: 'Yes' }));
			const [chart] = screen.getAllByTestId('line-chart');
			expect(JSON.parse(chart.dataset.values!)).toEqual([[['2024-01-01', 0]]]);
		});

		it('renders 0 for a date in series missing from effortHistory, without throwing/NaN elsewhere', () => {
			const partialSeries: LineChartData[] = [
				{
					name: 'encounters',
					data: [
						['2023-01-01', 4],
						['2025-01-01', 8]
					]
				}
			];
			const partialEffort: LineChartData = {
				name: 'effort',
				data: [['2023-01-01', 2]]
			};
			render(
				<YearComparisonTrendChart
					series={partialSeries}
					effortHistory={partialEffort}
				/>
			);
			fireEvent.click(screen.getByRole('radio', { name: 'Yes' }));
			const [chart] = screen.getAllByTestId('line-chart');
			expect(JSON.parse(chart.dataset.values!)).toEqual([
				[
					['2023-01-01', 2],
					['2025-01-01', 0]
				]
			]);
		});
	});

	describe('Edge: both/neither props present', () => {
		it('neither effortHistory nor compareYearsUrl passed: existing three-way toggle renders, no Normalize toggle, no Compare years link', () => {
			render(<YearComparisonTrendChart series={series} />);
			expect(screen.getByRole('radio', { name: 'All time' })).toBeTruthy();
			expect(screen.getByRole('radio', { name: 'Compare years' })).toBeTruthy();
			expect(screen.getByRole('radio', { name: 'This year' })).toBeTruthy();
			expect(screen.queryByText('Normalize')).toBeNull();
			expect(screen.queryByRole('link', { name: 'Compare years' })).toBeNull();
		});

		it('both effortHistory and compareYearsUrl passed: the Compare years link and Normalize toggle both render; toggling Normalize divides the single all-time chart, ytitle updates, and mode stays fixed at all-time', () => {
			render(
				<YearComparisonTrendChart
					series={normSeries}
					ytitle="Count"
					effortHistory={normEffort}
					compareYearsUrl="/compare"
				/>
			);
			expect(screen.getByRole('link', { name: 'Compare years' })).toBeTruthy();
			expect(screen.getByText('Normalize')).toBeTruthy();
			fireEvent.click(screen.getByRole('radio', { name: 'Yes' }));
			const charts = screen.getAllByTestId('line-chart');
			expect(charts).toHaveLength(1);
			expect(charts[0].dataset.xtitle).toBe('Year');
			expect(JSON.parse(charts[0].dataset.values!)).toEqual([
				[
					['2023-01-01', 2],
					['2024-01-01', 2]
				]
			]);
			expect(charts[0].dataset.ytitle).toBe('Count per hour');
		});
	});
});
