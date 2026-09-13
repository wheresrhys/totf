'use client';
import { useId, useState } from 'react';
import Link from 'next/link';
import { LineChart, type LineChartData } from 'react-chartkick';
import 'chartkick/chart.js';
import { SecondaryHeading } from '@/app/components/shared/DesignSystem';

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

// Base colour per metric, matching chartkick's own default palette so the
// per-metric year-on-year / this-year charts reuse the exact colour each metric
// has in the all-time chart. The all-time chart is handed these same colours
// explicitly (rather than relying on chartkick's implicit defaults) so the two
// views stay in lock-step even if chartkick's palette ever changes.
const METRIC_BASE_COLORS = [
	'#3366CC',
	'#DC3912',
	'#FF9900',
	'#109618',
	'#990099',
	'#3B3EAC',
	'#0099C6',
	'#DD4477',
	'#66AA00',
	'#B82E2E',
	'#316395',
	'#994499',
	'#22AA99',
	'#AAAA11',
	'#6633CC',
	'#E67300',
	'#8B0707',
	'#329262',
	'#5574A6',
	'#651067'
];

// The current calendar year is always drawn in black so it stands out against
// the shaded previous years.
const CURRENT_YEAR_COLOR = '#000000';

function metricBaseColor(metricIndex: number): string {
	return METRIC_BASE_COLORS[metricIndex % METRIC_BASE_COLORS.length];
}

