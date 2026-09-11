'use client';
import { type LineChartData } from 'react-chartkick';
import type {
	AggregateStatsResult,
	PopulationStatsResult
} from '@/app/models/db';

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

// Age split — bird-level breakdown of the "Population" tab's Age split tile,
// consuming `population_stats`' age-split columns (#800/#801). "New adults" and
// "New young" are birds new to the group this year; "First summer" and "Oldies"
// are returning birds. The four counts partition the adults + new-young cohorts;
// `new_young_bird_count` is the same column `aggregate_stats` also carries (kept
// duplicated in both RPCs — see CLAUDE.md's companion-stats-RPC note).
export function getAgeSplit(
	populationStats: PopulationStatsResult[]
): LineChartData[] {
	return [
		{
			name: 'New adults',
			data: populationStats.map((row) => [
				row.time_period,
				row.new_adult_bird_count
			])
		},
		{
			name: 'First summer',
			data: populationStats.map((row) => [
				row.time_period,
				row.first_summer_bird_count
			])
		},
		{
			name: 'Oldies',
			data: populationStats.map((row) => [
				row.time_period,
				row.old_timers_bird_count
			])
		},
		{
			name: 'New young',
			data: populationStats.map((row) => [
				row.time_period,
				row.new_young_bird_count
			])
		}
	];
}

// Young trends — encounter-level 3J/postjuv breakdown of the "Population" tab's
// Young trends tile, consuming `population_stats`' young-trends columns
// (#800/#801). "Juv" is all 3J encounters (`postjuv_juv_enc_count`), "New juv"
// its N-record slice; "Postjuv"/"New postjuv" the age-3-non-juv pair. "Young"
// and "New young" have no dedicated column — they are summed client-side from
// their two component series per period (Juv+Postjuv, New juv+New postjuv). The
// counts are COALESCEd non-null by the RPC, so the sums never hit a null.
export function getYoungTrends(
	populationStats: PopulationStatsResult[]
): LineChartData[] {
	return [
		{
			name: 'Juv',
			data: populationStats.map((row) => [
				row.time_period,
				row.postjuv_juv_enc_count
			])
		},
		{
			name: 'New juv',
			data: populationStats.map((row) => [
				row.time_period,
				row.new_postjuv_juv_enc_count
			])
		},
		{
			name: 'Postjuv',
			data: populationStats.map((row) => [
				row.time_period,
				row.postjuv_enc_count
			])
		},
		{
			name: 'New postjuv',
			data: populationStats.map((row) => [
				row.time_period,
				row.new_postjuv_enc_count
			])
		},
		{
			name: 'Young',
			data: populationStats.map((row) => [
				row.time_period,
				row.postjuv_juv_enc_count + row.postjuv_enc_count
			])
		},
		{
			name: 'New young',
			data: populationStats.map((row) => [
				row.time_period,
				row.new_postjuv_juv_enc_count + row.new_postjuv_enc_count
			])
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
