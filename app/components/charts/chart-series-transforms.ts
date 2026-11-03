// Pure `LineChartData` in / `LineChartData` out reshaping for
// `YearComparisonTrendChart`: the effort-normalize, year-regroup, yearly
// aggregate, within-year accumulate, total and percent-stacked transforms, plus
// the small gap/median/span helpers they share. No React, no JSX, no colour
// decisions (`chart-color-utils.ts` owns those).
import { type LineChartData } from 'react-chartkick';

const MONTH_LABELS = [
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

// `core_stats` returns a *dense* monthly spine: every month between the
// first and last session emits a row, and a month with no encounters of this
// species comes back as an explicit `0` (not an absent row). Plotting those
// zeros verbatim makes a partial/quiet year's line dive to a flat zero baseline
// through its empty months and then cliff up to its first real value — which
// reads as a broken, misplaced spike rather than a short line at the months that
// actually have data. So in the year-comparison views a zero-count month is
// treated as "no data" (a gap), matching the `null`-is-a-gap intent these
// transforms are built around. Genuine measurements (weights/wings) are never
// exactly `0`, so this only ever elides empty count months.
function hasReportableValue(value: number | null): value is number {
	return value != null && value !== 0;
}

// Whether `series`' underlying dates cross more than one calendar year — used
// to decide whether the all-time "Interval" toggle (Month vs Year) is even
// meaningful. A single-year chart has nothing to collapse a Year view down
// from, so the toggle would just be a confusing no-op. Reads raw dates (not
// gated by `hasReportableValue`) since this is about the span of the
// underlying data, not which months have reportable values within it.
export function spansMultipleYears(series: LineChartData[]): boolean {
	const years = new Set<number>();
	for (const metric of series) {
		for (const [rawDate] of metric.data) {
			years.add(new Date(rawDate).getUTCFullYear());
			if (years.size > 1) return true;
		}
	}
	return false;
}

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? (sorted[middle - 1] + sorted[middle]) / 2
		: sorted[middle];
}

// Divides each metric's `[date, value]` point by that date's ringing-effort
// hours from `effortHistory` (a single, species-agnostic series keyed by the
// same date convention as `series`), turning a raw count/measurement into an
// effort-normalized rate (e.g. "encounters per hour"). A `null` value is left
// as a gap rather than manufactured into a `0`. A date whose effort-hours
// lookup is `0`, missing, or otherwise falsy maps to an explicit `0` — never
// `NaN`/`Infinity`.
export function normalizeSeriesByEffort(
	series: LineChartData[],
	effortHistory: LineChartData
): LineChartData[] {
	const effortHoursByDate = new Map(effortHistory.data);
	return series.map((metric) => ({
		...metric,
		data: metric.data.map(([date, value]) => {
			if (value == null) return [date, null] as [string, number | null];
			const effortHours = effortHoursByDate.get(date);
			if (!effortHours) return [date, 0] as [string, number | null];
			return [date, value / effortHours] as [string, number | null];
		})
	}));
}

// Regroups one metric's `[date, value]` points into one series per calendar
// year. Every returned series carries all twelve months in Jan→Dec order (with
// `null` where a month has no data) so chartkick renders each year as a line
// over a shared, fixed twelve-month category x-axis — letting years be compared
// month-for-month. Years are returned oldest-first. Dates are read in UTC so a
// month-truncated ISO date (e.g. `2024-03-01`) never slips into the previous
// month in a behind-UTC timezone.
export function toYearOnYearSeries(metric: LineChartData): LineChartData[] {
	const valuesByYear = new Map<number, (number | null)[]>();
	for (const [rawDate, value] of metric.data) {
		if (!hasReportableValue(value)) continue;
		const date = new Date(rawDate);
		const year = date.getUTCFullYear();
		const monthIndex = date.getUTCMonth();
		if (!valuesByYear.has(year)) {
			valuesByYear.set(year, new Array(12).fill(null));
		}
		valuesByYear.get(year)![monthIndex] = value;
	}
	return [...valuesByYear.keys()]
		.sort((a, b) => a - b)
		.map((year) => ({
			name: String(year),
			data: MONTH_LABELS.map(
				(label, monthIndex) =>
					[label, valuesByYear.get(year)![monthIndex]] as [
						string,
						number | null
					]
			)
		}));
}

export type YearlyAggregator = 'sum' | 'mean' | 'max' | 'min';

function reduceByAggregator(
	values: number[],
	aggregator: YearlyAggregator
): number {
	switch (aggregator) {
		case 'sum':
			return values.reduce((total, value) => total + value, 0);
		case 'mean':
			return values.reduce((total, value) => total + value, 0) / values.length;
		case 'max':
			return Math.max(...values);
		case 'min':
			return Math.min(...values);
	}
}

