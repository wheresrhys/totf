import { describe, it, expect } from 'vitest';
import { mergeSpeciesBiometrics } from '../species-stats';
import type { BiometricsStatsResult } from '../../models/db';
import alphaBiometricsBySpecies from '@/test-fixtures/snapshots/biometrics_stats/alpha.by-species.json';
import { buildCoreStatsRow } from '@/app/__tests__/helpers/core-stats-fixtures';

// A real captured biometrics_stats row (Alpha, group_by_species — the exact
// call fetchSpeciesData makes) rather than a hand-written literal, so the
// column set every test builds on comes from actual RPC output and can't
// silently drift from the RPC's shape (#883).
const [capturedBiometricsRow] =
	alphaBiometricsBySpecies as BiometricsStatsResult[];

function buildBiometricsRow(
	overrides: Partial<BiometricsStatsResult> = {}
): BiometricsStatsResult {
	return {
		...capturedBiometricsRow,
		...overrides
	};
}

describe('mergeSpeciesBiometrics', () => {
	describe('Usual', () => {
		it('joins two arrays by species_name into one row per species', () => {
			const merged = mergeSpeciesBiometrics(
				[
					buildCoreStatsRow({ species_name: 'Blue Tit' }),
					buildCoreStatsRow({ species_name: 'Robin' })
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
		it('keeps every non-biometric field from the core_stats row', () => {
			const [row] = mergeSpeciesBiometrics(
				[
					buildCoreStatsRow({
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

		it('returns core_stats rows with biometric fields undefined when the biometrics array is empty', () => {
			const [row] = mergeSpeciesBiometrics(
				[buildCoreStatsRow({ species_name: 'Blue Tit' })],
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
