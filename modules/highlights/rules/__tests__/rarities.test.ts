import { describe, it, expect } from 'vitest';

import { rarities } from '../rarities';
import type { HighlightScope } from '../../types';
import type { StatsResult } from '@/modules/stats';

describe('rarities', () => {
	describe('generator', () => {
		it('returns no highlights when the species has no encounters', () => {
			const stats = [
				{ species_name: 'Robin', time_period: '2020-01-01', encounter_count: 0 },
				{ species_name: 'Robin', time_period: '2021-01-01', encounter_count: 0 }
			] as StatsResult[];

			expect(rarities.generator(stats)).toEqual([]);
		});

		it("returns a single 'Only' highlight when the species has exactly one appearance ever", () => {
			const stats = [
				{ species_name: 'Robin', time_period: '2020-01-01', encounter_count: 12 }
			] as StatsResult[];

			expect(rarities.generator(stats)).toEqual([
				{ timePeriod: '2020-01-01', value: 'Only', species: 'Robin' }
			]);
		});

		it('returns a first-of-only/k-of-only highlight per appearance when total encounters is at or below the rarity threshold', () => {
			const stats = [
				{ species_name: 'Robin', time_period: '2020-01-01', encounter_count: 2 },
				{ species_name: 'Robin', time_period: '2021-01-01', encounter_count: 3 }
			] as StatsResult[];

			expect(rarities.generator(stats)).toEqual([
				{ timePeriod: '2020-01-01', value: 'first of only 5', species: 'Robin' },
				{ timePeriod: '2021-01-01', value: '3 of only 5', species: 'Robin' }
			]);
		});

		it('returns no highlights once total encounters exceeds the rarity threshold', () => {
			const stats = [
				{ species_name: 'Robin', time_period: '2020-01-01', encounter_count: 3 },
				{ species_name: 'Robin', time_period: '2021-01-01', encounter_count: 3 }
			] as StatsResult[];

			expect(rarities.generator(stats)).toEqual([]);
		});

		it('uses the tighter threshold (2) when scoped to a parent time window, versus the all-time threshold (5)', () => {
			const stats = [
				{ species_name: 'Robin', time_period: '2020-01-01', encounter_count: 1 },
				{ species_name: 'Robin', time_period: '2021-01-01', encounter_count: 2 }
			] as StatsResult[];

			expect(rarities.generator(stats)).not.toEqual([]);

			const scopedToYear: HighlightScope = {
				temporalUnit: 'year',
				parentTimeWindow: { year: 2020 }
			};
			expect(rarities.generator(stats, scopedToYear)).toEqual([]);
		});
	});

	describe('condition', () => {
		it('excludes a scope with a month-only parentTimeWindow', () => {
			const scope: HighlightScope = {
				temporalUnit: 'month',
				parentTimeWindow: { month: 2 }
			};

			expect(rarities.condition?.(scope)).toBe(false);
		});

		it('allows a scope with a year or day parentTimeWindow, or no parentTimeWindow at all', () => {
			const yearScope: HighlightScope = {
				temporalUnit: 'year',
				parentTimeWindow: { year: 2020 }
			};
			const dayScope: HighlightScope = { temporalUnit: 'day' };
			const noRestrictionScope: HighlightScope = { temporalUnit: 'year' };

			expect(rarities.condition?.(yearScope)).toBe(true);
			expect(rarities.condition?.(dayScope)).toBe(true);
			expect(rarities.condition?.(noRestrictionScope)).toBe(true);
		});
	});
});
