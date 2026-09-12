import { describe, it, expect } from 'vitest';
import { mergeSpeciesBiometrics } from '../species-stats';
import type { AggregateStatsResult, BiometricsStatsResult } from '../db';

function buildAggregateRow(
	overrides: Partial<AggregateStatsResult> = {}
): AggregateStatsResult {
	return {
		species_name: 'Blue Tit',
		time_period: null,
		session_count: 4,
		total_effort: '18:00:00',
		effort_per_session: '02:00:00',
		effort_per_encounter: '02:34:17',
		avg_encounters_per_session: 1.75,
		max_per_session: 3,
		species_count: 1,
		bird_count: 6,
		encounter_count: 7,
		new_bird_count: 4,
		pullus_bird_count: 0,
		juv_bird_count: 0,
		postjuv_bird_count: 5,
		adult_bird_count: 0,
		unknown_age_bird_count: 1,
		pullus_enc_count: 0,
		juv_enc_count: 0,
		postjuv_enc_count: 6,
		adult_enc_count: 1,
		unknown_age_enc_count: 0,
		max_new_per_session: 3,
		max_weight: 13.1,
		avg_weight: 11.2,
		min_weight: 9.8,
		median_weight: 10.8,
		max_wing: 68,
		avg_wing: 66.6,
		min_wing: 65,
		median_wing: 67,
		...overrides
	} as unknown as AggregateStatsResult;
}

function buildBiometricsRow(
	overrides: Partial<BiometricsStatsResult> = {}
): BiometricsStatsResult {
	return {
		species_name: 'Blue Tit',
		time_period: null,
		max_weight: 20,
		avg_weight: 18,
		min_weight: 16,
		median_weight: 17,
		max_wing: 70,
		avg_wing: 69,
		min_wing: 68,
		median_wing: 68.5,
		...overrides
	};
}

describe('mergeSpeciesBiometrics', () => {
	describe('Usual', () => {
		it('joins two arrays by species_name into one row per species', () => {
			const merged = mergeSpeciesBiometrics(
				[
					buildAggregateRow({ species_name: 'Blue Tit' }),
					buildAggregateRow({ species_name: 'Robin' })
				],
				[
					buildBiometricsRow({ species_name: 'Blue Tit', max_weight: 20 }),
					buildBiometricsRow({ species_name: 'Robin', max_weight: 25 })
				]
			);

			expect(merged).toHaveLength(2);
			expect(
				merged.find((row) => row.species_name === 'Blue Tit')?.max_weight
			).toBe(20);
			expect(
				merged.find((row) => row.species_name === 'Robin')?.max_weight
			).toBe(25);
		});
	});

	describe('Structure', () => {
		it('keeps every non-biometric field from the aggregate_stats row', () => {
			const [row] = mergeSpeciesBiometrics(
				[
					buildAggregateRow({
						bird_count: 9,
						encounter_count: 11,
						session_count: 2,
						max_per_session: 5
					})
				],
				[buildBiometricsRow()]
			);

			expect(row.bird_count).toBe(9);
			expect(row.encounter_count).toBe(11);
			expect(row.session_count).toBe(2);
			expect(row.max_per_session).toBe(5);
		});
	});

	describe('Edge', () => {
		it('includes a species only present in the biometrics array', () => {
			const merged = mergeSpeciesBiometrics(
				[],
				[buildBiometricsRow({ species_name: 'Wren', max_weight: 12 })]
			);

			expect(merged).toHaveLength(1);
			expect(merged[0].species_name).toBe('Wren');
			expect(merged[0].max_weight).toBe(12);
		});

		it('returns aggregate_stats rows with biometric fields undefined when the biometrics array is empty', () => {
			const [row] = mergeSpeciesBiometrics(
				[buildAggregateRow({ species_name: 'Blue Tit' })],
				[]
			);

			expect(row.species_name).toBe('Blue Tit');
			expect(row.max_weight).toBeUndefined();
			expect(row.avg_weight).toBeUndefined();
			expect(row.min_weight).toBeUndefined();
			expect(row.median_weight).toBeUndefined();
			expect(row.max_wing).toBeUndefined();
			expect(row.avg_wing).toBeUndefined();
			expect(row.min_wing).toBeUndefined();
			expect(row.median_wing).toBeUndefined();
		});
	});
});
