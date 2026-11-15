import { Fragment } from 'react';
import { Table } from '@/modules/ui-kit';
import type { StatsCacheResult } from '@/modules/stats/browser';
import {
	buildPivotGrid,
	formatMetricValue,
	METRIC_COLOURS,
	type MetricSelection
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

/**
 * Year × month pivot of the selected metrics: each cell shows one badge per
 * selected metric, in colour order, separated by `/`.
 */
export function StatsPivotTable({
	rows,
	selection
}: {
	rows: StatsCacheResult[];
	selection: MetricSelection;
}) {
	const metricsInColourOrder = [...selection].sort(
		(oneMetric, otherMetric) => oneMetric.colourIndex - otherMetric.colourIndex
	);
	return (
		<Table testId="stats-pivot-table">
			<thead>
				<tr>
					<th>Year</th>
					{MONTH_LABELS.map((monthLabel) => (
						<th key={monthLabel}>{monthLabel}</th>
					))}
				</tr>
			</thead>
			<tbody>
				{buildPivotGrid(rows).map(({ year, months }) => (
					<tr key={year}>
						<td>{year}</td>
						{months.map((monthRow, monthIndex) => (
							<td key={monthIndex} className="whitespace-nowrap">
								{monthRow &&
									metricsInColourOrder.map(
										({ column, colourIndex }, position) => (
											<Fragment key={column}>
												{position > 0 && ' / '}
												<span
													data-testid={`pivot-badge-${column}`}
													className={`badge border-transparent text-base-content ${METRIC_COLOURS[colourIndex]}`}
												>
													{formatMetricValue(monthRow[column])}
												</span>
											</Fragment>
										)
									)}
							</td>
						))}
					</tr>
				))}
			</tbody>
		</Table>
	);
}
