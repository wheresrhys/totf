import { LineChart, type LineChartData } from 'react-chartkick';
import type { AggregateStatsRow } from '@/app/models/db';

function getChartData(statsHistory: AggregateStatsRow[]): LineChartData[] {
	return [
		{
			name: 'encounters',
			data: statsHistory.map((row) => [row.time_period, row.encounter_count])
		},
		{
			name: 'birds',
			data: statsHistory.map((row) => [row.time_period, row.bird_count])
		},
		{
			name: 'juvs',
			data: statsHistory.map((row) => [row.time_period, row.juv_count])
		},
		{
			name: 'sessions',
			data: statsHistory.map((row) => [row.time_period, row.session_count])
		}
	];
}

export function StatsHistoryChart({
	statsHistory
}: {
	statsHistory: AggregateStatsRow[];
}) {
	const chartData = getChartData(statsHistory);
	return (
		<LineChart
			min={0}
			data={chartData}
			xtitle="Year"
			ytitle="Value"
			library={{
				elements: {
					point: { radius: 1 },
					line: { cubicInterpolationMode: 'monotone' }
				}
			}}
		/>
	);
}