// Collapses one metric's monthly `[date, value]` points down to a single point
// per calendar year, reducing each year's reportable months with `aggregator`.
// Every year present in the input span is emitted (oldest-first, labelled by
// year) so a quiet year in the middle renders as an explicit gap rather than
// the line bridging across it. A month with no reportable value is skipped from
// its year's aggregate (same `hasReportableValue` gap convention as
// `toYearOnYearSeries`/`toThisYearSeries` — a dense-spine zero-count month is
// "no data", not a real `0`); a year with no reportable months at all
// aggregates to `null` (a gap), never `0`/`NaN`. Dates are read in UTC to avoid
// the behind-UTC month-slip the sibling transforms already guard against.
//
// `'mean'` on a median-weight/median-wing series is an average-of-monthly-
// medians approximation — the true yearly median can't be recovered from
// monthly medians alone — and is accepted as-is (see #810).
export function aggregateSeriesByYear(
	metric: LineChartData,
	aggregator: YearlyAggregator
): LineChartData {
	const reportableByYear = new Map<number, number[]>();
	const yearsInSpan = new Set<number>();
	for (const [rawDate, value] of metric.data) {
		const year = new Date(rawDate).getUTCFullYear();
		yearsInSpan.add(year);
		if (!hasReportableValue(value)) continue;
		if (!reportableByYear.has(year)) {
			reportableByYear.set(year, []);
		}
		reportableByYear.get(year)!.push(value);
	}
	return {
		...metric,
		data: [...yearsInSpan]
			.sort((a, b) => a - b)
			.map((year) => {
				const values = reportableByYear.get(year);
				return [
					String(year),
					values && values.length
						? reduceByAggregator(values, aggregator)
						: null
				] as [string, number | null];
			})
	};
}

// Turns one metric's monthly `[date, value]` points into a *within-year
// cumulative* running total: each month becomes itself plus every preceding
// month in the same calendar year (Jan→Dec running sum), resetting at each new
// calendar year. Points keep their original `[date, value]` shape (and are
// returned oldest-first) so the result drops straight into the all-time
// timeline chart — this is only ever used in all-time / month-interval mode.
//
// The same `hasReportableValue` gap convention as the sibling transforms
// applies, but with a cumulative twist: a zero-count month contributes nothing
// to the sum and does *not* reset or break the running total — the accumulated
// value carries forward flat through it, because a cumulative count can't
// "un-happen". Only months *before* a year's first reportable value stay `null`
// (a leading gap), so the area doesn't start at zero before there's any data.
//
// When `effortHistory` is supplied (the Normalize composition), summing
// already-normalized per-month rates would be meaningless, so instead the raw
// counts and the effort-hours denominator are each accumulated separately
// across the year-to-date and divided once per month:
// `cumulative_raw_count[month] / cumulative_effort_hours[month]`. A month whose
// cumulative effort is `0`/missing divides to an explicit `0` (never
// `NaN`/`Infinity`), matching `normalizeSeriesByEffort`.
export function accumulateSeriesByYear(
	metric: LineChartData,
	effortHistory?: LineChartData
): LineChartData {
	const effortHoursByDate = effortHistory ? new Map(effortHistory.data) : null;
	// The running sum is order-dependent; the dense spine already arrives
	// oldest-first, but sort defensively (a lexical compare is exact for the
	// ISO dates these series are keyed by).
	const orderedByDate = [...metric.data].sort(([dateA], [dateB]) =>
		dateA < dateB ? -1 : dateA > dateB ? 1 : 0
	);
	let currentYear: number | null = null;
	let cumulativeCount = 0;
	let cumulativeEffortHours = 0;
	let seenReportableThisYear = false;
	return {
		...metric,
		data: orderedByDate.map(([date, value]) => {
			const year = new Date(date).getUTCFullYear();
			if (year !== currentYear) {
				currentYear = year;
				cumulativeCount = 0;
				cumulativeEffortHours = 0;
				seenReportableThisYear = false;
			}
			if (hasReportableValue(value)) {
				cumulativeCount += value;
				seenReportableThisYear = true;
			}
			if (effortHoursByDate) {
				const effortHours = effortHoursByDate.get(date);
				if (effortHours) cumulativeEffortHours += effortHours;
			}
			if (!seenReportableThisYear) {
				return [date, null] as [string, number | null];
			}
			if (effortHoursByDate) {
				return [
					date,
					cumulativeEffortHours ? cumulativeCount / cumulativeEffortHours : 0
				] as [string, number | null];
			}
			return [date, cumulativeCount] as [string, number | null];
		})
	};
}

// Builds a `Total` series summing every other series' value at each matching
// period, for the `includeTotalSeries` option. Mirrors
// `normalizeSeriesByEffort`'s "Map keyed by date" join pattern: the dates seen
// across every input series are unioned (in first-seen order), and each
// date's total sums whichever series have a reportable (non-null) value
// there — a date stays `null` (a gap) only when every contributing series is
// `null` there. Not a running/cumulative total: each period's total only
// ever reflects that period's own values.
export function buildTotalSeries(series: LineChartData[]): LineChartData {
	const datesInOrder: string[] = [];
	const valuesByDate = new Map<string, (number | null)[]>();
	for (const metric of series) {
		for (const [date, value] of metric.data) {
			if (!valuesByDate.has(date)) {
				valuesByDate.set(date, []);
				datesInOrder.push(date);
			}
			valuesByDate.get(date)!.push(value);
		}
	}
	return {
		name: 'Total',
		data: datesInOrder.map((date) => {
			const reportableValues = valuesByDate
				.get(date)!
				.filter((value): value is number => value != null);
			return [
				date,
				reportableValues.length
					? reportableValues.reduce((total, value) => total + value, 0)
					: null
			] as [string, number | null];
		})
	};
}

