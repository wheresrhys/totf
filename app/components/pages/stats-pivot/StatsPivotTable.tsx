import { Fragment } from 'react';
import { Table } from '@/modules/ui-kit';
import type { StatsResult } from '@/modules/stats/browser';
import {
	buildPivotGrid,
	formatMetricValue,
	METRIC_COLOURS,
	type MetricSelection,
	type PivotSourceRows
} from '@/app/lib/stats-pivot';

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

function PivotCell({
	row,
	metricsInColourOrder,
	isTotal = false
}: {
	row: StatsResult | undefined;
	metricsInColourOrder: MetricSelection;
	isTotal?: boolean;
}) {
	return (
		<td className={`whitespace-nowrap ${isTotal ? 'font-semibold' : ''}`}>
			{row &&
				metricsInColourOrder.map(({ column, colourIndex }, position) => (
					<Fragment key={column}>
						{position > 0 && ' / '}
						<span
							data-testid={`pivot-badge-${column}`}
							className={`badge border-transparent text-base-content ${METRIC_COLOURS[colourIndex]}`}
						>
							{formatMetricValue(row[column])}
						</span>
					</Fragment>
				))}
		</td>
	);
}

/**
 * Year × month pivot of the selected metrics: each cell shows one badge per
 * selected metric, in colour order, separated by `/`. The Total column and
 * row are the year and month-squashed cache cells, not sums of the grid.
 */
export function StatsPivotTable({
	sourceRows,
	selection
}: {
	sourceRows: PivotSourceRows;
	selection: MetricSelection;
}) {
	const metricsInColourOrder = [...selection].sort(
		(oneMetric, otherMetric) => oneMetric.colourIndex - otherMetric.colourIndex
	);
	const { years, monthTotals, grandTotal } = buildPivotGrid(sourceRows);
	return (
		<Table testId="stats-pivot-table" className="table table-xs">
			<thead>
				<tr>
					<th>Year</th>
					{MONTH_LABELS.map((monthLabel) => (
						<th key={monthLabel}>{monthLabel}</th>
					))}
					<th>Total</th>
				</tr>
			</thead>
			<tbody>
				{years.map(({ year, months, total }) => (
					<tr key={year}>
						<td>{year}</td>
						{months.map((monthRow, monthIndex) => (
							<PivotCell
								key={monthIndex}
								row={monthRow}
								metricsInColourOrder={metricsInColourOrder}
							/>
						))}
						<PivotCell
							row={total}
							metricsInColourOrder={metricsInColourOrder}
							isTotal
						/>
					</tr>
				))}
				<tr data-testid="pivot-totals-row" className="font-semibold">
					<td>Total</td>
					{monthTotals.map((monthTotalRow, monthIndex) => (
						<PivotCell
							key={monthIndex}
							row={monthTotalRow}
							metricsInColourOrder={metricsInColourOrder}
							isTotal
						/>
					))}
					<PivotCell
						row={grandTotal}
						metricsInColourOrder={metricsInColourOrder}
						isTotal
					/>
				</tr>
			</tbody>
		</Table>
	);
}
