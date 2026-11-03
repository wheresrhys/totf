// Static chartkick/Chart.js `library` configs and the toggle option lists
// `YearComparisonTrendChart` renders its mode/interval/yes-no switchers from.
import { isHiddenFromLegend } from '@/app/components/charts/chart-color-utils';

// Shared chartkick config for every trend line — small points, smoothed lines.
// Used by both the all-time chart and each per-year chart so a single toggle can
// swap between them without the lines changing appearance.
export const TREND_CHART_LIBRARY = {
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

// Layered on top of `TREND_CHART_LIBRARY` (not replacing it) for the accumulate
// view: `scales.y.stacked: true` stacks each dataset's filled area so the
// metrics read as a stacked area chart rather than overlapping lines.
//
// The fill itself does NOT come from a `library` option — a `library.elements.
// line.fill` default has no effect here. Chartkick's `createDataTable` always
// sets an explicit `fill` (and matching `backgroundColor`) on every dataset it
// builds, keyed off which chart *type* it's building for ("area" -> filled with
// a translucent version of the series colour; "line" -> not filled), and a
// per-dataset Chart.js option always overrides the same option's `elements`
// default. So the only way to get a filled dataset out of chartkick is to
// render via its `AreaChart` component rather than `LineChart` — see the
// `accumulating` branch in `YearComparisonTrendChart.tsx`, which switches
// components instead of trying to force `fill` on through `library`.
export const STACKED_AREA_CHART_LIBRARY = {
	...TREND_CHART_LIBRARY,
	scales: { y: { stacked: true } }
};

export type ChartMode = 'all-time' | 'compare-years' | 'this-year';

export const MODE_OPTIONS: { value: ChartMode; label: string }[] = [
	{ value: 'all-time', label: 'All time' },
	{ value: 'compare-years', label: 'Compare years' },
	{ value: 'this-year', label: 'This year' }
];

// Shared Yes/No option list for the boolean toggles (Normalize, Accumulate).
export const YES_NO_OPTIONS: { value: boolean; label: string }[] = [
	{ value: false, label: 'No' },
	{ value: true, label: 'Yes' }
];

// Granularity of the "All time" view: 'month' is the conventional per-month
// trend line; 'year' collapses each metric to one point per calendar year via
// `aggregateSeriesByYear`. Only ever shown in the all-time view.
export type Interval = 'year' | 'month';

export const INTERVAL_OPTIONS: { value: Interval; label: string }[] = [
	{ value: 'year', label: 'Year' },
	{ value: 'month', label: 'Month' }
];
