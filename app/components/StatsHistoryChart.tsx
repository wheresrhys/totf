import { LineChart, type LineChartData } from 'react-chartkick';
import type { AggregateStatsRow } from '@/app/models/db';
import { useEffect, useState } from 'react';
import { getSpeciesStatsHistory } from '../actions/sp-data';
import { SecondaryHeading } from './shared/DesignSystem';

function getCounts(statsHistory: AggregateStatsRow[]): LineChartData[] {
	return [
		{
			name: 'encounters',
			data: statsHistory.map((row) => [row.time_period, row.encounter_count])
		},
		{
			name: 'birds',
			data: statsHistory.map((row) => [row.time_period, row.bird_count])
		}
	];
}

function getYoungsters(statsHistory: AggregateStatsRow[]): LineChartData[] {
	return [
		{
			name: '3j',
			data: statsHistory.map((row) => [row.time_period, row['3j_count']])
		},
		{
			name: '3',
			data: statsHistory.map((row) => [row.time_period, row['3_count']])
		},
		{
			name: '(3j + 3)',
			data: statsHistory.map((row) => [
				row.time_period,
				row['3j_count'] + row['3_count']
			])
		},
		{
			name: "new 3's",
			data: statsHistory.map((row) => [row.time_period, row.new_3_count])
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
	speciesName,
	viewedGroupId
}: {
	speciesName: string;
	viewedGroupId: number;
}) {
	const [statsHistory, setStatsHistory] = useState<AggregateStatsRow[]>([]);
	useEffect(() => {
		if (statsHistory.length > 0) return;
		getSpeciesStatsHistory(speciesName, viewedGroupId).then((data) => {
			setStatsHistory(data);
		});
	}, [speciesName, viewedGroupId, statsHistory.length]);
	return (
		<>
			<SecondaryHeading>Stats History</SecondaryHeading>
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
				data={getYoungsters(statsHistory)}
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