// Mixes a hex colour towards white by `fraction` (0 = unchanged, 1 = white).
function lighten(hex: string, fraction: number): string {
	const value = parseInt(hex.slice(1), 16);
	const r = (value >> 16) & 0xff;
	const g = (value >> 8) & 0xff;
	const b = value & 0xff;
	const mix = (channel: number) =>
		Math.round(channel + (255 - channel) * fraction);
	const toHex = (channel: number) => channel.toString(16).padStart(2, '0');
	return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

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

// The "this-year" view's min/max band (see `toThisYearSeries`) is drawn from
// two series named 'Previous max'/'Previous min' purely to shade the band
// between them — they aren't meaningful legend entries on their own (the band
// they draw is already implied by the shaded area, and the median/current-year
// lines are the series worth labelling). These names never occur in the
// all-time or compare-years series, so filtering them out of the legend here
// is safe across every mode without needing a per-mode library override.
const HIDDEN_LEGEND_SERIES_NAMES = new Set(['Previous max', 'Previous min']);

export function isHiddenFromLegend(seriesName: string): boolean {
	return HIDDEN_LEGEND_SERIES_NAMES.has(seriesName);
}

// Shared chartkick config for every trend line — small points, smoothed lines.
// Used by both the all-time chart and each per-year chart so a single toggle can
// swap between them without the lines changing appearance.
const TREND_CHART_LIBRARY = {
	elements: {
		point: { radius: 1 },
		line: { cubicInterpolationMode: 'monotone' }
	},
	plugins: {
		legend: {
			labels: {
				filter: (legendItem: { text: string }) =>
					!isHiddenFromLegend(legendItem.text)
			}
		}
	}
};

type ChartMode = 'all-time' | 'compare-years' | 'this-year';

const MODE_OPTIONS: { value: ChartMode; label: string }[] = [
	{ value: 'all-time', label: 'All time' },
	{ value: 'compare-years', label: 'Compare years' },
	{ value: 'this-year', label: 'This year' }
];

const NORMALIZE_OPTIONS: { value: boolean; label: string }[] = [
	{ value: false, label: 'No' },
	{ value: true, label: 'Yes' }
];

// Granularity of the "All time" view: 'month' is the conventional per-month
// trend line; 'year' collapses each metric to one point per calendar year via
// `aggregateSeriesByYear`. Only ever shown in the all-time view.
type Interval = 'year' | 'month';

const INTERVAL_OPTIONS: { value: Interval; label: string }[] = [
	{ value: 'year', label: 'Year' },
	{ value: 'month', label: 'Month' }
];

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

type YearlyAggregator = 'sum' | 'mean' | 'max' | 'min';

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

// One colour per year (in the oldest-first order `toYearOnYearSeries` returns),
// for the compare-years view. The current year is black; every previous year is
// a shade of the metric's base colour — the most recent previous year at full
// strength, older years progressively paler.
export function yearColors(
	years: number[],
	baseColor: string,
	currentYear: number
): string[] {
	const previousYears = years.filter((year) => year !== currentYear);
	const denominator = previousYears.length - 1;
	const MAX_LIGHTEN = 0.7;
	return years.map((year) => {
		if (year === currentYear) return CURRENT_YEAR_COLOR;
		// `previousYears` is oldest-first: rank 0 is the oldest (palest), the last
		// rank is the most recent previous year (full-strength base colour).
		const rank = previousYears.indexOf(year);
		const lightenFraction =
			denominator <= 0 ? 0 : MAX_LIGHTEN * (1 - rank / denominator);
		return lighten(baseColor, lightenFraction);
	});
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

// Colours for the this-year view, in the series order `toThisYearSeries`
// returns (max, min, median, current year): a pale band, a mid-shade median,
// and the metric's full-strength base colour for the current year.
export function thisYearColors(baseColor: string): string[] {
	const bandColor = lighten(baseColor, 0.75);
	const medianColor = lighten(baseColor, 0.35);
	return [bandColor, bandColor, medianColor, baseColor];
}

function PerMetricChartGrid({
	metrics,
	ytitle,
	min,
	buildChart
}: {
	metrics: LineChartData[];
	ytitle: string;
	min: number | null;
	buildChart: (
		metric: LineChartData,
		metricIndex: number
	) => { data: LineChartData[]; colors: string[] };
}) {
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
			{metrics.map((metric, metricIndex) => {
				const { data, colors } = buildChart(metric, metricIndex);
				return (
					<div key={metric.name}>
						<SecondaryHeading>{metric.name}</SecondaryHeading>
						<LineChart
							min={min}
							data={data}
							colors={colors}
							xtitle="Month"
							ytitle={ytitle}
							library={TREND_CHART_LIBRARY}
						/>
					</div>
				);
			})}
		</div>
	);
}

// A metrics-over-time line chart with a toggle between three views of the same
// data:
//   - "All time": every metric plotted as one series across the full timeline
//     (the conventional trend chart).
//   - "Compare years": one small chart per metric, each holding a series per
//     year over a shared twelve-month axis (current year black, previous years
//     shades of the metric's colour), so equivalent months line up across years.
//   - "This year": one small chart per metric showing the current year against a
//     median line and min–max band summarising every previous year.
// Reusable across any set of dated metric series (`series`), so any
// metrics-plotted-over-time chart can opt into year comparison.
export function YearComparisonTrendChart({
	series,
	xtitle = 'Year',
	ytitle = 'Value',
	min = 0,
	effortHistory,
	compareYearsUrl,
	colors,
	yearlyAggregators,
	includeTotalSeries
}: {
	series: LineChartData[];
	xtitle?: string;
	ytitle?: string;
	min?: number | null;
	// A single, species-agnostic series of `[date, effortHours]` pairs, keyed
	// with the same date convention as `series`. When passed, a "Normalize"
	// toggle appears that divides every metric's values by effort hours.
	effortHistory?: LineChartData;
	// When passed, replaces the all-time/compare-years/this-year mode
	// switcher with a single "Compare years" link to a dedicated page, and the
	// chart renders in a fixed `'all-time'` mode (there's no switcher left to
	// pick another mode).
	compareYearsUrl?: string;
	// Explicit per-metric base colours, indexed the same as `series`. When
	// supplied, `colors[metricIndex]` replaces the internally-computed
	// `metricBaseColor(metricIndex)` as that metric's base colour in *every*
	// mode (all-time series colour, and the base each per-metric
	// compare-years/this-year sub-chart derives its shades from). A caller uses
	// this to impose colour relationships the default per-index palette can't
	// express (e.g. light/dark hue pairs). Leaving it `undefined` reproduces the
	// default palette exactly, so callers that don't pass it are unaffected. An
	// index without a colour (shorter array) falls back to the default palette.
	colors?: string[];
	// How each metric's monthly points collapse into a single yearly point when
	// the all-time "Interval" toggle is set to Year, keyed by the metric's
	// `name`. A metric absent from the map defaults to `'sum'`. Counts sum; a
	// biometrics "max"/"min" series aggregates via `max`/`min`, and a "median"
	// series via `mean` (an average-of-monthly-medians approximation — see #810).
	yearlyAggregators?: Record<string, YearlyAggregator>;
	// When `true`, appends one extra `Total` series — the per-period sum of
	// every other currently-plotted series (computed downstream of the
	// Normalize toggle, so it stays a valid per-hour rate when normalized) —
	// to every mode/interval. Omitting it (or passing `false`) leaves
	// rendering byte-for-byte identical to not having the prop at all.
	includeTotalSeries?: boolean;
}) {
	const [mode, setMode] = useState<ChartMode>('all-time');
	const [normalize, setNormalize] = useState(false);
	const [interval, setInterval] = useState<Interval>('month');
	// Unique per instance so several of these charts on one page (e.g. multiple
	// expanded species-graph tiles) don't share a radio group.
	const toggleName = useId();
	const currentYear = new Date().getFullYear();
	const effectiveSeries =
		normalize && effortHistory
			? normalizeSeriesByEffort(series, effortHistory)
			: series;
	const effectiveYtitle =
		normalize && effortHistory ? `${ytitle} per hour` : ytitle;
	// The total series (when requested) is appended right after
	// `effectiveSeries` is computed — post-normalize, pre-interval-aggregation
	// — so it's summed from already effort-normalized values when Normalize is
	// on, and then flows through every mode/interval below for free (the total
	// is simply the next metric index, so it gets its own base colour, its own
	// compare-years/this-year sub-chart, and its own Year-interval aggregation
	// via the same `yearlyAggregators` default-to-'sum' mechanism as any other
	// metric).
	const plottedSeries = includeTotalSeries
		? [...effectiveSeries, buildTotalSeries(effectiveSeries)]
		: effectiveSeries;
	// A metric's base colour: the caller's explicit override at that index if
	// supplied, else the default per-index palette. Used identically by all three
	// modes so an override recolours every view consistently.
	const baseColorFor = (metricIndex: number): string =>
		colors?.[metricIndex] ?? metricBaseColor(metricIndex);
	const allTimeColors = plottedSeries.map((_, metricIndex) =>
		baseColorFor(metricIndex)
	);
	// Year aggregation is layered on top of the (possibly effort-normalized,
	// possibly total-appended) series, matching the order-of-operations the
	// normalize toggle establishes.
	const allTimeSeries =
		interval === 'year'
			? plottedSeries.map((metric) =>
					aggregateSeriesByYear(
						metric,
						yearlyAggregators?.[metric.name] ?? 'sum'
					)
				)
			: plottedSeries;
	const showIntervalToggle = mode === 'all-time' && spansMultipleYears(series);
	return (
		<div className="flex flex-col">
			<div className="mb-2 flex flex-wrap items-center justify-end gap-2">
				{compareYearsUrl ? (
					<Link href={compareYearsUrl} className="link link-secondary text-sm">
						Compare years
					</Link>
				) : (
					<div className="border-base-content/20 flex gap-0.5 rounded-field border p-0.5">
						{MODE_OPTIONS.map((option) => (
							<label
								key={option.value}
								htmlFor={`${toggleName}-${option.value}`}
								className="btn btn-sm btn-text has-checked:btn-active"
							>
								<span>{option.label}</span>
								<input
									id={`${toggleName}-${option.value}`}
									name={toggleName}
									type="radio"
									className="hidden"
									checked={mode === option.value}
									onChange={() => setMode(option.value)}
								/>
							</label>
						))}
					</div>
				)}
				{showIntervalToggle ? (
					<div className="flex items-center gap-1">
						<span className="text-sm">Interval</span>
						<div className="border-base-content/20 flex gap-0.5 rounded-field border p-0.5">
							{INTERVAL_OPTIONS.map((option) => (
								<label
									key={option.value}
									htmlFor={`${toggleName}-interval-${option.value}`}
									className="btn btn-sm btn-text has-checked:btn-active"
								>
									<span>{option.label}</span>
									<input
										id={`${toggleName}-interval-${option.value}`}
										name={`${toggleName}-interval`}
										type="radio"
										className="hidden"
										checked={interval === option.value}
										onChange={() => setInterval(option.value)}
									/>
								</label>
							))}
						</div>
					</div>
				) : null}
				{effortHistory ? (
					<div className="flex items-center gap-1">
						<span className="text-sm">Normalize</span>
						<div className="border-base-content/20 flex gap-0.5 rounded-field border p-0.5">
							{NORMALIZE_OPTIONS.map((option) => (
								<label
									key={String(option.value)}
									htmlFor={`${toggleName}-normalize-${option.value}`}
									className="btn btn-sm btn-text has-checked:btn-active"
								>
									<span>{option.label}</span>
									<input
										id={`${toggleName}-normalize-${option.value}`}
										name={`${toggleName}-normalize`}
										type="radio"
										className="hidden"
										checked={normalize === option.value}
										onChange={() => setNormalize(option.value)}
									/>
								</label>
							))}
						</div>
					</div>
				) : null}
			</div>
			<div>
				{mode === 'all-time' && (
					<LineChart
						min={min}
						data={allTimeSeries}
						colors={allTimeColors}
						xtitle={xtitle}
						ytitle={effectiveYtitle}
						library={TREND_CHART_LIBRARY}
					/>
				)}
				{mode === 'compare-years' && (
					<PerMetricChartGrid
						metrics={plottedSeries}
						ytitle={effectiveYtitle}
						min={min}
						buildChart={(metric, metricIndex) => {
							const yearSeries = toYearOnYearSeries(metric);
							const years = yearSeries.map((yearRow) => Number(yearRow.name));
							return {
								data: yearSeries,
								colors: yearColors(
									years,
									baseColorFor(metricIndex),
									currentYear
								)
							};
						}}
					/>
				)}
				{mode === 'this-year' && (
					<PerMetricChartGrid
						metrics={plottedSeries}
						ytitle={effectiveYtitle}
						min={min}
						buildChart={(metric, metricIndex) => ({
							data: toThisYearSeries(metric, currentYear),
							colors: thisYearColors(baseColorFor(metricIndex))
						})}
					/>
				)}
			</div>
		</div>
	);
}
