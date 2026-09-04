'use client';
import { useId, useState } from 'react';
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

// Shared chartkick config for every trend line — small points, smoothed lines.
// Used by both the all-time chart and each per-year chart so a single toggle can
// swap between them without the lines changing appearance.
const TREND_CHART_LIBRARY = {
	elements: {
		point: { radius: 1 },
		line: { cubicInterpolationMode: 'monotone' }
	}
};

type ChartMode = 'all-time' | 'year-on-year';

const MODE_OPTIONS: { value: ChartMode; label: string }[] = [
	{ value: 'all-time', label: 'All time' },
	{ value: 'year-on-year', label: 'Year on year' }
];

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

// A metrics-over-time line chart with a toggle between two views of the same
// data:
//   - "All time": every metric plotted as one series across the full timeline
//     (the conventional trend chart).
//   - "Year on year": one small chart per metric, each holding a series per year
//     over a shared twelve-month axis, so equivalent months line up across years.
// Reusable across any set of dated metric series (`series`), so any
// metrics-plotted-over-time chart can opt into year-on-year comparison.
export function YearComparisonTrendChart({
	series,
	xtitle = 'Year',
	ytitle = 'Value',
	min = 0
}: {
	series: LineChartData[];
	xtitle?: string;
	ytitle?: string;
	min?: number | null;
}) {
	const [mode, setMode] = useState<ChartMode>('all-time');
	// Unique per instance so several of these charts on one page (e.g. multiple
	// expanded species-graph tiles) don't share a radio group.
	const toggleName = useId();
	return (
		<div className="flex h-full flex-col">
			<div className="mb-2 flex justify-end">
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
			</div>
			<div className="min-h-0 flex-1">
				{mode === 'all-time' ? (
					<LineChart
						min={min}
						data={series}
						xtitle={xtitle}
						ytitle={ytitle}
						library={TREND_CHART_LIBRARY}
					/>
				) : (
					<div className="grid h-full grid-cols-1 gap-4 overflow-auto sm:grid-cols-2">
						{series.map((metric) => (
							<div key={metric.name} className="flex h-[240px] flex-col">
								<SecondaryHeading>{metric.name}</SecondaryHeading>
								<div className="min-h-0 flex-1">
									<LineChart
										min={min}
										data={toYearOnYearSeries(metric)}
										xtitle="Month"
										ytitle={ytitle}
										library={TREND_CHART_LIBRARY}
									/>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
