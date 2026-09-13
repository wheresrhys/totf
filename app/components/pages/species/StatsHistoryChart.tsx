'use client';
import { type LineChartData } from 'react-chartkick';
import type {
	CoreStatsResult,
	CoreStatsWithBiometrics,
	PopulationStatsResult
} from '@/app/models/db';

export function getCounts(statsHistory: CoreStatsResult[]): LineChartData[] {
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

// Returning vs new — #854, one of two replacements for the "Age split" tile
// (the other is #843's "Returning ages"): a simpler top-level new/returning/
// young split than Age split's four-way New adults/First summer/Oldies/New
// young breakdown. "Returning adults" merges what Age split shows as two
// separate series (First summer + Oldies) into one, computed client-side
// (`adult_bird_count - new_adult_bird_count`) since no RPC column holds that
// sum directly. "Young" sums three `aggregate_stats` bucket columns
// (pullus/juv/postjuv) rather than reusing `population_stats`' own
// `juv_bird_count`, since the ticket's three columns are guaranteed
// consistent with `population_stats` (same `stats_bird_age_bucket` utility
// RPC) while matching this tile's "Young" label more precisely (includes
// pullus). Joins the two RPC results by `time_period` via a `Map` — mirrors
// `normalizeSeriesByEffort`'s join-by-date pattern in
// `YearComparisonTrendChart.tsx` — rather than assuming positional parity,
// even though both RPCs share `stats_spine` and so their rows correspond 1:1
// for identical filter args. `populationStats`' row order drives the output
// order for all three series.
export function getReturningVsNew(
	statsHistory: CoreStatsResult[],
	populationStats: PopulationStatsResult[]
): LineChartData[] {
	const statsHistoryByPeriod = new Map(
		statsHistory.map((row) => [row.time_period, row])
	);
	return [
		{
			name: 'New adults',
			data: populationStats.map((row) => [
				row.time_period,
				row.new_adult_bird_count
			])
		},
		{
			name: 'Returning adults',
			data: populationStats.map((row) => [
				row.time_period,
				row.adult_bird_count - row.new_adult_bird_count
			])
		},
		{
			name: 'Young',
			data: populationStats.map((row) => {
				const statsRow = statsHistoryByPeriod.get(row.time_period);
				const young = statsRow
					? statsRow.pullus_bird_count +
						statsRow.juv_bird_count +
						statsRow.postjuv_bird_count
					: 0;
				return [row.time_period, young];
			})
		}
	];
}

// Age split — bird-level breakdown of the "Population" tab's Age split tile,
// consuming `population_stats`' age-split columns (#800/#801). "New adults" and
// "New young" are birds new to the group this year; "First summer" and "Oldies"
// are returning birds. The four counts partition the adults + new-young cohorts;
// `new_young_bird_count` used to be duplicated on `aggregate_stats` too, but #824
// removed that unused copy — `population_stats` now holds the only one.
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

// Young counts / New young counts — encounter-level 3J/postjuv breakdown of the
// "Population" tab's Young counts and New young counts tiles, consuming
// `population_stats`' young-trends columns (#800/#801). Originally a single
// "Young trends" tile with six series including two client-side sums (Young,
// New young); #839 split it into two tiles — raw counts and first-encounter
// ("new") counts — dropping the summed series entirely since nothing combines
// juv+postjuv any more.
//
// "Juv" is all 3J encounters (`postjuv_juv_enc_count`); "Postjuv" the
// age-3-non-juv count (`postjuv_enc_count`).
export function getYoungCounts(
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
			name: 'Postjuv',
			data: populationStats.map((row) => [
				row.time_period,
				row.postjuv_enc_count
			])
		}
	];
}

// "New juv"/"New postjuv" are the same two columns' N-record (first-encounter)
// slices.
export function getNewYoungCounts(
	populationStats: PopulationStatsResult[]
): LineChartData[] {
	return [
		{
			name: 'New juv',
			data: populationStats.map((row) => [
				row.time_period,
				row.new_postjuv_juv_enc_count
			])
		},
		{
			name: 'New postjuv',
			data: populationStats.map((row) => [
				row.time_period,
				row.new_postjuv_enc_count
			])
		}
	];
}

export function getSizes(
	statsHistory: CoreStatsWithBiometrics[]
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
