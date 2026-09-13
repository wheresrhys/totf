import { describe, it, expect, afterEach, vi } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	waitFor,
	act
} from '@testing-library/react';
import type { LineChartData } from 'react-chartkick';
import {
	toYearOnYearSeries,
	toThisYearSeries,
	yearColors,
	thisYearColors,
	normalizeSeriesByEffort,
	aggregateSeriesByYear,
	buildTotalSeries,
	spansMultipleYears,
	isHiddenFromLegend,
	YearComparisonTrendChart
} from '../YearComparisonTrendChart';

// chartkick registers Chart.js as a side effect; the chart itself is mocked so
// no real canvas renders. The mock surfaces its `data`/`xtitle`/`ytitle`/`colors`
// props so tests can assert what each chart was handed.
vi.mock('chartkick/chart.js', () => ({}));
type LegendLabelsFilter = (legendItem: { text: string }) => boolean;

vi.mock('react-chartkick', () => ({
	LineChart: ({
		data,
		xtitle,
		ytitle,
		colors,
		library
	}: {
		data: LineChartData[];
		xtitle: string;
		ytitle: string;
		colors?: string[];
		library?: {
			plugins?: { legend?: { labels?: { filter?: LegendLabelsFilter } } };
		};
	}) => {
		// The legend filter function isn't JSON-serializable, so surface its
		// verdict on each series' own name instead — lets a test assert the
		// wiring end-to-end (component -> library option -> filter result)
		// without reaching into react-chartkick/Chart.js internals.
		const legendFilter = library?.plugins?.legend?.labels?.filter;
		const visibleInLegend = legendFilter
			? data
					.map((series) => series.name)
					.filter((name) => legendFilter({ text: name }))
			: null;
		return (
			<div
				data-testid="line-chart"
				data-xtitle={xtitle}
				data-ytitle={ytitle}
				data-colors={JSON.stringify(colors)}
				data-series={JSON.stringify(data.map((series) => series.name))}
				data-values={JSON.stringify(data.map((series) => series.data))}
				data-visible-in-legend={JSON.stringify(visibleInLegend)}
			/>
		);
	}
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

describe('aggregateSeriesByYear', () => {
	describe('Usual: summing a metric into one point per year', () => {
		it('sums each year’s monthly values into a single yearly point', () => {
			const metric: LineChartData = {
				name: 'encounters',
				data: [
					['2023-03-01', 5],
					['2023-06-01', 9],
					['2024-03-01', 7]
				]
			};
			expect(aggregateSeriesByYear(metric, 'sum').data).toEqual([
				['2023', 14],
				['2024', 7]
			]);
		});

		it('preserves the metric name', () => {
			const metric: LineChartData = {
				name: 'encounters',
				data: [['2023-03-01', 5]]
			};
			expect(aggregateSeriesByYear(metric, 'sum').name).toBe('encounters');
		});
	});

	describe('Structure: one test per aggregator', () => {
		const metric: LineChartData = {
			name: 'weight',
			data: [
				['2024-03-01', 10],
				['2024-06-01', 20],
				['2024-09-01', 30]
			]
		};

		it('sums with the sum aggregator', () => {
			expect(aggregateSeriesByYear(metric, 'sum').data).toEqual([['2024', 60]]);
		});

		it('averages with the mean aggregator', () => {
			expect(aggregateSeriesByYear(metric, 'mean').data).toEqual([
				['2024', 20]
			]);
		});

		it('takes the maximum with the max aggregator', () => {
			expect(aggregateSeriesByYear(metric, 'max').data).toEqual([['2024', 30]]);
		});

		it('takes the minimum with the min aggregator', () => {
			expect(aggregateSeriesByYear(metric, 'min').data).toEqual([['2024', 10]]);
		});
	});

	describe('Structure: ordering and labelling', () => {
		it('returns points oldest-first, labelled by year', () => {
			const metric: LineChartData = {
				name: 'encounters',
				data: [
					['2024-01-01', 1],
					['2022-01-01', 1],
					['2023-01-01', 1]
				]
			};
			expect(
				aggregateSeriesByYear(metric, 'sum').data.map(([year]) => year)
			).toEqual(['2022', '2023', '2024']);
		});
	});

	describe('Edge: gaps, empty years and empty input', () => {
		it('excludes a zero-count month from its year’s aggregate', () => {
			const metric: LineChartData = {
				name: 'encounters',
				data: [
					['2024-01-01', 0],
					['2024-03-01', 30],
					['2024-06-01', 10]
				]
			};
			// The 0 is a dense-spine gap, so the sum is 30 + 10, not 40 with a real 0.
			expect(aggregateSeriesByYear(metric, 'sum').data).toEqual([['2024', 40]]);
		});

		it('aggregates a year with no reportable months to null (a gap)', () => {
			const metric: LineChartData = {
				name: 'encounters',
				data: [
					['2022-05-01', 0],
					['2022-06-01', 0],
					['2023-05-01', 4]
				]
			};
			expect(aggregateSeriesByYear(metric, 'sum').data).toEqual([
				['2022', null],
				['2023', 4]
			]);
		});

		it('returns an empty array for a metric with no points', () => {
			expect(
				aggregateSeriesByYear({ name: 'encounters', data: [] }, 'sum').data
			).toEqual([]);
		});
	});
});

describe('buildTotalSeries', () => {
	describe('Usual: summing multiple series per period', () => {
		it('sums the values of every input series at each matching period', () => {
			const series: LineChartData[] = [
				{
					name: 'Juv',
					data: [
						['2024-01-01', 5],
						['2024-02-01', 3]
					]
				},
				{
					name: 'Postjuv',
					data: [
						['2024-01-01', 2],
						['2024-02-01', 4]
					]
				}
			];
			expect(buildTotalSeries(series).data).toEqual([
				['2024-01-01', 7],
				['2024-02-01', 7]
			]);
		});

		it("names the result 'Total'", () => {
			const series: LineChartData[] = [
				{ name: 'Juv', data: [['2024-01-01', 5]] }
			];
			expect(buildTotalSeries(series).name).toBe('Total');
		});
	});

	describe('Structure: per-period, not cumulative', () => {
		it("does not accumulate across periods — each period's total only reflects that period's values", () => {
			const series: LineChartData[] = [
				{
					name: 'Juv',
					data: [
						['2024-01-01', 5],
						['2024-02-01', 3]
					]
				},
				{
					name: 'Postjuv',
					data: [
						['2024-01-01', 2],
						['2024-02-01', 1]
					]
				}
			];
			expect(buildTotalSeries(series).data).toEqual([
				['2024-01-01', 7],
				['2024-02-01', 4]
			]);
		});
	});

	describe('Edge: gaps and single-series input', () => {
		it('produces a null (gap) total for a period where every input series is null', () => {
			const series: LineChartData[] = [
				{ name: 'Juv', data: [['2024-01-01', null]] },
				{ name: 'Postjuv', data: [['2024-01-01', null]] }
			];
			expect(buildTotalSeries(series).data).toEqual([['2024-01-01', null]]);
		});

		it('returns the single series unchanged (as the total) when only one series is supplied', () => {
			const series: LineChartData[] = [
				{
					name: 'Juv',
					data: [
						['2024-01-01', 5],
						['2024-02-01', null]
					]
				}
			];
			expect(buildTotalSeries(series).data).toEqual(series[0].data);
		});

		it('returns an empty series when given no input series', () => {
			expect(buildTotalSeries([]).data).toEqual([]);
		});
	});
});

describe('spansMultipleYears', () => {
	describe('Usual: dates crossing a calendar-year boundary', () => {
		it('returns true when one metric has dates in two different years', () => {
			const series: LineChartData[] = [
				{
					name: 'encounters',
					data: [
						['2023-03-01', 5],
						['2024-03-01', 7]
					]
				}
			];
			expect(spansMultipleYears(series)).toBe(true);
		});
	});

	describe('Structure: single-year data', () => {
		it('returns false when every metric only has dates in one calendar year', () => {
			const series: LineChartData[] = [
				{
					name: 'encounters',
					data: [
						['2024-01-01', 5],
						['2024-06-01', 7]
					]
				},
				{
					name: 'birds',
					data: [['2024-03-01', 2]]
				}
			];
			expect(spansMultipleYears(series)).toBe(false);
		});

		it('returns true when the year boundary only shows up across different metrics', () => {
			const series: LineChartData[] = [
				{ name: 'encounters', data: [['2023-06-01', 5]] },
				{ name: 'birds', data: [['2024-06-01', 2]] }
			];
			expect(spansMultipleYears(series)).toBe(true);
		});
	});

	describe('Edge: empty input', () => {
		it('returns false for no metrics', () => {
			expect(spansMultipleYears([])).toBe(false);
		});

		it('returns false for a metric with no data points', () => {
			expect(spansMultipleYears([{ name: 'encounters', data: [] }])).toBe(
				false
			);
		});

		it('returns false for a single date, regardless of its value', () => {
			const series: LineChartData[] = [
				{ name: 'encounters', data: [['2024-06-01', 0]] }
			];
			expect(spansMultipleYears(series)).toBe(false);
		});
	});
});

describe('isHiddenFromLegend', () => {
	describe('Structure: one check per hidden series name', () => {
		it('hides "Previous max"', () => {
			expect(isHiddenFromLegend('Previous max')).toBe(true);
		});

		it('hides "Previous min"', () => {
			expect(isHiddenFromLegend('Previous min')).toBe(true);
		});
	});

	describe('Usual: every other series name stays visible', () => {
		it('keeps "Previous median" visible', () => {
			expect(isHiddenFromLegend('Previous median')).toBe(false);
		});

		it('keeps a current-year series (named by year) visible', () => {
			expect(isHiddenFromLegend('2025')).toBe(false);
		});

		it('keeps an all-time metric name visible', () => {
			expect(isHiddenFromLegend('encounters')).toBe(false);
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

	describe('Structure: includeTotalSeries prop', () => {
		it('adds no extra series when includeTotalSeries is omitted', () => {
			render(<YearComparisonTrendChart series={series} />);
			const [chart] = screen.getAllByTestId('line-chart');
			expect(JSON.parse(chart.dataset.series!)).toEqual([
				'encounters',
				'birds'
			]);
		});

		it('adds no extra series when includeTotalSeries is false', () => {
			render(
				<YearComparisonTrendChart series={series} includeTotalSeries={false} />
			);
			const [chart] = screen.getAllByTestId('line-chart');
			expect(JSON.parse(chart.dataset.series!)).toEqual([
				'encounters',
				'birds'
			]);
		});

		it('adds one Total series summing all plotted series when includeTotalSeries is true', () => {
			render(
				<YearComparisonTrendChart series={series} includeTotalSeries={true} />
			);
			const [chart] = screen.getAllByTestId('line-chart');
			expect(JSON.parse(chart.dataset.series!)).toEqual([
				'encounters',
				'birds',
				'Total'
			]);
			const [, , total] = JSON.parse(chart.dataset.values!);
			expect(total).toEqual([
				['2023-01-01', 8],
				['2024-01-01', 14]
			]);
		});

		it('computes the total from effort-normalized values when Normalize is toggled on', () => {
			render(
				<YearComparisonTrendChart
					series={series}
					effortHistory={normEffort}
					includeTotalSeries={true}
				/>
			);
			fireEvent.click(screen.getByRole('radio', { name: 'Yes' }));
			const [chart] = screen.getAllByTestId('line-chart');
			const [, , total] = JSON.parse(chart.dataset.values!);
			// encounters/effort: 5/2=2.5, 8/4=2; birds/effort: 3/2=1.5, 6/4=1.5;
			// total: 2.5+1.5=4, 2+1.5=3.5 — reflects the normalized values, not
			// the raw 5+3=8/8+6=14 the unnormalized test above asserts.
			expect(total).toEqual([
				['2023-01-01', 4],
				['2024-01-01', 3.5]
			]);
		});

		it('aggregates the total series with sum when the Interval is switched to Year', () => {
			const multiMonthSeries: LineChartData[] = [
				{
					name: 'encounters',
					data: [
						['2023-04-01', 2],
						['2024-03-01', 4],
						['2024-06-01', 6]
					]
				},
				{
					name: 'birds',
					data: [
						['2023-04-01', 1],
						['2024-03-01', 2],
						['2024-06-01', 3]
					]
				}
			];
			render(
				<YearComparisonTrendChart
					series={multiMonthSeries}
					includeTotalSeries={true}
				/>
			);
			fireEvent.click(screen.getByRole('radio', { name: 'Year' }));
			const [chart] = screen.getAllByTestId('line-chart');
			const [, , total] = JSON.parse(chart.dataset.values!);
			// Per-month totals: 2023-04 → 3, 2024-03 → 6, 2024-06 → 9; Total is
			// absent from yearlyAggregators, so it defaults to 'sum': 2023 → 3,
			// 2024 → 6 + 9 = 15.
			expect(total).toEqual([
				['2023', 3],
				['2024', 15]
			]);
		});

		it('includes the Total series as its own per-metric sub-chart in Compare-years mode', () => {
			render(
				<YearComparisonTrendChart series={series} includeTotalSeries={true} />
			);
			fireEvent.click(screen.getByRole('radio', { name: 'Compare years' }));
			const charts = screen.getAllByTestId('line-chart');
			expect(charts).toHaveLength(3);
			expect(screen.getByText('Total')).toBeTruthy();
		});

		it('includes the Total series as its own per-metric sub-chart in This-year mode', () => {
			render(
				<YearComparisonTrendChart series={series} includeTotalSeries={true} />
			);
			fireEvent.click(screen.getByRole('radio', { name: 'This year' }));
			const charts = screen.getAllByTestId('line-chart');
			expect(charts).toHaveLength(3);
			expect(screen.getByText('Total')).toBeTruthy();
		});

		it('colours the Total series via the default metricBaseColor fallback when the supplied colors array does not cover its index', () => {
			render(
				<YearComparisonTrendChart
					series={series}
					colors={['#111111', '#222222']}
					includeTotalSeries={true}
				/>
			);
			const [chart] = screen.getAllByTestId('line-chart');
			// index 0 and 1 overridden; index 2 (Total) falls back to
			// METRIC_BASE_COLORS[2].
			expect(JSON.parse(chart.dataset.colors!)).toEqual([
				'#111111',
				'#222222',
				'#FF9900'
			]);
		});
	});

	describe('Structure: all-time Interval toggle', () => {
		// Two calendar years (so the Interval toggle is actually shown — see the
		// "single calendar year" edge case below), with one metric spanning two
		// months in the later year, so a year-aggregate differs from either
		// monthly value and the aggregator is observable.
		const multiMonth: LineChartData[] = [
			{
				name: 'max weight',
				data: [
					['2023-04-01', 5],
					['2024-03-01', 10],
					['2024-06-01', 30]
				]
			},
			{
				name: 'encounters',
				data: [
					['2023-04-01', 2],
					['2024-03-01', 4],
					['2024-06-01', 6]
				]
			}
		];

		it('defaults to Month — shows the per-month series, Month selected', () => {
			render(<YearComparisonTrendChart series={series} />);
			const month = screen.getByRole('radio', {
				name: 'Month'
			}) as HTMLInputElement;
			const year = screen.getByRole('radio', {
				name: 'Year'
			}) as HTMLInputElement;
			expect(month.checked).toBe(true);
			expect(year.checked).toBe(false);
			const [chart] = screen.getAllByTestId('line-chart');
			expect(JSON.parse(chart.dataset.values!)).toEqual([
				series[0].data,
				series[1].data
			]);
		});

		it('switching to Year re-renders one point per year, per-metric aggregator from yearlyAggregators', () => {
			render(
				<YearComparisonTrendChart
					series={multiMonth}
					yearlyAggregators={{ 'max weight': 'max' }}
				/>
			);
			fireEvent.click(screen.getByRole('radio', { name: 'Year' }));
			const [chart] = screen.getAllByTestId('line-chart');
			const [maxWeight, encounters] = JSON.parse(chart.dataset.values!);
			// 'max weight' aggregates via max → 5 for 2023, 30 for 2024;
			// 'encounters' has no mapping so defaults to sum → 2 for 2023, 4 + 6 =
			// 10 for 2024.
			expect(maxWeight).toEqual([
				['2023', 5],
				['2024', 30]
			]);
			expect(encounters).toEqual([
				['2023', 2],
				['2024', 10]
			]);
		});

		it('defaults a metric absent from yearlyAggregators to sum', () => {
			render(
				<YearComparisonTrendChart series={multiMonth} yearlyAggregators={{}} />
			);
			fireEvent.click(screen.getByRole('radio', { name: 'Year' }));
			const [chart] = screen.getAllByTestId('line-chart');
			const [maxWeight] = JSON.parse(chart.dataset.values!);
			expect(maxWeight).toEqual([
				['2023', 5],
				['2024', 40]
			]);
		});

		it('restores the exact per-month series when toggled Year → Month', () => {
			render(<YearComparisonTrendChart series={multiMonth} />);
			fireEvent.click(screen.getByRole('radio', { name: 'Year' }));
			fireEvent.click(screen.getByRole('radio', { name: 'Month' }));
			const [chart] = screen.getAllByTestId('line-chart');
			expect(JSON.parse(chart.dataset.values!)).toEqual([
				multiMonth[0].data,
				multiMonth[1].data
			]);
		});

		it('is not shown in Compare years or This year modes', () => {
			render(<YearComparisonTrendChart series={series} />);
			fireEvent.click(screen.getByRole('radio', { name: 'Compare years' }));
			expect(screen.queryByRole('radio', { name: 'Year' })).toBeNull();
			expect(screen.queryByRole('radio', { name: 'Month' })).toBeNull();
			fireEvent.click(screen.getByRole('radio', { name: 'This year' }));
			expect(screen.queryByRole('radio', { name: 'Year' })).toBeNull();
			expect(screen.queryByRole('radio', { name: 'Month' })).toBeNull();
		});

		it('toggles independently across multiple chart instances on one page', () => {
			render(
				<>
					<YearComparisonTrendChart
						series={multiMonth}
						yearlyAggregators={{ 'max weight': 'max' }}
					/>
					<YearComparisonTrendChart series={multiMonth} />
				</>
			);
			// Switch only the first instance to Year.
			fireEvent.click(screen.getAllByRole('radio', { name: 'Year' })[0]);
			const [first, second] = screen.getAllByTestId('line-chart');
			// First is now yearly (one point per year), second stays per-month.
			expect(JSON.parse(first.dataset.values!)[0]).toEqual([
				['2023', 5],
				['2024', 30]
			]);
			expect(JSON.parse(second.dataset.values!)[0]).toEqual(multiMonth[0].data);
		});

		describe('Edge: data confined to a single calendar year', () => {
			const singleYear: LineChartData[] = [
				{
					name: 'encounters',
					data: [
						['2024-03-01', 4],
						['2024-06-01', 6]
					]
				}
			];

			it('never renders the Interval toggle in all-time mode', () => {
				render(<YearComparisonTrendChart series={singleYear} />);
				expect(screen.queryByText('Interval')).toBeNull();
				expect(screen.queryByRole('radio', { name: 'Year' })).toBeNull();
				expect(screen.queryByRole('radio', { name: 'Month' })).toBeNull();
			});

			it('still renders the mode switcher and the all-time chart as usual', () => {
				render(<YearComparisonTrendChart series={singleYear} />);
				expect(screen.getByRole('radio', { name: 'All time' })).toBeTruthy();
				const [chart] = screen.getAllByTestId('line-chart');
				expect(chart.dataset.xtitle).toBe('Year');
			});
		});
	});

	describe('Structure: fetchYearSeries (year-grouped fetch for the Year interval)', () => {
		// Two months in each of two years, so a client-side yearly sum (11 / 19)
		// is plainly distinguishable from what a year-grouped fetch returns
		// (7 / 12 — fewer, because the RPC counts each bird once per year rather
		// than once per month; see #852).
		const monthly: LineChartData[] = [
			{
				name: 'birds',
				data: [
					['2023-03-01', 5],
					['2023-09-01', 6],
					['2024-03-01', 9],
					['2024-09-01', 10]
				]
			}
		];
		const fetchedYearly: LineChartData[] = [
			{
				name: 'birds',
				data: [
					['2023', 7],
					['2024', 12]
				]
			}
		];

		function chartValues() {
			const [chart] = screen.getAllByTestId('line-chart');
			return JSON.parse(chart.dataset.values!);
		}

		it('fetches once when the Interval is switched to Year and plots the resolved series, not the client-side sum', async () => {
			const fetchYearSeries = vi.fn().mockResolvedValue(fetchedYearly);
			render(
				<YearComparisonTrendChart
					series={monthly}
					fetchYearSeries={fetchYearSeries}
				/>
			);
			expect(fetchYearSeries).not.toHaveBeenCalled();

			fireEvent.click(screen.getByRole('radio', { name: 'Year' }));
			await waitFor(() =>
				expect(screen.queryByTestId('line-chart')).toBeTruthy()
			);

			expect(fetchYearSeries).toHaveBeenCalledTimes(1);
			expect(chartValues()).toEqual([fetchedYearly[0].data]);
		});

		it('does not refetch when toggled Year → Month → Year, and re-plots the cached series', async () => {
			const fetchYearSeries = vi.fn().mockResolvedValue(fetchedYearly);
			render(
				<YearComparisonTrendChart
					series={monthly}
					fetchYearSeries={fetchYearSeries}
				/>
			);
			fireEvent.click(screen.getByRole('radio', { name: 'Year' }));
			await waitFor(() =>
				expect(chartValues()).toEqual([fetchedYearly[0].data])
			);

			fireEvent.click(screen.getByRole('radio', { name: 'Month' }));
			expect(chartValues()).toEqual([monthly[0].data]);

			fireEvent.click(screen.getByRole('radio', { name: 'Year' }));
			expect(chartValues()).toEqual([fetchedYearly[0].data]);
			expect(fetchYearSeries).toHaveBeenCalledTimes(1);
		});

		it('shows a loading spinner instead of the stale month-summed data while the fetch is pending', async () => {
			let resolveFetch: (value: LineChartData[]) => void = () => {};
			const fetchYearSeries = vi.fn(
				() =>
					new Promise<LineChartData[]>((resolve) => {
						resolveFetch = resolve;
					})
			);
			render(
				<YearComparisonTrendChart
					series={monthly}
					fetchYearSeries={fetchYearSeries}
				/>
			);
			fireEvent.click(screen.getByRole('radio', { name: 'Year' }));

			expect(screen.queryByTestId('line-chart')).toBeNull();
			expect(document.querySelector('.loading-spinner')).toBeTruthy();

			await act(async () => {
				resolveFetch(fetchedYearly);
			});

			expect(document.querySelector('.loading-spinner')).toBeNull();
			expect(chartValues()).toEqual([fetchedYearly[0].data]);
		});

		it('normalizes a fetched year series against yearly-summed effort hours, not the raw monthly effort', async () => {
			// 2023 effort: 2 + 3 = 5 hours; 2024: 4 hours. So the fetched yearly
			// counts normalize to 7/5 = 1.4 and 12/4 = 3.
			const monthlyEffort: LineChartData = {
				name: 'effort',
				data: [
					['2023-03-01', 2],
					['2023-09-01', 3],
					['2024-03-01', 4],
					['2024-09-01', 0]
				]
			};
			const fetchYearSeries = vi.fn().mockResolvedValue(fetchedYearly);
			render(
				<YearComparisonTrendChart
					series={monthly}
					ytitle="Count"
					effortHistory={monthlyEffort}
					fetchYearSeries={fetchYearSeries}
				/>
			);
			fireEvent.click(screen.getByRole('radio', { name: 'Year' }));
			await waitFor(() =>
				expect(chartValues()).toEqual([fetchedYearly[0].data])
			);

			fireEvent.click(screen.getByRole('radio', { name: 'Yes' }));
			expect(chartValues()).toEqual([
				[
					['2023', 1.4],
					['2024', 3]
				]
			]);
			const [chart] = screen.getAllByTestId('line-chart');
			expect(chart.dataset.ytitle).toBe('Count per hour');
		});

		it('appends the Total series to a fetched year series when includeTotalSeries is set', async () => {
			const twoMetrics: LineChartData[] = [
				{ name: 'juv', data: [['2023', 4]] },
				{ name: 'postjuv', data: [['2023', 6]] }
			];
			const fetchYearSeries = vi.fn().mockResolvedValue(twoMetrics);
			render(
				<YearComparisonTrendChart
					series={monthly}
					includeTotalSeries
					fetchYearSeries={fetchYearSeries}
				/>
			);
			fireEvent.click(screen.getByRole('radio', { name: 'Year' }));
			await waitFor(() =>
				expect(screen.getAllByTestId('line-chart')[0].dataset.series).toBe(
					JSON.stringify(['juv', 'postjuv', 'Total'])
				)
			);
			expect(chartValues()[2]).toEqual([['2023', 10]]);
		});

		it('keeps the client-side aggregateSeriesByYear behaviour when no fetchYearSeries is supplied', () => {
			// Regression guard for the Biometrics path, which passes no fetcher.
			render(<YearComparisonTrendChart series={monthly} />);
			fireEvent.click(screen.getByRole('radio', { name: 'Year' }));
			expect(chartValues()).toEqual([
				[
					['2023', 11],
					['2024', 19]
				]
			]);
		});

		describe('Edge: the fetch rejects', () => {
			it('falls back to the client-side yearly aggregation rather than spinning or crashing', async () => {
				const fetchYearSeries = vi
					.fn()
					.mockRejectedValue(new Error('network down'));
				render(
					<YearComparisonTrendChart
						series={monthly}
						fetchYearSeries={fetchYearSeries}
					/>
				);
				fireEvent.click(screen.getByRole('radio', { name: 'Year' }));

				await waitFor(() =>
					expect(document.querySelector('.loading-spinner')).toBeNull()
				);
				expect(chartValues()).toEqual([
					[
						['2023', 11],
						['2024', 19]
					]
				]);
			});
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

		it('keeps the Previous max/min band series in the data but hides them from the legend', () => {
			render(<YearComparisonTrendChart series={series} />);
			fireEvent.click(screen.getByRole('radio', { name: 'This year' }));
			const [chart] = screen.getAllByTestId('line-chart');
			const currentYearLabel = String(new Date().getFullYear());
			// The band data itself is still drawn (Previous max/min are present in
			// `series`)...
			expect(JSON.parse(chart.dataset.series!)).toEqual([
				'Previous max',
				'Previous min',
				'Previous median',
				currentYearLabel
			]);
			// ...but the chart's legend filter drops them, leaving only the median
			// and current-year lines as legend entries.
			expect(JSON.parse(chart.dataset.visibleInLegend!)).toEqual([
				'Previous median',
				currentYearLabel
			]);
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

		it('styles the Compare years link as a small text link, not a button', () => {
			render(
				<YearComparisonTrendChart series={series} compareYearsUrl="/compare" />
			);
			const link = screen.getByRole('link', { name: 'Compare years' });
			expect(link.className).toContain('link');
			expect(link.className).not.toContain('btn');
		});
	});

	describe('Structure: toggle row responsive layout', () => {
		it('wraps every toggle in one flexbox row that can wrap and vertically centers its items', () => {
			render(
				<YearComparisonTrendChart series={series} effortHistory={normEffort} />
			);
			const toggleRow = screen.getByText('Normalize').closest('.flex-wrap');
			expect(toggleRow).not.toBeNull();
			expect(toggleRow!.className).toContain('items-center');
			// The mode switcher and the Interval toggle both live in the same
			// wrapping row as Normalize, so all three toggle groups wrap together
			// rather than one overflowing past the others on a narrow screen.
			const allTimeRadio = screen.getByRole('radio', { name: 'All time' });
			const yearRadio = screen.getByRole('radio', { name: 'Year' });
			expect(toggleRow!.contains(allTimeRadio)).toBe(true);
			expect(toggleRow!.contains(yearRadio)).toBe(true);
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
