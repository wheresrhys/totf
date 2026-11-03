'use client';
import { type LineChartData } from 'react-chartkick';
import type {
	CoreStatsResult,
	CoreStatsWithBiometrics,
	DemographicsStatsResult,
	ArrivalsStatsResult
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
// sum directly. "Young" sums three `core_stats` bucket columns
// (pullus/juv/postjuv) rather than reusing `demographics_stats`' own
// `juv_bird_count`, since the ticket's three columns are guaranteed
// consistent with `demographics_stats` (same `stats_bird_age_bucket` utility
// RPC) while matching this tile's "Young" label more precisely (includes
// pullus). Joins the two RPC results by `time_period` via a `Map` — mirrors
// `normalizeSeriesByEffort`'s join-by-date pattern in
// `YearComparisonTrendChart.tsx` — rather than assuming positional parity,
// even though both RPCs share `stats_spine` and so their rows correspond 1:1
// for identical filter args. `demographicsStats`' row order drives the output
// order for all three series.
export function getReturningVsNew(
	statsHistory: CoreStatsResult[],
	demographicsStats: DemographicsStatsResult[]
): LineChartData[] {
	const statsHistoryByPeriod = new Map(
		statsHistory.map((row) => [row.time_period, row])
	);
	return [
		{
			name: 'New adults',
			data: demographicsStats.map((row) => [
				row.time_period,
				row.new_adult_bird_count
			])
		},
		{
			name: 'Returning adults',
			data: demographicsStats.map((row) => [
				row.time_period,
				row.adult_bird_count - row.new_adult_bird_count
			])
		},
		{
			name: 'Young',
			data: demographicsStats.map((row) => {
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

// Returning ages — #843, one of two replacements for the removed "Age split"
// tile (alongside #854's "Returning vs new", #855 removed the tile and its
// getAgeSplit helper): a bird-level breakdown of the
// returning-adult cohort ONLY, split by how old each bird was proven to be as of
// the cell's own period_year. The four columns come straight off
// `demographics_stats` (#843), which derives them per bird in the
// `stats_bird_returning_age_bucket` utility RPC — see that function for why the
// age is recomputed per period rather than read off the live `Birds.proven_age`.
//
// "Unknown age (new)" is categorically different from the other three: it holds
// birds whose apparent proven age of 1 is an artefact of a single, imprecisely
// coded first-ever encounter rather than any actual return history. It is
// deliberately not an ordered continuation of 1 -> 2 -> 3+, which is why
// RETURNING_AGES_COLORS gives it its own hue rather than a fourth step of the
// ramp.
export function getReturningAges(
	demographicsStats: DemographicsStatsResult[]
): LineChartData[] {
	return [
		{
			name: '1 year',
			data: demographicsStats.map((row) => [
				row.time_period,
				row.returning_age_1_bird_count
			])
		},
		{
			name: '2 years',
			data: demographicsStats.map((row) => [
				row.time_period,
				row.returning_age_2_bird_count
			])
		},
		{
			name: '3+ years',
			data: demographicsStats.map((row) => [
				row.time_period,
				row.returning_age_3_plus_bird_count
			])
		},
		{
			name: 'Unknown age (new)',
			data: demographicsStats.map((row) => [
				row.time_period,
				row.returning_new_unknown_age_bird_count
			])
		}
	];
}

// Young counts / New young counts — encounter-level 3J/postjuv breakdown of the
// "Demographics" tab's Young counts and New young counts tiles, consuming
// `demographics_stats`' young-trends columns (#800/#801). Originally a single
// "Young trends" tile with six series including two client-side sums (Young,
// New young); #839 split it into two tiles — raw counts and first-encounter
// ("new") counts — dropping the summed series entirely since nothing combines
// juv+postjuv any more.
//
// "Juv" is all 3J encounters (`postjuv_juv_enc_count`); "Postjuv" the
// age-3-non-juv count (`postjuv_enc_count`).
export function getYoungCounts(
	demographicsStats: DemographicsStatsResult[]
): LineChartData[] {
	return [
		{
			name: 'Juv',
			data: demographicsStats.map((row) => [
				row.time_period,
				row.postjuv_juv_enc_count
			])
		},
		{
			name: 'Postjuv',
			data: demographicsStats.map((row) => [
				row.time_period,
				row.postjuv_enc_count
			])
		}
	];
}

// "New juv"/"New postjuv" are the same two columns' N-record (first-encounter)
// slices.
export function getNewYoungCounts(
	demographicsStats: DemographicsStatsResult[]
): LineChartData[] {
	return [
		{
			name: 'New juv',
			data: demographicsStats.map((row) => [
				row.time_period,
				row.new_postjuv_juv_enc_count
			])
		},
		{
			name: 'New postjuv',
			data: demographicsStats.map((row) => [
				row.time_period,
				row.new_postjuv_enc_count
			])
		}
	];
}

// Arrivals — the "Demographics" tab's Arrivals tile (#860), consuming
// `arrivals_stats`' five mutually-exclusive arrival-bucket columns (#858).
// Unlike Counts/Returning ages/Young counts, an "arrival" here is a bird-year (one
// bird's first classifiable encounter of a calendar year), not a per-cell
// encounter or bird-distinct count — see the RPC's own doc comment for why
// that makes simply summing this tile's monthly points across a year exact
// (no Year-interval `fetchYearSeries` correction needed, unlike its two
// siblings).
//
// The `pullus_bird_count` bucket is displayed as "Pulli" (the correct plural
// of "pullus") — display text only, the RPC column/model bucket name itself
// stays `pullus`. The series is omitted entirely, rather than plotted as a
// flat zero line, whenever nothing in the fetched range ever had a nonzero
// pullus count — mirrors the `hasPulli` convention
// `SpeciesTotalsTable`/`PeriodTotalsTable` already use to hide their own
// all-zero Pulli column (`app/components/shared/StatsTableColumnConfigs.tsx`).
export function getArrivals(
	arrivalsStats: ArrivalsStatsResult[]
): LineChartData[] {
	const hasPulli = arrivalsStats.some((row) => row.pullus_bird_count > 0);
	const pulliSeries: LineChartData = {
		name: 'Pulli',
		data: arrivalsStats.map((row) => [row.time_period, row.pullus_bird_count])
	};
	return [
		{
			name: 'New adults',
			data: arrivalsStats.map((row) => [
				row.time_period,
				row.new_adult_bird_count
			])
		},
		{
			name: 'Returning adults',
			data: arrivalsStats.map((row) => [
				row.time_period,
				row.returning_adult_bird_count
			])
		},
		...(hasPulli ? [pulliSeries] : []),
		{
			name: 'Juv',
			data: arrivalsStats.map((row) => [row.time_period, row.juv_bird_count])
		},
		{
			name: 'Postjuv',
			data: arrivalsStats.map((row) => [
				row.time_period,
				row.postjuv_bird_count
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