// Rewrites every series' value at each date as that value's percentage share of
// the date's total across all series, for the "% stacked" toggle — so the
// stacked bands read as proportions of a whole (summing to 100 at every date)
// rather than as absolute counts. Mirrors `buildTotalSeries`' "Map keyed by
// date" join pattern for computing each date's denominator.
//
// Three conventions, matching the sibling transforms:
//   - A `null` value stays `null` (a gap) rather than becoming `0` — the series
//     had no data there, which is not the same as a 0% share. Its absence does
//     still feed the denominator as a `0`, so the other series at that date
//     keep summing to 100.
//   - A date whose total is `0` (every series `0`/`null` there) maps every
//     series to an explicit `0` — never `NaN`/`Infinity`.
//   - Series `name`, order, and each series' own point order are unchanged, so
//     the caller's `colors` array still lines up index-for-index.
export function toPercentStackedSeries(
	series: LineChartData[]
): LineChartData[] {
	const totalByDate = new Map<string, number>();
	for (const metric of series) {
		for (const [date, value] of metric.data) {
			totalByDate.set(date, (totalByDate.get(date) ?? 0) + (value ?? 0));
		}
	}
	return series.map((metric) => ({
		...metric,
		data: metric.data.map(([date, value]) => {
			if (value == null) return [date, null] as [string, number | null];
			const total = totalByDate.get(date);
			if (!total) return [date, 0] as [string, number | null];
			return [date, (value / total) * 100] as [string, number | null];
		})
	}));
}

// Builds the this-year view for one metric: the current year's monthly line
// plus a summary of every previous year as a median line with a min–max band.
// The band is two invisible-point lines (max, then min) where min fills back to
// max, so chartkick/chart.js shades the range between them.
//
// Two independent orderings are at play, and both are load-bearing:
//   - *Array* order fixes the `fill: '-1'` target: max must immediately precede
//     min so min's fill reaches back to max (Chart.js resolves `-1` by array
//     index, unaffected by the `order` option below).
//   - *Draw* order (z-index) is set explicitly via each dataset's `order`.
//     Chart.js sorts datasets ascending by `order` then draws them in *reverse*
//     (core.controller `_drawDatasets`), and the Filler plugin paints a
//     dataset's fill immediately before that dataset's own line — so a *lower*
//     `order` renders in front. Without explicit `order`s every dataset ties at
//     0 and draws by array index in reverse, which puts the band's fill (drawn
//     with the min series) *on top of* the median and current-year lines and
//     hides them. Giving the band the highest `order` (drawn first, at the back)
//     and the current-year line the lowest keeps the lines visible over the band.
export function toThisYearSeries(
	metric: LineChartData,
	currentYear: number
): LineChartData[] {
	const currentYearValues = new Array<number | null>(12).fill(null);
	const previousValuesByMonth: number[][] = Array.from(
		{ length: 12 },
		() => []
	);
	for (const [rawDate, value] of metric.data) {
		if (!hasReportableValue(value)) continue;
		const date = new Date(rawDate);
		const year = date.getUTCFullYear();
		const monthIndex = date.getUTCMonth();
		if (year === currentYear) {
			currentYearValues[monthIndex] = value;
		} else if (year < currentYear) {
			previousValuesByMonth[monthIndex].push(value);
		}
	}
	const point = (monthIndex: number, value: number | null) =>
		[MONTH_LABELS[monthIndex], value] as [string, number | null];
	const maxData = previousValuesByMonth.map((values, monthIndex) =>
		point(monthIndex, values.length ? Math.max(...values) : null)
	);
	const minData = previousValuesByMonth.map((values, monthIndex) =>
		point(monthIndex, values.length ? Math.min(...values) : null)
	);
	const medianData = previousValuesByMonth.map((values, monthIndex) =>
		point(monthIndex, values.length ? median(values) : null)
	);
	const currentData = MONTH_LABELS.map((_, monthIndex) =>
		point(monthIndex, currentYearValues[monthIndex])
	);
	// `order` sets the draw order (lower = in front): band (max + min) at the
	// back, median in front of it, current-year line on top — see header comment.
	return [
		{
			name: 'Previous max',
			data: maxData,
			dataset: { fill: false, pointRadius: 0, borderWidth: 1, order: 3 }
		},
		{
			name: 'Previous min',
			data: minData,
			// Fill back to the immediately-preceding dataset (max) to shade the band.
			dataset: { fill: '-1', pointRadius: 0, borderWidth: 1, order: 3 }
		},
		{
			name: 'Previous median',
			data: medianData,
			dataset: { fill: false, pointRadius: 0, borderDash: [6, 4], order: 2 }
		},
		{
			name: String(currentYear),
			data: currentData,
			dataset: { fill: false, borderWidth: 3, order: 1 }
		}
	];
}
