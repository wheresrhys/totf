'use client';
import { useId, useState } from 'react';
import Link from 'next/link';
import { AreaChart, LineChart, type LineChartData } from 'react-chartkick';
import 'chartkick/chart.js';

import { SecondaryHeading } from '@/modules/ui-kit';
import {
	metricBaseColor,
	thisYearColors,
	yearColors
} from '@/app/components/charts/chart-color-utils';
import {
	accumulateSeriesByYear,
	aggregateSeriesByYear,
	buildTotalSeries,
	normalizeSeriesByEffort,
	spansMultipleYears,
	toPercentStackedSeries,
	toThisYearSeries,
	toYearOnYearSeries,
	type YearlyAggregator
} from '@/app/components/charts/chart-series-transforms';
import {
	INTERVAL_OPTIONS,
	MODE_OPTIONS,
	STACKED_AREA_CHART_LIBRARY,
	TREND_CHART_LIBRARY,
	YES_NO_OPTIONS,
	type ChartMode,
	type Interval
} from '@/app/components/charts/chart-config';

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
	includeTotalSeries,
	fetchYearSeries,
	allowYearAccumulation,
	percentStackable
}: {
	series: LineChartData[];
	xtitle?: string;
	ytitle?: string;
	min?: number | null;
	// A single, species-agnostic series of `[date, effort]` pairs, keyed
	// with the same date convention as `series`. When passed, a "Normalize"
	// toggle appears that divides every metric's values by that effort figure.
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
	// Normalize toggle, so it stays a valid per-effort rate when normalized) —
	// to every mode/interval. Omitting it (or passing `false`) leaves
	// rendering byte-for-byte identical to not having the prop at all.
	includeTotalSeries?: boolean;
	// Fetches the same metrics already aggregated by calendar year at source,
	// for the all-time Year interval. When supplied, switching Interval to Year
	// fetches once (cached for the component's lifetime — toggling back to
	// Month and out to Year again never refetches) and plots the fetched series
	// instead of running `aggregateSeriesByYear` over the monthly points.
	//
	// This matters for any bird-distinct metric (#852): `core_stats`'
	// `bird_count` and `demographics_stats`' age-bucket counts are
	// `COUNT(DISTINCT bird_id)` *within each month's cell*, so a bird retrapped
	// in three months of one year contributes 3 to a client-side yearly sum but
	// 1 to a year-grouped fetch. Only the fetch can answer that correctly.
	//
	// Omitting the prop keeps today's client-side `aggregateSeriesByYear`
	// behaviour exactly — which is why Biometrics (whose max/min/mean
	// aggregators are exact over monthly points, with no double-counting
	// mechanism) passes nothing and is untouched. The client-side path is also
	// the fallback if the fetch rejects.
	fetchYearSeries?: () => Promise<LineChartData[]>;
	// When `true`, offers an "Accumulate" toggle (all-time mode only). While
	// on, each series becomes a within-year cumulative running sum (see
	// `accumulateSeriesByYear`) rendered as a stacked area, the Interval is
	// forced to `'month'` and its toggle is hidden. Omitting it (the default)
	// leaves the component behaving exactly as before.
	allowYearAccumulation?: boolean;
	// When `true`, offers a "% stacked" toggle (all-time mode only). While on,
	// the all-time series are rewritten as each series' percentage share of its
	// period's total (see `toPercentStackedSeries`) and drawn as a stacked area
	// over a fixed 0–100% axis. Omitting it (the default) leaves the component
	// behaving exactly as before.
	//
	// Deliberately not offered in the compare-years/this-year modes: those render
	// one small chart *per metric*, where that metric is trivially 100% of its
	// own chart's total, so the view would say nothing.
	percentStackable?: boolean;
}) {
	const [mode, setMode] = useState<ChartMode>('all-time');
	const [normalize, setNormalize] = useState(false);
	const [interval, setInterval] = useState<Interval>('month');
	const [accumulate, setAccumulate] = useState(false);
	// Unlike `accumulate`, this is *not* reset when the user leaves all-time
	// mode: the toggle simply stops rendering, and the same choice is restored
	// on returning. (Accumulate resets because it also forces the Interval to
	// Month, so leaving it set-but-hidden would silently constrain a toggle the
	// user can still see.)
	const [percentStacked, setPercentStacked] = useState(false);
	// Request-once cache for `fetchYearSeries` (same boolean-guard pattern as
	// SpDemographicsTab/SpBiometricsTab's own fetches). `yearSeriesFailed` is
	// distinct from "not yet arrived" so a rejected fetch falls back to the
	// client-side aggregation rather than spinning forever.
	const [fetchedYearSeries, setFetchedYearSeries] = useState<
		LineChartData[] | null
	>(null);
	const [yearSeriesRequested, setYearSeriesRequested] = useState(false);
	const [yearSeriesFailed, setYearSeriesFailed] = useState(false);
	function loadYearSeries() {
		if (!fetchYearSeries || yearSeriesRequested) return;
		setYearSeriesRequested(true);
		fetchYearSeries()
			.then(setFetchedYearSeries)
			.catch(() => setYearSeriesFailed(true));
	}
	// Unique per instance so several of these charts on one page (e.g. multiple
	// expanded species-graph tiles) don't share a radio group.
	const toggleName = useId();
	const currentYear = new Date().getFullYear();
	// Accumulate is only meaningful in all-time mode; the toggle is hidden and
	// the mode switcher resets the state elsewhere, but gate on `mode` here too
	// so the compare-years/this-year sub-charts — which reshape each metric per
	// year — can never be handed accumulated data, even for a single render.
	const accumulating =
		!!allowYearAccumulation && accumulate && mode === 'all-time';
	const effectiveYtitle =
		normalize && effortHistory ? `${ytitle} per effort` : ytitle;
	// Applies the Normalize toggle and then the optional `Total` series to one
	// set of metric series, against whichever effort series matches that set's
	// granularity. The total is appended post-normalize (so it's summed from
	// already effort-normalized values and stays a valid per-effort rate) and —
	// on the monthly path — pre-interval-aggregation, so it flows through every
	// mode/interval for free: the total is simply the next metric index, so it
	// gets its own base colour, its own compare-years/this-year sub-chart, and
	// its own Year-interval aggregation via the same `yearlyAggregators`
	// default-to-'sum' mechanism as any other metric.
	function appendTotalSeries(metrics: LineChartData[]): LineChartData[] {
		return includeTotalSeries
			? [...metrics, buildTotalSeries(metrics)]
			: metrics;
	}
	function applyNormalizeAndTotal(
		metrics: LineChartData[],
		effort: LineChartData | undefined
	): LineChartData[] {
		return appendTotalSeries(
			normalize && effort ? normalizeSeriesByEffort(metrics, effort) : metrics
		);
	}
	// The accumulate path *replaces* the Normalize step rather than composing on
	// top of it: summing already-normalized per-month rates is meaningless, so
	// when Normalize is also on the raw counts and the effort figures are
	// accumulated separately and divided once per month (inside
	// `accumulateSeriesByYear`). The Total is still appended last, so it sums
	// the already-accumulated metrics into a cumulative total.
	//
	// Only ever applied to the monthly all-time path: accumulate forces the
	// Interval to `'month'`, so the year-granular branch below can't reach it.
	function applyAccumulateAndTotal(
		metrics: LineChartData[],
		effort: LineChartData | undefined
	): LineChartData[] {
		return appendTotalSeries(
			metrics.map((metric) =>
				accumulateSeriesByYear(metric, normalize && effort ? effort : undefined)
			)
		);
	}
	const plottedSeries = accumulating
		? applyAccumulateAndTotal(series, effortHistory)
		: applyNormalizeAndTotal(series, effortHistory);
	// A metric's base colour: the caller's explicit override at that index if
	// supplied, else the default per-index palette. Used identically by all three
	// modes so an override recolours every view consistently.
	const baseColorFor = (metricIndex: number): string =>
		colors?.[metricIndex] ?? metricBaseColor(metricIndex);
	const allTimeColors = plottedSeries.map((_, metricIndex) =>
		baseColorFor(metricIndex)
	);
	// The Year interval is served from `fetchYearSeries` when the caller
	// supplied one and the fetch has landed — the fetched series are already
	// year-granular, so they only need Normalize + Total applied (against the
	// monthly effort series collapsed to yearly totals: summing effort across a
	// year is exact, effort being additive, unlike the bird-distinct counts
	// this fetch exists to fix). Otherwise — no fetcher, or the fetch rejected
	// — the Year view falls back to aggregating the monthly points client-side,
	// layered on top of the (possibly effort-normalized, possibly
	// total-appended) series, matching the order-of-operations the normalize
	// toggle establishes.
	//
	// Note the fetched series carry `core_stats`' dense spine verbatim, so
	// a year with no encounters plots an explicit `0` here rather than the gap
	// the client-side path's `hasReportableValue` convention produces. That
	// matches what the all-time *month* view already does with its own zero
	// months, so the two intervals stay consistent with each other.
	const yearSeriesPending =
		Boolean(fetchYearSeries) && !fetchedYearSeries && !yearSeriesFailed;
	const allTimeSeries =
		interval === 'year'
			? fetchedYearSeries
				? applyNormalizeAndTotal(
						fetchedYearSeries,
						effortHistory
							? aggregateSeriesByYear(effortHistory, 'sum')
							: undefined
					)
				: plottedSeries.map((metric) =>
						aggregateSeriesByYear(
							metric,
							yearlyAggregators?.[metric.name] ?? 'sum'
						)
					)
			: plottedSeries;
	// While accumulating the Interval is forced to Month (a within-year running
	// sum only makes sense per month), so the Interval toggle is hidden.
	const showIntervalToggle =
		mode === 'all-time' && spansMultipleYears(series) && !accumulate;
	const showAccumulateToggle = !!allowYearAccumulation && mode === 'all-time';
	// Same `mode` gate as `accumulating`: the state survives a trip through
	// another mode, but can never reach a per-metric sub-chart even for a single
	// render.
	const showPercentStackedToggle = !!percentStackable && mode === 'all-time';
	const percentStacking = showPercentStackedToggle && percentStacked;
	// A `Total` series is the whole, not one of its parts — stacking it
	// alongside the series it sums would take the stack to 200% and flatten
	// every real band into half its true share. So the percent view drops it
	// (`appendTotalSeries` always appends it last) and re-derives each period's
	// denominator from the parts alone, which is the same number anyway.
	const displayedAllTimeSeries = percentStacking
		? toPercentStackedSeries(
				includeTotalSeries ? allTimeSeries.slice(0, -1) : allTimeSeries
			)
		: allTimeSeries;
	// `accumulating`/`percentStacking` swap the rendered component (not just the
	// `library` config) between chartkick's LineChart and AreaChart — see
	// STACKED_AREA_CHART_LIBRARY's comment for why a `library` option alone
	// can't produce a filled dataset here.
	const stackedArea = accumulating || percentStacking;
	const AllTimeChart = stackedArea ? AreaChart : LineChart;
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
									onChange={() => {
										setMode(option.value);
										// Accumulate only exists in all-time mode; drop it on the
										// way out so it never persists "on but hidden and inert".
										if (option.value !== 'all-time') setAccumulate(false);
									}}
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
										onChange={() => {
											setInterval(option.value);
											if (option.value === 'year') loadYearSeries();
										}}
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
							{YES_NO_OPTIONS.map((option) => (
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
				{showAccumulateToggle ? (
					<div className="flex items-center gap-1">
						<span className="text-sm">Accumulate</span>
						<div className="border-base-content/20 flex gap-0.5 rounded-field border p-0.5">
							{YES_NO_OPTIONS.map((option) => (
								<label
									key={String(option.value)}
									htmlFor={`${toggleName}-accumulate-${option.value}`}
									className="btn btn-sm btn-text has-checked:btn-active"
								>
									<span>{option.label}</span>
									<input
										id={`${toggleName}-accumulate-${option.value}`}
										name={`${toggleName}-accumulate`}
										type="radio"
										className="hidden"
										checked={accumulate === option.value}
										onChange={() => {
											setAccumulate(option.value);
											// A within-year running sum is a per-month view, so
											// turning it on drops any existing Year selection back
											// to Month (the Interval toggle itself then hides).
											if (option.value) setInterval('month');
										}}
									/>
								</label>
							))}
						</div>
					</div>
				) : null}
				{showPercentStackedToggle ? (
					<div className="flex items-center gap-1">
						<span className="text-sm">% stacked</span>
						<div className="border-base-content/20 flex gap-0.5 rounded-field border p-0.5">
							{YES_NO_OPTIONS.map((option) => (
								<label
									key={String(option.value)}
									htmlFor={`${toggleName}-percent-stacked-${option.value}`}
									className="btn btn-sm btn-text has-checked:btn-active"
								>
									<span>{option.label}</span>
									<input
										id={`${toggleName}-percent-stacked-${option.value}`}
										name={`${toggleName}-percent-stacked`}
										type="radio"
										className="hidden"
										checked={percentStacked === option.value}
										onChange={() => setPercentStacked(option.value)}
									/>
								</label>
							))}
						</div>
					</div>
				) : null}
			</div>
			<div>
				{mode === 'all-time' &&
					(interval === 'year' && yearSeriesPending ? (
						// Deliberately a spinner rather than the client-side-summed
						// series: showing the month-summed numbers while the correct
						// year-grouped ones are in flight would flash known-wrong
						// (double-counted) values at the reader.
						<div className="flex h-full items-center justify-center">
							<div className="loading loading-spinner loading-xl"></div>
						</div>
					) : (
						<AllTimeChart
							// The percent view's axis is a fixed 0–100% scale with a `%`
							// suffix on every tick, so the bands read as proportions
							// regardless of the underlying counts' magnitude.
							min={percentStacking ? 0 : min}
							max={percentStacking ? 100 : undefined}
							suffix={percentStacking ? '%' : undefined}
							data={displayedAllTimeSeries}
							colors={allTimeColors}
							xtitle={xtitle}
							ytitle={percentStacking ? '% of total' : effectiveYtitle}
							library={
								stackedArea ? STACKED_AREA_CHART_LIBRARY : TREND_CHART_LIBRARY
							}
						/>
					))}
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
