'use client';
import {
	METRIC_COLOURS,
	PIVOT_METRICS,
	type MetricSelection,
	type PivotMetricColumn
} from '@/app/lib/stats-pivot';

/**
 * A toggle button per stats-cache metric. A selected button carries its
 * metric's assigned colour; once every colour is in use the unselected
 * buttons are disabled. Stateless — the caller owns the selection.
 */
export function MetricSelector({
	selection,
	onToggle
}: {
	selection: MetricSelection;
	onToggle: (column: PivotMetricColumn) => void;
}) {
	const isFull = selection.length >= METRIC_COLOURS.length;
	return (
		<ul data-testid="metric-selector" className="my-3 flex flex-wrap gap-2">
			{PIVOT_METRICS.map(({ column, label }) => {
				const selectedMetric = selection.find(
					(selected) => selected.column === column
				);
				return (
					<li key={column}>
						<button
							type="button"
							aria-pressed={Boolean(selectedMetric)}
							disabled={!selectedMetric && isFull}
							className={`btn btn-sm rounded-full ${
								selectedMetric
									? `border-transparent text-base-content ${METRIC_COLOURS[selectedMetric.colourIndex]}`
									: 'btn-soft btn-secondary'
							}`}
							onClick={() => onToggle(column)}
						>
							{label}
						</button>
					</li>
				);
			})}
		</ul>
	);
}
