'use client';
import { type LineChartData } from 'react-chartkick';
import type { AggregateStatsResult } from '@/app/models/db';

export function getCounts(
	statsHistory: AggregateStatsResult[]
): LineChartData[] {
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

export function getYoungsters(
	statsHistory: AggregateStatsResult[]
): LineChartData[] {
	return [
		{
			name: 'juv',
			data: statsHistory.map((row) => [row.time_period, row.juv_bird_count])
		},
		{
			name: 'postjuv',
			data: statsHistory.map((row) => [row.time_period, row.postjuv_bird_count])
		},
		{
			name: "New young's",
			data: statsHistory.map((row) => [
				row.time_period,
				row.new_young_bird_count
			])
		}
	];
}

export function getSizes(
	statsHistory: AggregateStatsResult[]
): LineChartData[] {
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
