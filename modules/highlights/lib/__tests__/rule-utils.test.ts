import { describe, it, expect } from 'vitest';
import type { StatsResult } from '@/modules/stats/browser';
import { getTopByPropertiesSum, getTopByProperty } from '../rule-utils';
import { DEFAULT_THRESHOLD } from '../../const';

function buildStatsRow(overrides: Partial<StatsResult> = {}): StatsResult {
	return {
		time_period: 'default-period',
		species_name: null,
		bird_count: 0,
		encounter_count: 0,
		pullus_bird_count: 0,
		juv_bird_count: 0,
		...overrides
	} as StatsResult;
}

describe('getTopByPropertiesSum', () => {
	describe('summing', () => {
		it('sums every named property per row into the highlight value', () => {
			const row = buildStatsRow({
				time_period: 'P1',
				pullus_bird_count: 3,
				juv_bird_count: 4
			});

			const result = getTopByPropertiesSum([
				'pullus_bird_count',
				'juv_bird_count'
			])([row]);

			expect(result).toEqual([
				{ timePeriod: 'P1', value: 7, species: null }
			]);
		});
	});

	describe('thresholding', () => {
		it('drops a row below both the default threshold and half the maximum value', () => {
			// max is 10, so the floor is max(DEFAULT_THRESHOLD, 5) = 5. A row at 1 is
			// below both the default threshold (2) and the floor (5).
			const highRow = buildStatsRow({ time_period: 'high', bird_count: 10 });
			const lowRow = buildStatsRow({ time_period: 'low', bird_count: 1 });

			const result = getTopByProperty('bird_count')([highRow, lowRow]);

			expect(result.map((item) => item.timePeriod)).toEqual(['high']);
		});

		it('keeps a row at exactly half the maximum value', () => {
			// max is 10, so the floor is max(DEFAULT_THRESHOLD, 5) = 5. A row at
			// exactly 5 clears that floor.
			const highRow = buildStatsRow({ time_period: 'high', bird_count: 10 });
			const halfRow = buildStatsRow({ time_period: 'half', bird_count: 5 });

			const result = getTopByProperty('bird_count')([highRow, halfRow]);

			expect(result.map((item) => item.timePeriod).sort()).toEqual([
				'half',
				'high'
			]);
		});

		it('uses a custom threshold over the default when options.threshold is given', () => {
			// max is 4, so the floor from max/2 is only 2 — equal to
			// DEFAULT_THRESHOLD, so under the default both rows (4 and 3) would be
			// kept. Passing options.threshold: 4 raises the bar past the second
			// row's value, dropping it.
			const aboveRow = buildStatsRow({ time_period: 'above', bird_count: 4 });
			const belowRow = buildStatsRow({ time_period: 'below', bird_count: 3 });

			const result = getTopByProperty('bird_count', { threshold: 4 })([
				aboveRow,
				belowRow
			]);

			expect(result.map((item) => item.timePeriod)).toEqual(['above']);
		});

		it('still applies the half-of-maximum floor even when a custom threshold is lower', () => {
			// max is 10, so the floor from max/2 is 5. A custom threshold of 1 is
			// lower than both DEFAULT_THRESHOLD and that floor, but the row at 3
			// still gets dropped because the floor still applies on top of it.
			const highRow = buildStatsRow({ time_period: 'high', bird_count: 10 });
			const lowRow = buildStatsRow({ time_period: 'low', bird_count: 3 });

			const result = getTopByProperty('bird_count', { threshold: 1 })([
				highRow,
				lowRow
			]);

			expect(result.map((item) => item.timePeriod)).toEqual(['high']);
		});
	});

	describe('ordering', () => {
		it('sorts descending by value by default', () => {
			const rows = [
				buildStatsRow({ time_period: 'mid', bird_count: 8 }),
				buildStatsRow({ time_period: 'low', bird_count: 6 }),
				buildStatsRow({ time_period: 'high', bird_count: 10 })
			];

			const result = getTopByProperty('bird_count')(rows);

			expect(result.map((item) => item.timePeriod)).toEqual([
				'high',
				'mid',
				'low'
			]);
		});

		it('sorts ascending by value when options.smallestWins is true', () => {
			const rows = [
				buildStatsRow({ time_period: 'mid', bird_count: 8 }),
				buildStatsRow({ time_period: 'low', bird_count: 6 }),
				buildStatsRow({ time_period: 'high', bird_count: 10 })
			];

			const result = getTopByProperty('bird_count', { smallestWins: true })(
				rows
			);

			expect(result.map((item) => item.timePeriod)).toEqual([
				'low',
				'mid',
				'high'
			]);
		});
	});

	describe('row shape', () => {
		it("carries each kept row's time_period and species_name onto timePeriod/species", () => {
			const row = buildStatsRow({
				time_period: '2024-03',
				species_name: 'Eurasian Blue Tit',
				bird_count: 5
			});

			const result = getTopByProperty('bird_count')([row]);

			expect(result).toEqual([
				{
					timePeriod: '2024-03',
					species: 'Eurasian Blue Tit',
					value: 5
				}
			]);
		});
	});
});

describe('getTopByProperty', () => {
	it('delegates to getTopByPropertiesSum with a single-property array', () => {
		const rows = [
			buildStatsRow({ time_period: 'P1', encounter_count: 10 }),
			buildStatsRow({ time_period: 'P2', encounter_count: 4 })
		];
		const options = { threshold: DEFAULT_THRESHOLD };

		const viaProperty = getTopByProperty('encounter_count', options)(rows);
		const viaPropertiesSum = getTopByPropertiesSum(
			['encounter_count'],
			options
		)(rows);

		expect(viaProperty).toEqual(viaPropertiesSum);
	});
});
