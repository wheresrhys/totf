import { describe, it, expect } from 'vitest';
import type {
	AggregateStatsResult,
	PopulationStatsResult
} from '@/app/models/db';
import {
	getCounts,
	getReturningVsNew,
	getAgeSplit,
	getYoungCounts,
	getNewYoungCounts
} from '../StatsHistoryChart';

// Minimal fixture builders — only the columns each mapper reads matter; the rest
// are filled with 0 so a full composite-type row satisfies the (null-stripped)
// result types without inventing meaningless values inline per test.
function aggregateRow(
	overrides: Partial<AggregateStatsResult>
): AggregateStatsResult {
	return {
		time_period: '2024-01-01',
		bird_count: 0,
		encounter_count: 0
	} as unknown as AggregateStatsResult & typeof overrides;
}

function populationRow(
	overrides: Partial<PopulationStatsResult>
): PopulationStatsResult {
	return {
		species_name: 'Robin',
		time_period: '2024-01-01',
		adult_bird_count: 0,
		juv_bird_count: 0,
		juv_enc_count: 0,
		postjuv_enc_count: 0,
		new_young_bird_count: 0,
		new_adult_bird_count: 0,
		first_summer_bird_count: 0,
		postjuv_juv_enc_count: 0,
		new_postjuv_juv_enc_count: 0,
		new_postjuv_enc_count: 0,
		old_timers_bird_count: 0,
		...overrides
	} as PopulationStatsResult;
}

describe('getCounts', () => {
	describe('Structure: birds + encounters series', () => {
		it('maps encounter_count and bird_count against time_period', () => {
			const result = getCounts([
				{ ...aggregateRow({}), encounter_count: 12, bird_count: 9 }
			] as AggregateStatsResult[]);
			expect(result.map((series) => series.name)).toEqual([
				'encounters',
				'birds'
			]);
			expect(result[0].data).toEqual([['2024-01-01', 12]]);
			expect(result[1].data).toEqual([['2024-01-01', 9]]);
		});
	});

	describe('Edge: empty history', () => {
		it('returns both series with empty data arrays', () => {
			const result = getCounts([]);
			expect(result.map((series) => series.name)).toEqual([
				'encounters',
				'birds'
			]);
			expect(result.every((series) => series.data.length === 0)).toBe(true);
		});
	});
});

describe('getReturningVsNew', () => {
	describe('Usual: joined series', () => {
		it('computes New adults, Returning adults and Young series joined by time_period', () => {
			const statsHistory = [
				{
					...aggregateRow({}),
					time_period: '2024-01-01',
					pullus_bird_count: 1,
					juv_bird_count: 2,
					postjuv_bird_count: 3
				},
				{
					...aggregateRow({}),
					time_period: '2024-02-01',
					pullus_bird_count: 4,
					juv_bird_count: 0,
					postjuv_bird_count: 1
				}
			] as AggregateStatsResult[];
			const populationStats = [
				populationRow({
					time_period: '2024-01-01',
					adult_bird_count: 10,
					new_adult_bird_count: 4
				}),
				populationRow({
					time_period: '2024-02-01',
					adult_bird_count: 8,
					new_adult_bird_count: 3
				})
			];
			const result = getReturningVsNew(statsHistory, populationStats);
			expect(result.map((series) => series.name)).toEqual([
				'New adults',
				'Returning adults',
				'Young'
			]);
			expect(result[0].data).toEqual([
				['2024-01-01', 4],
				['2024-02-01', 3]
			]);
			expect(result[1].data).toEqual([
				['2024-01-01', 6],
				['2024-02-01', 5]
			]);
			expect(result[2].data).toEqual([
				['2024-01-01', 6],
				['2024-02-01', 5]
			]);
		});
	});

	describe('Structure: Returning adults derivation', () => {
		it('computes Returning adults as adult_bird_count minus new_adult_bird_count', () => {
			const populationStats = [
				populationRow({
					time_period: '2024-01-01',
					adult_bird_count: 20,
					new_adult_bird_count: 7
				})
			];
			const result = getReturningVsNew([], populationStats);
			expect(result[1].data).toEqual([['2024-01-01', 13]]);
		});
	});

	describe('Structure: Young derivation', () => {
		it('computes Young as the sum of pullus_bird_count, juv_bird_count and postjuv_bird_count', () => {
			const statsHistory = [
				{
					...aggregateRow({}),
					time_period: '2024-01-01',
					pullus_bird_count: 2,
					juv_bird_count: 5,
					postjuv_bird_count: 3
				}
			] as AggregateStatsResult[];
			const populationStats = [populationRow({ time_period: '2024-01-01' })];
			const result = getReturningVsNew(statsHistory, populationStats);
			expect(result[2].data).toEqual([['2024-01-01', 10]]);
		});
	});

	describe('Edge: empty input', () => {
		it('returns an empty series for empty input', () => {
			const result = getReturningVsNew([], []);
			expect(result.map((series) => series.name)).toEqual([
				'New adults',
				'Returning adults',
				'Young'
			]);
			expect(result.every((series) => series.data.length === 0)).toBe(true);
		});
	});

	describe('Edge: join by time_period, not array index', () => {
		it("joins by time_period rather than array index when the two inputs' rows are in different orders", () => {
			const statsHistory = [
				{
					...aggregateRow({}),
					time_period: '2024-02-01',
					pullus_bird_count: 9,
					juv_bird_count: 0,
					postjuv_bird_count: 0
				},
				{
					...aggregateRow({}),
					time_period: '2024-01-01',
					pullus_bird_count: 1,
					juv_bird_count: 1,
					postjuv_bird_count: 1
				}
			] as AggregateStatsResult[];
			const populationStats = [
				populationRow({
					time_period: '2024-01-01',
					adult_bird_count: 5,
					new_adult_bird_count: 2
				}),
				populationRow({
					time_period: '2024-02-01',
					adult_bird_count: 6,
					new_adult_bird_count: 1
				})
			];
			const result = getReturningVsNew(statsHistory, populationStats);
			// populationStats' order drives the output order (2024-01-01, then
			// 2024-02-01) even though statsHistory lists them in the reverse order —
			// the Young value for each date is picked up correctly via the
			// time_period join rather than by matching array index.
			expect(result[2].data).toEqual([
				['2024-01-01', 3],
				['2024-02-01', 9]
			]);
		});
	});
});

