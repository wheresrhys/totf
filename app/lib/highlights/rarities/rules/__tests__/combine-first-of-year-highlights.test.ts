import { describe, it, expect } from 'vitest';
import { combineFirstOfYearHighlights } from '../combine-first-of-year-highlights';
import { firstOfYear, rare } from './fixtures';

describe('combineFirstOfYearHighlights (Comb-6)', () => {
	it('leaves a single first-of-year highlight unchanged', () => {
		const only = firstOfYear('Robin', false);
		expect(combineFirstOfYearHighlights([only])).toEqual([only]);
	});

	it('merges two first-of-year highlights into one line listing both species', () => {
		const combined = combineFirstOfYearHighlights([
			firstOfYear('Blackbird', false),
			firstOfYear('Blackcap', false)
		]);
		expect(combined).toEqual([
			{
				type: 'combined-first-of-year',
				speciesNames: ['Blackbird', 'Blackcap'],
				year: 2026,
				isCurrentYear: true
			}
		]);
	});

	it('merges three first-of-year highlights into one line listing all species', () => {
		const combined = combineFirstOfYearHighlights([
			firstOfYear('Blackbird', false),
			firstOfYear('Blackcap', false),
			firstOfYear("Cetti's Warbler", false)
		]);
		expect(combined).toEqual([
			{
				type: 'combined-first-of-year',
				speciesNames: ['Blackbird', 'Blackcap', "Cetti's Warbler"],
				year: 2026,
				isCurrentYear: true
			}
		]);
	});

	it('merges regardless of each part being singular or plural', () => {
		const combined = combineFirstOfYearHighlights([
			firstOfYear('Blackbird', false, false),
			firstOfYear('Blackcap', false, true)
		]);
		expect(combined).toEqual([
			expect.objectContaining({
				type: 'combined-first-of-year',
				speciesNames: ['Blackbird', 'Blackcap']
			})
		]);
	});

	it('never merges "Only ... of the year" (isOnlyRecord) highlights', () => {
		const onlyA = firstOfYear('Chaffinch', true);
		const onlyB = firstOfYear('Goldfinch', true);
		expect(combineFirstOfYearHighlights([onlyA, onlyB])).toEqual([
			onlyA,
			onlyB
		]);
	});

	it('merges only the first-of-year items, leaving "only of year" items in place', () => {
		const onlyOfYear = firstOfYear('Chaffinch', true);
		const combined = combineFirstOfYearHighlights([
			onlyOfYear,
			firstOfYear('Blackbird', false),
			firstOfYear('Blackcap', false)
		]);
		expect(combined).toEqual([
			onlyOfYear,
			{
				type: 'combined-first-of-year',
				speciesNames: ['Blackbird', 'Blackcap'],
				year: 2026,
				isCurrentYear: true
			}
		]);
	});

	it('is a noop on unrelated highlights', () => {
		const pool = [rare('Wryneck', 2), firstOfYear('Chaffinch', true)];
		expect(combineFirstOfYearHighlights(pool)).toEqual(pool);
	});
});
