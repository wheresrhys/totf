import { LineChart, type LineChartData } from 'react-chartkick';
import type { AggregateStatsRow } from '@/app/models/db';

function getCounts(statsHistory: AggregateStatsRow[]): LineChartData[] {
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

function getSizes(statsHistory: AggregateStatsRow[]): LineChartData[] {
	return [
		{
			name: 'max weight',
			data: statsHistory.map((row) => [row.time_period, row.max_weight])
		},
		{
			name: 'median weight',
			data: statsHistory.map((row) => [row.time_period, row.median_weight])
		},
		{
			name: 'min weight',
			data: statsHistory.map((row) => [row.time_period, row.min_weight])
		},

		{
			name: 'max wing',
			data: statsHistory.map((row) => [row.time_period, row.max_wing])
		},
		{
			name: 'median wing',
			data: statsHistory.map((row) => [row.time_period, row.median_wing])
		},
		{
			name: 'min wing',
			data: statsHistory.map((row) => [row.time_period, row.min_wing])
		}
	];
}

export function StatsHistoryChart({
	statsHistory
}: {
	statsHistory: AggregateStatsRow[];
}) {
	return (
		<>
			<LineChart
				min={0}
				data={getCounts(statsHistory)}
				xtitle="Year"
				ytitle="Value"
				library={{
					elements: {
						point: { radius: 1 },
						line: { cubicInterpolationMode: 'monotone' }
					}
				}}
			/>
			<LineChart
				min={0}
				data={getSizes(statsHistory)}
				xtitle="Year"
				ytitle="Value"
				library={{
					elements: {
						point: { radius: 1 },
						line: { cubicInterpolationMode: 'monotone' }
					}
				}}
			/>
		</>
	);
}