describe('getAgeSplit', () => {
	describe('Structure: four age-split series from the right columns', () => {
		it('maps New adults / First summer / Oldies / New young from their columns', () => {
			const rows = [
				populationRow({
					time_period: '2024-01-01',
					new_adult_bird_count: 5,
					first_summer_bird_count: 3,
					old_timers_bird_count: 7,
					new_young_bird_count: 2
				})
			];
			const result = getAgeSplit(rows);
			expect(result.map((series) => series.name)).toEqual([
				'New adults',
				'First summer',
				'Oldies',
				'New young'
			]);
			expect(result[0].data).toEqual([['2024-01-01', 5]]);
			expect(result[1].data).toEqual([['2024-01-01', 3]]);
			expect(result[2].data).toEqual([['2024-01-01', 7]]);
			expect(result[3].data).toEqual([['2024-01-01', 2]]);
		});
	});

	describe('Edge: empty history', () => {
		it('returns all four series with empty data arrays', () => {
			const result = getAgeSplit([]);
			expect(result).toHaveLength(4);
			expect(result.every((series) => series.data.length === 0)).toBe(true);
		});
	});
});

describe('getYoungCounts', () => {
	describe('Structure: two series from Juv/Postjuv columns', () => {
		it('maps postjuv_juv_enc_count and postjuv_enc_count against time_period as Juv and Postjuv', () => {
			const rows = [
				populationRow({
					time_period: '2024-01-01',
					postjuv_juv_enc_count: 4, // Juv
					postjuv_enc_count: 6 // Postjuv
				})
			];
			const result = getYoungCounts(rows);
			expect(result.map((series) => series.name)).toEqual(['Juv', 'Postjuv']);
			expect(result[0].data).toEqual([['2024-01-01', 4]]);
			expect(result[1].data).toEqual([['2024-01-01', 6]]);
		});
	});

	describe('Edge: all-zero period', () => {
		it('still emits a 0 row for every series', () => {
			const result = getYoungCounts([
				populationRow({ time_period: '2024-01-01' })
			]);
			for (const series of result) {
				expect(series.data).toEqual([['2024-01-01', 0]]);
			}
		});
	});

	describe('Edge: empty history', () => {
		it('returns both series with empty data arrays', () => {
			const result = getYoungCounts([]);
			expect(result).toHaveLength(2);
			expect(result.every((series) => series.data.length === 0)).toBe(true);
		});
	});
});

describe('getNewYoungCounts', () => {
	describe('Structure: two series from New juv/New postjuv columns', () => {
		it('maps new_postjuv_juv_enc_count and new_postjuv_enc_count against time_period as New juv and New postjuv', () => {
			const rows = [
				populationRow({
					time_period: '2024-01-01',
					new_postjuv_juv_enc_count: 1, // New juv
					new_postjuv_enc_count: 2 // New postjuv
				})
			];
			const result = getNewYoungCounts(rows);
			expect(result.map((series) => series.name)).toEqual([
				'New juv',
				'New postjuv'
			]);
			expect(result[0].data).toEqual([['2024-01-01', 1]]);
			expect(result[1].data).toEqual([['2024-01-01', 2]]);
		});
	});

	describe('Edge: all-zero period', () => {
		it('still emits a 0 row for every series', () => {
			const result = getNewYoungCounts([
				populationRow({ time_period: '2024-01-01' })
			]);
			for (const series of result) {
				expect(series.data).toEqual([['2024-01-01', 0]]);
			}
		});
	});

	describe('Edge: empty history', () => {
		it('returns both series with empty data arrays', () => {
			const result = getNewYoungCounts([]);
			expect(result).toHaveLength(2);
			expect(result.every((series) => series.data.length === 0)).toBe(true);
		});
	});
});
