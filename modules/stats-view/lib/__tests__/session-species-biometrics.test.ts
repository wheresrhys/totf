import { describe, it, expect } from 'vitest';
import type { SessionEncounter } from '@/app/models/session';
import { deriveSessionSpeciesBiometrics } from '../session-species-biometrics';

// Only `weight`/`wing_length` are read, so each fixture names just the
// measurements the scenario is about — `unmeasured` for an encounter carrying
// neither.
function encounter(
	measurements: { weight?: number | null; wing_length?: number | null } = {}
): SessionEncounter {
	return {
		weight: measurements.weight ?? null,
		wing_length: measurements.wing_length ?? null
	} as SessionEncounter;
}

const unmeasured = encounter();

const weightsOf = (...weights: number[]) =>
	weights.map((weight) => encounter({ weight }));

describe('deriveSessionSpeciesBiometrics', () => {
	describe('weight aggregation', () => {
		it('returns null for every weight stat when no encounter has a weight', () => {
			const stats = deriveSessionSpeciesBiometrics([
				unmeasured,
				encounter({ wing_length: 70 })
			]);
			expect(stats.max_weight).toBeNull();
			expect(stats.avg_weight).toBeNull();
			expect(stats.min_weight).toBeNull();
			expect(stats.median_weight).toBeNull();
		});

		it('returns the single value for max/min/avg/median when exactly one encounter has a weight', () => {
			const stats = deriveSessionSpeciesBiometrics(weightsOf(18.5));
			expect(stats.max_weight).toBe(18.5);
			expect(stats.avg_weight).toBe(18.5);
			expect(stats.min_weight).toBe(18.5);
			expect(stats.median_weight).toBe(18.5);
		});

		it('computes max/min/avg correctly across multiple weighed encounters', () => {
			const stats = deriveSessionSpeciesBiometrics(weightsOf(18, 11, 16));
			expect(stats.max_weight).toBe(18);
			expect(stats.min_weight).toBe(11);
			expect(stats.avg_weight).toBe(15);
		});

		it('computes the median as the middle value for an odd-length set of weights', () => {
			const stats = deriveSessionSpeciesBiometrics(weightsOf(18, 11, 16));
			expect(stats.median_weight).toBe(16);
		});

		it('computes the median as the average of the two middle values for an even-length set of weights', () => {
			const stats = deriveSessionSpeciesBiometrics(weightsOf(18, 11, 16, 13));
			// sorted: 11, 13, 16, 18 — interpolated between 13 and 16.
			expect(stats.median_weight).toBe(14.5);
		});

		it('excludes encounters with a null weight from every weight stat', () => {
			const stats = deriveSessionSpeciesBiometrics([
				...weightsOf(18, 16),
				unmeasured,
				unmeasured
			]);
			expect(stats.max_weight).toBe(18);
			expect(stats.min_weight).toBe(16);
			// 17, not 8.5 — the two unmeasured encounters count for nothing rather
			// than as zeroes.
			expect(stats.avg_weight).toBe(17);
			expect(stats.median_weight).toBe(17);
		});
	});

	describe('wing-length aggregation', () => {
		it('returns null for every wing stat when no encounter has a wing length', () => {
			const stats = deriveSessionSpeciesBiometrics([
				unmeasured,
				encounter({ weight: 18 })
			]);
			expect(stats.max_wing).toBeNull();
			expect(stats.avg_wing).toBeNull();
			expect(stats.min_wing).toBeNull();
			expect(stats.median_wing).toBeNull();
		});

		it('computes max/min/avg/median correctly across multiple measured encounters', () => {
			const stats = deriveSessionSpeciesBiometrics([
				encounter({ wing_length: 72 }),
				encounter({ wing_length: 68 }),
				encounter({ wing_length: 70 }),
				encounter({ wing_length: 66 })
			]);
			expect(stats.max_wing).toBe(72);
			expect(stats.min_wing).toBe(66);
			expect(stats.avg_wing).toBe(69);
			// sorted: 66, 68, 70, 72 — interpolated between 68 and 70.
			expect(stats.median_wing).toBe(69);
		});
	});

	describe('independence of weight and wing aggregation', () => {
		it('includes an encounter in the weight stats but excludes it from the wing stats when it has a weight but no wing length, and vice versa', () => {
			const stats = deriveSessionSpeciesBiometrics([
				encounter({ weight: 18 }),
				encounter({ wing_length: 70 })
			]);
			expect(stats.max_weight).toBe(18);
			expect(stats.min_weight).toBe(18);
			expect(stats.avg_weight).toBe(18);
			expect(stats.max_wing).toBe(70);
			expect(stats.min_wing).toBe(70);
			expect(stats.avg_wing).toBe(70);
		});
	});

	describe('empty encounters array', () => {
		it('returns null for all 8 biometric stats when the species has no encounters at all', () => {
			expect(deriveSessionSpeciesBiometrics([])).toEqual({
				max_weight: null,
				avg_weight: null,
				min_weight: null,
				median_weight: null,
				max_wing: null,
				avg_wing: null,
				min_wing: null,
				median_wing: null
			});
		});
	});
});
