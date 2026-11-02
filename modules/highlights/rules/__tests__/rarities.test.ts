import { describe, it, expect } from 'vitest';

import { rarities } from '../rarities';
import type { CombinedHighlight, HighlightScope } from '../../types';
import type { StatsResult } from '@/modules/stats';

// The shared printer-snapshot test (rules.combinedhighlights.output.test.ts)
// builds its CombinedHighlight fixtures around rank/tie/time-window variants
// that matter for a "busiest X" count metric. rarities' generator never
// produces that shape — its value is always 'Only' | 'first of only N' | 'N
// of only M' — so that shared matrix is skipped for rarities and these
// hand-crafted, shape-appropriate fixtures exercise the printer instead.
function makeCombinedHighlight(
	value: string,
	scopes: CombinedHighlight['scopes']
): CombinedHighlight {
	return {
		descriptor: rarities.descriptor,
		value: { timePeriod: '2020-02-02', value, species: 'Robin' },
		species: 'Robin',
		bestPosition: 1,
		scopes
	} as CombinedHighlight;
}

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

	describe('formatters.combinedHighlightPrinter', () => {
		it("prints a species' only-ever record without a count", () => {
			const combinedHighlight = makeCombinedHighlight('Only', [
				{
					scope: { temporalUnit: 'day' },
					ranking: { position: 1, isTied: false }
				}
			]);

			expect(
				rarities.formatters.combinedHighlightPrinter(combinedHighlight)
			).toBe('Only Robin ever');
		});

		it('prints the first of a handful of all-time rare appearances', () => {
			const combinedHighlight = makeCombinedHighlight('first of only 5', [
				{
					scope: { temporalUnit: 'day' },
					ranking: { position: 1, isTied: false }
				}
			]);

			expect(
				rarities.formatters.combinedHighlightPrinter(combinedHighlight)
			).toBe('First of only 5 Robin ever');
		});

		it('prints a later rare appearance scoped to a year', () => {
			const combinedHighlight = makeCombinedHighlight('3 of only 5', [
				{
					scope: { temporalUnit: 'year', parentTimeWindow: { year: 2020 } },
					ranking: { position: 1, isTied: false }
				}
			]);

			expect(
				rarities.formatters.combinedHighlightPrinter(combinedHighlight)
			).toBe('3 of only 5 Robin of 2020');
		});

		it('prints only the broadest scope when a rarity highlight carries more than one', () => {
			// scopes are sorted broadest-first upstream (sortByPositionAndTimeWindow);
			// a species' first record ever is necessarily also its first of any
			// narrower window, so only scopes[0] is printed - see the comment on
			// rarities.formatters.combinedHighlightPrinter in rarities.ts.
			const combinedHighlight = makeCombinedHighlight('Only', [
				{
					scope: { temporalUnit: 'day' },
					ranking: { position: 1, isTied: false }
				},
				{
					scope: { temporalUnit: 'year', parentTimeWindow: { year: 2020 } },
					ranking: { position: 1, isTied: false }
				}
			]);

			expect(
				rarities.formatters.combinedHighlightPrinter(combinedHighlight)
			).toBe('Only Robin ever');
		});
	});
});
