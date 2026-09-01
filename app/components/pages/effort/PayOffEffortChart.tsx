'use client';

import { LineChart } from 'react-chartkick';
import 'chartkick/chart.js';
import { format } from 'date-fns';
import type { AggregateStatsResult } from '@/app/models/db';
import {
	postgresIntervalToHours,
	postgresIntervalToMinutes
} from '@/lib/postgres-interval';

type SeriesPoint = [string, number];

export function PayOffEffortChart({
	monthly
}: {
	monthly: AggregateStatsResult[];
}) {
	const sorted = [...monthly].sort(
		(a, b) =>
			new Date(a.time_period).getTime() - new Date(b.time_period).getTime()
	);

	const data = [
		{
			name: 'Total effort (h)',
			data: sorted.map(
				(row): SeriesPoint => [
					format(new Date(row.time_period), 'MMM yyyy'),
					postgresIntervalToHours(row.total_effort)
				]
			),
			dataset: { yAxisID: 'y' }
		},
		{
			name: 'Effort per encounter (min)',
			data: sorted.map(
				(row): SeriesPoint => [
					format(new Date(row.time_period), 'MMM yyyy'),
					postgresIntervalToMinutes(row.effort_per_encounter)
				]
			),
			dataset: { yAxisID: 'y1' }
		}
	];

	return (
		<LineChart
			min={0}
			data={data}
			xtitle="Month"
			ytitle=""
			library={{
				scales: {
					y: {
						type: 'linear',
						position: 'left',
						title: { display: true, text: 'Total effort (h)' },
						grid: { drawOnChartArea: true }
					},
					y1: {
						type: 'linear',
						position: 'right',
						title: { display: true, text: 'Effort per encounter (min)' },
						max: 40,
						grid: { drawOnChartArea: false }
					}
				},
				elements: {
					point: { radius: 1 },
					line: { cubicInterpolationMode: 'monotone' }
				}
			}}
		/>
	);
}
