import { describe, it, expect } from 'vitest';
import type {
	CoreStatsResult,
	CoreStatsWithBiometrics,
	DemographicsStatsResult,
	ArrivalsStatsResult
} from '@/app/models/db';
import {
	getCounts,
	getReturningVsNew,
	getAgeSplit,
	getYoungCounts,
	getNewYoungCounts,
	getArrivals,
	getSizes
} from '../StatsHistoryChart';
import robinDemographicsHistory from '@/test-fixtures/snapshots/demographics_stats/robin-alpha.monthly-history.json';

// Minimal fixture builders — only the columns each mapper reads matter; the rest
// are filled with 0 so a full composite-type row satisfies the (null-stripped)
// result types without inventing meaningless values inline per test.
function aggregateRow(overrides: Partial<CoreStatsResult>): CoreStatsResult {
	return {
		time_period: '2024-01-01',
		bird_count: 0,
		encounter_count: 0
	} as CoreStatsResult & typeof overrides;
}

// The demographics builder's *column set* comes from a real captured
// demographics_stats row (Robin/Alpha, species-filtered and month-grouped —
// the exact call getSpeciesDemographicsStats makes) rather than a
// hand-maintained literal, so a column added or removed at the RPC shows up
// here instead of silently drifting (#883). Every count is zeroed so each test
// still only sees the columns it explicitly sets.
// This fixture is species-filtered rather than species-grouped, so
// species_name is genuinely null — DemographicsStatsResult's NonNullable
// mapped type (app/models/db.ts) assumes every column is always present, so
// a direct assertion doesn't compile (#895).
const [capturedDemographicsRow] =
	// eslint-disable-next-line no-restricted-syntax -- see comment above
	robinDemographicsHistory as unknown as DemographicsStatsResult[];
const zeroedDemographicsRow = Object.fromEntries(
	Object.entries(capturedDemographicsRow).map(([column, value]) => [
		column,
		typeof value === 'number' ? 0 : value
	])
) as DemographicsStatsResult;

function demographicsRow(
	overrides: Partial<DemographicsStatsResult>
): DemographicsStatsResult {
	return {
		...zeroedDemographicsRow,
		species_name: 'Robin',
		time_period: '2024-01-01',
		...overrides
	} as DemographicsStatsResult;
}

