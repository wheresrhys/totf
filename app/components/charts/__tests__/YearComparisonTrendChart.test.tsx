import { describe, it, expect, afterEach, vi } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	waitFor,
	act,
	within
} from '@testing-library/react';
import type { LineChartData } from 'react-chartkick';
import {
	toYearOnYearSeries,
	toThisYearSeries,
	yearColors,
	thisYearColors,
	normalizeSeriesByEffort,
	aggregateSeriesByYear,
	accumulateSeriesByYear,
	buildTotalSeries,
	toPercentStackedSeries,
	spansMultipleYears,
	isHiddenFromLegend,
	YearComparisonTrendChart
} from '../YearComparisonTrendChart';

// chartkick registers Chart.js as a side effect; the chart itself is mocked so
// no real canvas renders. The mock surfaces its `data`/`xtitle`/`ytitle`/`colors`
// props so tests can assert what each chart was handed.
vi.mock('chartkick/chart.js', () => ({}));
type LegendLabelsFilter = (legendItem: { text: string }) => boolean;

// LineChart and AreaChart are mocked with the same renderer (parametrized only
// by testid): the accumulate view tells them apart by rendering via AreaChart
// instead of LineChart (see YearComparisonTrendChart.tsx's `AllTimeChart`) —
// there's no `library` fill flag to surface any more (chartkick always
// derives a dataset's own `fill` from which component built it, not from a
// `library.elements.line.fill` default), so which testid a test finds *is*
// the fill signal.
function makeChartMock(testId: string) {
	function ChartMock({
		data,
		xtitle,
		ytitle,
		colors,
		min,
		max,
		suffix,
		library
	}: {
		data: LineChartData[];
		xtitle: string;
		ytitle: string;
		colors?: string[];
		min?: number | null;
		max?: number;
		suffix?: string;
		library?: {
			plugins?: { legend?: { labels?: { filter?: LegendLabelsFilter } } };
			scales?: { y?: { stacked?: boolean } };
		};
	}) {
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
				data-testid={testId}
				data-xtitle={xtitle}
				data-ytitle={ytitle}
				data-colors={JSON.stringify(colors)}
				// The y-axis bounds/suffix, so a test can assert the percent view's
				// fixed 0–100% scale (and that the default view leaves them alone).
				data-min={JSON.stringify(min)}
				data-max={JSON.stringify(max)}
				data-suffix={JSON.stringify(suffix)}
				data-series={JSON.stringify(data.map((series) => series.name))}
				data-values={JSON.stringify(data.map((series) => series.data))}
				data-visible-in-legend={JSON.stringify(visibleInLegend)}
				// Surfaces the stacked-area config so a test can tell the accumulate
				// view's chart apart from the plain trend one.
				data-stacked={JSON.stringify(library?.scales?.y?.stacked)}
			/>
		);
	}
	ChartMock.displayName = testId;
	return ChartMock;
}

