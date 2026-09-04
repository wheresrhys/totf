import { describe, it, expect } from 'vitest';
import { combineOnlyOfYearHighlights } from '../combine-only-of-year-highlights';
import { firstOfYear, rare } from './fixtures';

describe('combineOnlyOfYearHighlights (Comb-2)', () => {
	it('leaves a single only-of-year highlight unchanged', () => {
		const only = firstOfYear('Chaffinch', true);
		expect(combineOnlyOfYearHighlights([only])).toEqual([only]);
	});

	it('merges two only-of-year highlights into one line listing both species', () => {
		const combined = combineOnlyOfYearHighlights([
			firstOfYear('Chaffinch', true),
			firstOfYear('Goldfinch', true)
		]);
		expect(combined).toEqual([
			{
				type: 'combined-only-of-year',
				speciesNames: ['Chaffinch', 'Goldfinch'],
				year: 2026,
				isCurrentYear: true
			}
		]);
	});

	it('merges three only-of-year highlights into one line listing all species', () => {
		const combined = combineOnlyOfYearHighlights([
			firstOfYear('Chaffinch', true),
			firstOfYear('Goldfinch', true),
			firstOfYear('Lesser Whitethroat', true)
		]);
		expect(combined).toEqual([
			{
				type: 'combined-only-of-year',
				speciesNames: ['Chaffinch', 'Goldfinch', 'Lesser Whitethroat'],
				year: 2026,
				isCurrentYear: true
			}
		]);
	});

	it('does not merge first-of-year (non-only) highlights', () => {
		const first = firstOfYear('Chaffinch', false);
		const secondFirst = firstOfYear('Goldfinch', false);
		expect(combineOnlyOfYearHighlights([first, secondFirst])).toEqual([
			first,
			secondFirst
		]);
	});

	it('merges only onlys, leaving first-of-year items in place', () => {
		const firstA = firstOfYear('Robin', false);
		const combined = combineOnlyOfYearHighlights([
			firstA,
			firstOfYear('Chaffinch', true),
			firstOfYear('Goldfinch', true)
		]);
		expect(combined).toEqual([
			firstA,
			{
				type: 'combined-only-of-year',
				speciesNames: ['Chaffinch', 'Goldfinch'],
				year: 2026,
				isCurrentYear: true
			}
		]);
	});

	it('is a noop on unrelated highlights', () => {
		const pool = [rare('Wryneck', 2), rare('Dunnock', 2)];
		expect(combineOnlyOfYearHighlights(pool)).toEqual(pool);
	});
});