describe('getCounts', () => {
	describe('Structure: birds + encounters series', () => {
		it('maps encounter_count and bird_count against time_period', () => {
			const result = getCounts([
				{ ...aggregateRow({}), encounter_count: 12, bird_count: 9 }
			] as CoreStatsResult[]);
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
			] as CoreStatsResult[];
			const demographicsStats = [
				demographicsRow({
					time_period: '2024-01-01',
					adult_bird_count: 10,
					new_adult_bird_count: 4
				}),
				demographicsRow({
					time_period: '2024-02-01',
					adult_bird_count: 8,
					new_adult_bird_count: 3
				})
			];
			const result = getReturningVsNew(statsHistory, demographicsStats);
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
			const demographicsStats = [
				demographicsRow({
					time_period: '2024-01-01',
					adult_bird_count: 20,
					new_adult_bird_count: 7
				})
			];
			const result = getReturningVsNew([], demographicsStats);
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
			] as CoreStatsResult[];
			const demographicsStats = [
				demographicsRow({ time_period: '2024-01-01' })
			];
			const result = getReturningVsNew(statsHistory, demographicsStats);
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
			] as CoreStatsResult[];
			const demographicsStats = [
				demographicsRow({
					time_period: '2024-01-01',
					adult_bird_count: 5,
					new_adult_bird_count: 2
				}),
				demographicsRow({
					time_period: '2024-02-01',
					adult_bird_count: 6,
					new_adult_bird_count: 1
				})
			];
			const result = getReturningVsNew(statsHistory, demographicsStats);
			// demographicsStats' order drives the output order (2024-01-01, then
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
				demographicsRow({
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
				demographicsRow({
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
				demographicsRow({ time_period: '2024-01-01' })
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

// No captured arrivals_stats fixture exists yet (unlike demographicsRow
// above) — mirrors aggregateRow's plain-literal approach: only the columns
// this mapper reads matter, so a minimal literal is enough.
function arrivalsRow(
	overrides: Partial<ArrivalsStatsResult>
): ArrivalsStatsResult {
	return {
		species_name: 'Robin',
		time_period: '2024-01-01',
		new_adult_bird_count: 0,
		returning_adult_bird_count: 0,
		pullus_bird_count: 0,
		juv_bird_count: 0,
		postjuv_bird_count: 0,
		...overrides
	} as ArrivalsStatsResult;
}

describe('getArrivals', () => {
	describe('Usual: maps each arrival bucket column to its own series', () => {
		it('maps New adults/Returning adults/Pullus/Juv/Postjuv from their columns', () => {
			const rows = [
				arrivalsRow({
					time_period: '2024-01-01',
					new_adult_bird_count: 5,
					returning_adult_bird_count: 8,
					pullus_bird_count: 2,
					juv_bird_count: 3,
					postjuv_bird_count: 1
				})
			];
			const result = getArrivals(rows);
			expect(result.map((series) => series.name)).toEqual([
				'New adults',
				'Returning adults',
				'Pullus',
				'Juv',
				'Postjuv'
			]);
			expect(result[0].data).toEqual([['2024-01-01', 5]]);
			expect(result[1].data).toEqual([['2024-01-01', 8]]);
			expect(result[2].data).toEqual([['2024-01-01', 2]]);
			expect(result[3].data).toEqual([['2024-01-01', 3]]);
			expect(result[4].data).toEqual([['2024-01-01', 1]]);
		});
	});

	describe('Edge: empty input', () => {
		it('returns an empty series for empty input', () => {
			const result = getArrivals([]);
			expect(result.map((series) => series.name)).toEqual([
				'New adults',
				'Returning adults',
				'Pullus',
				'Juv',
				'Postjuv'
			]);
			expect(result.every((series) => series.data.length === 0)).toBe(true);
		});
	});
});

describe('getSizes', () => {
	// #821 merges biometrics_stats' wing/weight fields onto each core_stats
	// row before getSizes ever sees it — the merged CoreStatsWithBiometrics
	// shape (#827) is what getSizes reads its wing/weight columns from now that
	// core_stats itself no longer carries them. This checks getSizes maps
	// those merged columns onto the expected six series.
	describe('Structure: six size series from the max/median/min weight and wing columns', () => {
		it('maps max/median/min weight and wing against time_period', () => {
			const rows = [
				{
					...aggregateRow({}),
					time_period: '2024-01-01',
					max_weight: 21,
					median_weight: 18,
					min_weight: 16.5,
					max_wing: 80,
					median_wing: 74,
					min_wing: 72
				}
			] as CoreStatsWithBiometrics[];

			const result = getSizes(rows);

			expect(result.map((series) => series.name)).toEqual([
				'max weight',
				'median weight',
				'min weight',
				'max wing',
				'median wing',
				'min wing'
			]);
			expect(result[0].data).toEqual([['2024-01-01', 21]]);
			expect(result[1].data).toEqual([['2024-01-01', 18]]);
			expect(result[2].data).toEqual([['2024-01-01', 16.5]]);
			expect(result[3].data).toEqual([['2024-01-01', 80]]);
			expect(result[4].data).toEqual([['2024-01-01', 74]]);
			expect(result[5].data).toEqual([['2024-01-01', 72]]);
		});
	});

	describe('Edge: empty history', () => {
		it('returns all six series with empty data arrays', () => {
			const result = getSizes([]);
			expect(result).toHaveLength(6);
			expect(result.every((series) => series.data.length === 0)).toBe(true);
		});
	});
});

describe('getNewYoungCounts', () => {
	describe('Structure: two series from New juv/New postjuv columns', () => {
		it('maps new_postjuv_juv_enc_count and new_postjuv_enc_count against time_period as New juv and New postjuv', () => {
			const rows = [
				demographicsRow({
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
				demographicsRow({ time_period: '2024-01-01' })
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