vi.mock('react-chartkick', () => ({
	LineChart: makeChartMock('line-chart'),
	AreaChart: makeChartMock('area-chart')
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

describe('accumulateSeriesByYear', () => {
	describe('Usual: a within-year running sum', () => {
		it('accumulates Jan..Dec as a running sum within a year, e.g. feb = feb + jan', () => {
			const metric: LineChartData = {
				name: 'arrivals',
				data: [
					['2024-01-01', 5],
					['2024-02-01', 3],
					['2024-03-01', 2]
				]
			};
			expect(accumulateSeriesByYear(metric).data).toEqual([
				['2024-01-01', 5],
				['2024-02-01', 8],
				['2024-03-01', 10]
			]);
		});

		it('preserves the metric name', () => {
			expect(
				accumulateSeriesByYear({
					name: 'arrivals',
					data: [['2024-01-01', 1]]
				}).name
			).toBe('arrivals');
		});
	});

	describe('Structure: year boundaries and the normalize composition', () => {
		it('resets the running sum at the start of each new calendar year', () => {
			const metric: LineChartData = {
				name: 'arrivals',
				data: [
					['2023-11-01', 5],
					['2023-12-01', 3],
					['2024-01-01', 7],
					['2024-02-01', 1]
				]
			};
			expect(accumulateSeriesByYear(metric).data).toEqual([
				['2023-11-01', 5],
				['2023-12-01', 8],
				['2024-01-01', 7],
				['2024-02-01', 8]
			]);
		});

		it('accumulates numerator and denominator separately then divides once, when combined with normalize', () => {
			const metric: LineChartData = {
				name: 'arrivals',
				data: [
					['2024-01-01', 2],
					['2024-02-01', 4]
				]
			};
			const effortHistory: LineChartData = {
				name: 'effort',
				data: [
					['2024-01-01', 4],
					['2024-02-01', 4]
				]
			};
			// Cumulative counts 2 then 6, over cumulative effort 4 then 8 → 0.5,
			// 0.75. Summing the per-month rates instead would give 0.5 then 1.5.
			expect(accumulateSeriesByYear(metric, effortHistory).data).toEqual([
				['2024-01-01', 0.5],
				['2024-02-01', 0.75]
			]);
		});

		it('resets the effort denominator at each new calendar year too', () => {
			const metric: LineChartData = {
				name: 'arrivals',
				data: [
					['2023-12-01', 6],
					['2024-01-01', 2]
				]
			};
			const effortHistory: LineChartData = {
				name: 'effort',
				data: [
					['2023-12-01', 2],
					['2024-01-01', 4]
				]
			};
			expect(accumulateSeriesByYear(metric, effortHistory).data).toEqual([
				['2023-12-01', 3],
				['2024-01-01', 0.5]
			]);
		});
	});

	describe('Edge: gaps, zero effort and empty input', () => {
		it('accumulates a series with no data some months without treating a gap as breaking the running sum', () => {
			const metric: LineChartData = {
				name: 'arrivals',
				data: [
					['2024-01-01', 5],
					// A dense-spine zero-count month is "no data", but a cumulative
					// count can't un-happen, so it carries the running total forward.
					['2024-02-01', 0],
					['2024-03-01', null],
					['2024-04-01', 3]
				]
			};
			expect(accumulateSeriesByYear(metric).data).toEqual([
				['2024-01-01', 5],
				['2024-02-01', 5],
				['2024-03-01', 5],
				['2024-04-01', 8]
			]);
		});

		it('leaves the months before a year’s first reportable value as a gap', () => {
			const metric: LineChartData = {
				name: 'arrivals',
				data: [
					['2024-01-01', 0],
					['2024-02-01', 4]
				]
			};
			expect(accumulateSeriesByYear(metric).data).toEqual([
				['2024-01-01', null],
				['2024-02-01', 4]
			]);
		});

		it('maps a month with 0 cumulative effort hours to 0, not NaN/Infinity', () => {
			const metric: LineChartData = {
				name: 'arrivals',
				data: [['2024-01-01', 3]]
			};
			const effortHistory: LineChartData = {
				name: 'effort',
				data: [['2024-01-01', 0]]
			};
			expect(accumulateSeriesByYear(metric, effortHistory).data).toEqual([
				['2024-01-01', 0]
			]);
		});

		it('accumulates oldest-first regardless of input order', () => {
			const metric: LineChartData = {
				name: 'arrivals',
				data: [
					['2024-02-01', 3],
					['2024-01-01', 5]
				]
			};
			expect(accumulateSeriesByYear(metric).data).toEqual([
				['2024-01-01', 5],
				['2024-02-01', 8]
			]);
		});

		it('returns an empty series unchanged', () => {
			expect(accumulateSeriesByYear({ name: 'arrivals', data: [] })).toEqual({
				name: 'arrivals',
				data: []
			});
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

describe('toPercentStackedSeries', () => {
	describe('Usual: each value as a share of its period total', () => {
		it("converts each series' value at a date to its percentage share of that date's total across all series", () => {
			const series: LineChartData[] = [
				{
					name: 'Juv',
					data: [
						['2024-01-01', 3],
						['2024-02-01', 1]
					]
				},
				{
					name: 'Postjuv',
					data: [
						['2024-01-01', 1],
						['2024-02-01', 3]
					]
				}
			];
			const [juv, postjuv] = toPercentStackedSeries(series);
			expect(juv.data).toEqual([
				['2024-01-01', 75],
				['2024-02-01', 25]
			]);
			expect(postjuv.data).toEqual([
				['2024-01-01', 25],
				['2024-02-01', 75]
			]);
		});

		it('produces proportions that sum to ~100 for every period across all series', () => {
			const series: LineChartData[] = [
				{
					name: 'a',
					data: [
						['2024-01-01', 7],
						['2024-02-01', 1]
					]
				},
				{
					name: 'b',
					data: [
						['2024-01-01', 11],
						['2024-02-01', 2]
					]
				},
				{
					name: 'c',
					data: [
						['2024-01-01', 13],
						['2024-02-01', 97]
					]
				}
			];
			const result = toPercentStackedSeries(series);
			for (const pointIndex of [0, 1]) {
				const total = result.reduce(
					(runningTotal, metric) =>
						runningTotal + (metric.data[pointIndex][1] ?? 0),
					0
				);
				expect(total).toBeCloseTo(100, 10);
			}
		});
	});

	describe('Structure: series-count and transform-composition shapes', () => {
		it('returns 100 for every reportable period on a single-series input', () => {
			const series: LineChartData[] = [
				{
					name: 'only',
					data: [
						['2024-01-01', 4],
						['2024-02-01', 900]
					]
				}
			];
			expect(toPercentStackedSeries(series)[0].data).toEqual([
				['2024-01-01', 100],
				['2024-02-01', 100]
			]);
		});

		it('correctly apportions percentages across five or more series', () => {
			// Five series at 1/2/3/4/10 → total 20, so 5/10/15/20/50 percent.
			const series: LineChartData[] = [1, 2, 3, 4, 10].map((value, index) => ({
				name: `metric ${index}`,
				data: [['2024-01-01', value] as [string, number | null]]
			}));
			expect(
				toPercentStackedSeries(series).map((metric) => metric.data[0][1])
			).toEqual([5, 10, 15, 20, 50]);
		});

		it('produces identical percentages whether the input was effort-normalized first or not, since the same per-date divisor cancels out of the ratio', () => {
			const series: LineChartData[] = [
				{
					name: 'Juv',
					data: [
						['2024-01-01', 3],
						['2024-02-01', 5]
					]
				},
				{
					name: 'Postjuv',
					data: [
						['2024-01-01', 1],
						['2024-02-01', 15]
					]
				}
			];
			const effortHistory: LineChartData = {
				name: 'effort',
				data: [
					['2024-01-01', 2],
					['2024-02-01', 8]
				]
			};
			expect(
				toPercentStackedSeries(normalizeSeriesByEffort(series, effortHistory))
			).toEqual(toPercentStackedSeries(series));
		});
	});

	describe('Edge: zero totals, gaps and empty input', () => {
		it('outputs 0, not NaN or Infinity, for a period whose total across all series is zero', () => {
			const series: LineChartData[] = [
				{ name: 'Juv', data: [['2024-01-01', 0]] },
				{ name: 'Postjuv', data: [['2024-01-01', 0]] }
			];
			expect(
				toPercentStackedSeries(series).map((metric) => metric.data)
			).toEqual([[['2024-01-01', 0]], [['2024-01-01', 0]]]);
		});

		it("preserves null as a gap for a series whose own value is null at a period, without corrupting the other series' percentages at that period", () => {
			const series: LineChartData[] = [
				{ name: 'Juv', data: [['2024-01-01', null]] },
				{ name: 'Postjuv', data: [['2024-01-01', 6]] },
				{ name: 'Pulli', data: [['2024-01-01', 2]] }
			];
			const [juv, postjuv, pulli] = toPercentStackedSeries(series);
			// The null series stays a gap (not a manufactured 0%), and counts as 0
			// in the denominator, so the two real series still sum to 100.
			expect(juv.data).toEqual([['2024-01-01', null]]);
			expect(postjuv.data).toEqual([['2024-01-01', 75]]);
			expect(pulli.data).toEqual([['2024-01-01', 25]]);
		});

		it('returns an empty data array for an empty input series', () => {
			expect(toPercentStackedSeries([])).toEqual([]);
			expect(toPercentStackedSeries([{ name: 'Juv', data: [] }])).toEqual([
				{ name: 'Juv', data: [] }
			]);
		});

		it("leaves each series' name and array order unchanged", () => {
			const series: LineChartData[] = [
				{ name: 'Postjuv', data: [['2024-01-01', 1]] },
				{ name: 'Juv', data: [['2024-01-01', 3]] }
			];
			expect(
				toPercentStackedSeries(series).map((metric) => metric.name)
			).toEqual(['Postjuv', 'Juv']);
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

	describe('Structure: allowYearAccumulation / Accumulate toggle', () => {
		// Two months of one calendar year, with effort hours chosen so the
		// accumulate × normalize composition is distinguishable from a sum of
		// per-month rates by hand (see the combination test below).
		const accumulable: LineChartData[] = [
			{
				name: 'arrivals',
				data: [
					['2024-01-01', 2],
					['2024-02-01', 4]
				]
			}
		];
		const accumulableEffort: LineChartData = {
			name: 'effort',
			data: [
				['2024-01-01', 4],
				['2024-02-01', 4]
			]
		};
		// Spans two calendar years, so the Interval toggle is actually offered.
		const multiYear: LineChartData[] = [
			{
				name: 'arrivals',
				data: [
					['2023-04-01', 2],
					['2024-03-01', 4],
					['2024-06-01', 6]
				]
			}
		];
		// Both Normalize and Accumulate render Yes/No radios, so every query has
		// to be scoped to its own toggle group (the label span's parent holds
		// that group's radios).
		const toggle = (label: string) =>
			within(screen.getByText(label).parentElement!);

		it('does not render an Accumulate toggle when allowYearAccumulation is unset', () => {
			render(
				<YearComparisonTrendChart
					series={accumulable}
					effortHistory={accumulableEffort}
				/>
			);
			expect(screen.queryByText('Accumulate')).toBeNull();
		});

		it('renders an Accumulate toggle only in all-time mode when allowYearAccumulation is true', () => {
			render(
				<YearComparisonTrendChart series={accumulable} allowYearAccumulation />
			);
			expect(screen.getByText('Accumulate')).toBeTruthy();
			const no = toggle('Accumulate').getByRole('radio', {
				name: 'No'
			}) as HTMLInputElement;
			expect(no.checked).toBe(true);

			fireEvent.click(screen.getByRole('radio', { name: 'Compare years' }));
			expect(screen.queryByText('Accumulate')).toBeNull();

			fireEvent.click(screen.getByRole('radio', { name: 'This year' }));
			expect(screen.queryByText('Accumulate')).toBeNull();
		});

		it('turning Accumulate on forces interval to month and hides the Interval toggle', () => {
			render(
				<YearComparisonTrendChart series={multiYear} allowYearAccumulation />
			);
			fireEvent.click(screen.getByRole('radio', { name: 'Year' }));
			expect(
				(screen.getByRole('radio', { name: 'Year' }) as HTMLInputElement)
					.checked
			).toBe(true);

			fireEvent.click(toggle('Accumulate').getByRole('radio', { name: 'Yes' }));
			expect(screen.queryByRole('radio', { name: 'Year' })).toBeNull();
			expect(screen.queryByRole('radio', { name: 'Month' })).toBeNull();
			// The monthly (accumulated) points are plotted, not one point per year.
			const [chart] = screen.getAllByTestId('area-chart');
			expect(JSON.parse(chart.dataset.values!)).toEqual([
				[
					['2023-04-01', 2],
					['2024-03-01', 4],
					['2024-06-01', 10]
				]
			]);

			// Turning it back off restores the Interval toggle, reset to Month.
			fireEvent.click(toggle('Accumulate').getByRole('radio', { name: 'No' }));
			expect(
				(screen.getByRole('radio', { name: 'Month' }) as HTMLInputElement)
					.checked
			).toBe(true);
		});

		it('turning Accumulate on renders the chart as a stacked area', () => {
			render(
				<YearComparisonTrendChart series={accumulable} allowYearAccumulation />
			);
			const chartBefore = screen.getByTestId('line-chart');
			expect(chartBefore.dataset.stacked).toBeUndefined();

			fireEvent.click(toggle('Accumulate').getByRole('radio', { name: 'Yes' }));
			// Rendered via chartkick's AreaChart (filled, translucent datasets) —
			// not LineChart — since a `library` option alone can't put a filled
			// dataset onto a LineChart-rendered chart (see
			// STACKED_AREA_CHART_LIBRARY's comment in the component).
			expect(screen.queryByTestId('line-chart')).toBeNull();
			const chartAfter = screen.getByTestId('area-chart');
			expect(chartAfter.dataset.stacked).toBe('true');
			// The stacked-area config is layered on top of the trend config, not a
			// replacement — the legend filter still runs.
			expect(JSON.parse(chartAfter.dataset.visibleInLegend!)).toEqual([
				'arrivals'
			]);
		});

		it('switching to compare-years mode while accumulate is on turns accumulate back off', () => {
			render(
				<YearComparisonTrendChart series={accumulable} allowYearAccumulation />
			);
			fireEvent.click(toggle('Accumulate').getByRole('radio', { name: 'Yes' }));
			fireEvent.click(screen.getByRole('radio', { name: 'Compare years' }));
			fireEvent.click(screen.getByRole('radio', { name: 'All time' }));

			expect(
				(
					toggle('Accumulate').getByRole('radio', {
						name: 'No'
					}) as HTMLInputElement
				).checked
			).toBe(true);
			const chart = screen.getByTestId('line-chart');
			expect(chart.dataset.stacked).toBeUndefined();
			expect(JSON.parse(chart.dataset.values!)).toEqual([accumulable[0].data]);
		});

		it('turning on both Accumulate and Normalize divides cumulative counts by cumulative effort, not the sum of per-month rates', () => {
			render(
				<YearComparisonTrendChart
					series={accumulable}
					effortHistory={accumulableEffort}
					allowYearAccumulation
				/>
			);
			fireEvent.click(toggle('Accumulate').getByRole('radio', { name: 'Yes' }));
			fireEvent.click(toggle('Normalize').getByRole('radio', { name: 'Yes' }));

			const chart = screen.getByTestId('area-chart');
			// Cumulative 2/4 = 0.5, then 6/8 = 0.75 — summing the per-month rates
			// (0.5, then 0.5 + 1 = 1.5) would be wrong.
			expect(JSON.parse(chart.dataset.values!)).toEqual([
				[
					['2024-01-01', 0.5],
					['2024-02-01', 0.75]
				]
			]);
			expect(chart.dataset.ytitle).toBe('Value per hour');
		});

		it('sums the Total series from the already-accumulated metrics when includeTotalSeries is set', () => {
			render(
				<YearComparisonTrendChart
					series={[
						accumulable[0],
						{
							name: 'departures',
							data: [
								['2024-01-01', 1],
								['2024-02-01', 3]
							]
						}
					]}
					allowYearAccumulation
					includeTotalSeries
				/>
			);
			fireEvent.click(toggle('Accumulate').getByRole('radio', { name: 'Yes' }));
			const chart = screen.getByTestId('area-chart');
			expect(JSON.parse(chart.dataset.series!)).toEqual([
				'arrivals',
				'departures',
				'Total'
			]);
			const [, , total] = JSON.parse(chart.dataset.values!);
			// Cumulative arrivals 2/6 plus cumulative departures 1/4.
			expect(total).toEqual([
				['2024-01-01', 3],
				['2024-02-01', 10]
			]);
		});
	});

	describe('Structure: percentStackable / % stacked toggle', () => {
		// Two series over two calendar years (so the Interval toggle is offered
		// too), with per-month splits that are exact percentages by hand:
		// 2023-01 → 75/25, 2023-06 → 25/75, 2024-01 → 50/50.
		const stackable: LineChartData[] = [
			{
				name: 'Juv',
				data: [
					['2023-01-01', 3],
					['2023-06-01', 1],
					['2024-01-01', 2]
				]
			},
			{
				name: 'Postjuv',
				data: [
					['2023-01-01', 1],
					['2023-06-01', 3],
					['2024-01-01', 2]
				]
			}
		];
		const stackableEffort: LineChartData = {
			name: 'effort',
			data: [
				['2023-01-01', 2],
				['2023-06-01', 8],
				['2024-01-01', 4]
			]
		};
		// Normalize and % stacked both render Yes/No radios, so every query has
		// to be scoped to its own toggle group (the label span's parent holds
		// that group's radios).
		const toggle = (label: string) =>
			within(screen.getByText(label).parentElement!);
		const turnOn = () =>
			fireEvent.click(toggle('% stacked').getByRole('radio', { name: 'Yes' }));

		describe('Usual: switching the view between line and percent-stacked area', () => {
			it('renders the line chart with the toggle defaulted to "No" when percentStackable is set', () => {
				render(
					<YearComparisonTrendChart series={stackable} percentStackable />
				);
				const no = toggle('% stacked').getByRole('radio', {
					name: 'No'
				}) as HTMLInputElement;
				expect(no.checked).toBe(true);
				const chart = screen.getByTestId('line-chart');
				expect(JSON.parse(chart.dataset.values!)).toEqual([
					stackable[0].data,
					stackable[1].data
				]);
			});

			it('renders an area chart with stacked percentages when the toggle is switched to "Yes"', () => {
				render(
					<YearComparisonTrendChart series={stackable} percentStackable />
				);
				turnOn();
				expect(screen.queryByTestId('line-chart')).toBeNull();
				const chart = screen.getByTestId('area-chart');
				expect(chart.dataset.stacked).toBe('true');
				expect(JSON.parse(chart.dataset.values!)).toEqual([
					[
						['2023-01-01', 75],
						['2023-06-01', 25],
						['2024-01-01', 50]
					],
					[
						['2023-01-01', 25],
						['2023-06-01', 75],
						['2024-01-01', 50]
					]
				]);
			});

			it('reverts to the line chart when the toggle is switched back to "No"', () => {
				render(
					<YearComparisonTrendChart series={stackable} percentStackable />
				);
				turnOn();
				fireEvent.click(toggle('% stacked').getByRole('radio', { name: 'No' }));
				expect(screen.queryByTestId('area-chart')).toBeNull();
				const chart = screen.getByTestId('line-chart');
				expect(JSON.parse(chart.dataset.values!)).toEqual([
					stackable[0].data,
					stackable[1].data
				]);
			});

			it('fixes the axis to 0–100 with a % suffix and a "% of total" ytitle while on', () => {
				render(
					<YearComparisonTrendChart
						series={stackable}
						ytitle="Count"
						percentStackable
					/>
				);
				const lineChart = screen.getByTestId('line-chart');
				expect(lineChart.dataset.ytitle).toBe('Count');
				expect(lineChart.dataset.max).toBeUndefined();
				expect(lineChart.dataset.suffix).toBeUndefined();

				turnOn();
				const areaChart = screen.getByTestId('area-chart');
				expect(areaChart.dataset.min).toBe('0');
				expect(areaChart.dataset.max).toBe('100');
				expect(JSON.parse(areaChart.dataset.suffix!)).toBe('%');
				expect(areaChart.dataset.ytitle).toBe('% of total');
			});

			it('keeps the same per-metric colours the line view uses', () => {
				const colors = ['#111111', '#222222'];
				render(
					<YearComparisonTrendChart
						series={stackable}
						colors={colors}
						percentStackable
					/>
				);
				turnOn();
				expect(
					JSON.parse(screen.getByTestId('area-chart').dataset.colors!)
				).toEqual(colors);
			});
		});

		describe('Structure: mode gating', () => {
			it('shows the % stacked toggle in all-time mode when percentStackable is true', () => {
				render(
					<YearComparisonTrendChart series={stackable} percentStackable />
				);
				expect(screen.getByText('% stacked')).toBeTruthy();
			});

			it('hides the % stacked toggle in compare-years mode', () => {
				render(
					<YearComparisonTrendChart series={stackable} percentStackable />
				);
				fireEvent.click(screen.getByRole('radio', { name: 'Compare years' }));
				expect(screen.queryByText('% stacked')).toBeNull();
			});

			it('hides the % stacked toggle in this-year mode', () => {
				render(
					<YearComparisonTrendChart series={stackable} percentStackable />
				);
				fireEvent.click(screen.getByRole('radio', { name: 'This year' }));
				expect(screen.queryByText('% stacked')).toBeNull();
			});

			it('never renders the toggle at all when percentStackable is not set', () => {
				render(<YearComparisonTrendChart series={stackable} />);
				expect(screen.queryByText('% stacked')).toBeNull();
				expect(screen.queryByTestId('area-chart')).toBeNull();
			});
		});

		describe('Edge: composition with the other toggles', () => {
			it('retains the previous % stacked toggle value when the user leaves and returns to all-time mode', () => {
				render(
					<YearComparisonTrendChart series={stackable} percentStackable />
				);
				turnOn();
				fireEvent.click(screen.getByRole('radio', { name: 'Compare years' }));
				fireEvent.click(screen.getByRole('radio', { name: 'All time' }));

				expect(
					(
						toggle('% stacked').getByRole('radio', {
							name: 'Yes'
						}) as HTMLInputElement
					).checked
				).toBe(true);
				expect(screen.getByTestId('area-chart')).toBeTruthy();
			});

			it('applies percent-stacking after year-aggregation when Interval is set to Year', () => {
				render(
					<YearComparisonTrendChart series={stackable} percentStackable />
				);
				turnOn();
				fireEvent.click(screen.getByRole('radio', { name: 'Year' }));
				const chart = screen.getByTestId('area-chart');
				// Yearly sums are Juv 4/2 and Postjuv 4/2, so both years are a 50/50
				// split. Percent-stacking *before* the yearly sum would instead
				// aggregate the monthly percentages (75 + 25 = 100 for Juv in 2023).
				expect(JSON.parse(chart.dataset.values!)).toEqual([
					[
						['2023', 50],
						['2024', 50]
					],
					[
						['2023', 50],
						['2024', 50]
					]
				]);
			});

			it('produces the same percentages whether Normalize is on or off', () => {
				render(
					<YearComparisonTrendChart
						series={stackable}
						effortHistory={stackableEffort}
						percentStackable
					/>
				);
				turnOn();
				const beforeNormalize = screen.getByTestId('area-chart').dataset.values;

				fireEvent.click(
					toggle('Normalize').getByRole('radio', { name: 'Yes' })
				);
				// Effort-normalizing divides every series at a date by the same
				// scalar, so it cancels out of each series' share of the total.
				expect(screen.getByTestId('area-chart').dataset.values).toBe(
					beforeNormalize
				);
			});

			it('excludes the Total series from the stack, so the bands still sum to 100', () => {
				render(
					<YearComparisonTrendChart
						series={stackable}
						includeTotalSeries
						percentStackable
					/>
				);
				// The line view plots the Total alongside its parts...
				expect(
					JSON.parse(screen.getByTestId('line-chart').dataset.series!)
				).toEqual(['Juv', 'Postjuv', 'Total']);

				turnOn();
				const chart = screen.getByTestId('area-chart');
				// ...but the percent view drops it: a Total is the whole, not one of
				// the parts, so stacking it too would take every period to 200%.
				expect(JSON.parse(chart.dataset.series!)).toEqual(['Juv', 'Postjuv']);
				expect(JSON.parse(chart.dataset.values!)).toEqual([
					[
						['2023-01-01', 75],
						['2023-06-01', 25],
						['2024-01-01', 50]
					],
					[
						['2023-01-01', 25],
						['2023-06-01', 75],
						['2024-01-01', 50]
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
