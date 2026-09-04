import { describe, it, expect } from 'vitest';
import { combineFirstEverHighlights } from '../combine-first-ever-highlights';
import { firstEver, rare } from './fixtures';

describe('combineFirstEverHighlights (Comb-5)', () => {
	it('leaves a single first-ever highlight unchanged', () => {
		const only = firstEver('Firecrest', false);
		expect(combineFirstEverHighlights([only])).toEqual([only]);
	});

	it('merges two first-ever highlights into one line listing both species', () => {
		const combined = combineFirstEverHighlights([
			firstEver('Blackbird', false),
			firstEver('Blackcap', false)
		]);
		expect(combined).toEqual([
			{
				type: 'combined-first-ever',
				speciesNames: ['Blackbird', 'Blackcap']
			}
		]);
	});

	it('merges three first-ever highlights into one line listing all species', () => {
		const combined = combineFirstEverHighlights([
			firstEver('Blackbird', false),
			firstEver('Blackcap', false),
			firstEver("Cetti's Warbler", false)
		]);
		expect(combined).toEqual([
			{
				type: 'combined-first-ever',
				speciesNames: ['Blackbird', 'Blackcap', "Cetti's Warbler"]
			}
		]);
	});

	it('merges regardless of each part being singular or plural', () => {
		const combined = combineFirstEverHighlights([
			firstEver('Blackbird', false, false),
			firstEver('Blackcap', false, true)
		]);
		expect(combined).toEqual([
			expect.objectContaining({
				type: 'combined-first-ever',
				speciesNames: ['Blackbird', 'Blackcap']
			})
		]);
	});

	it('never merges "Only ... ever" (isOnlyRecord) highlights', () => {
		const firstA = firstEver('Robin', true);
		const firstB = firstEver('Wren', true);
		expect(combineFirstEverHighlights([firstA, firstB])).toEqual([
			firstA,
			firstB
		]);
	});

	it('merges only the first-ever items, leaving "only ever" items in place', () => {
		const onlyEver = firstEver('Robin', true);
		const combined = combineFirstEverHighlights([
			onlyEver,
			firstEver('Blackbird', false),
			firstEver('Blackcap', false)
		]);
		expect(combined).toEqual([
			onlyEver,
			{
				type: 'combined-first-ever',
				speciesNames: ['Blackbird', 'Blackcap']
			}
		]);
	});

	it('takes the list position of the first first-ever highlight', () => {
		const combined = combineFirstEverHighlights([
			firstEver('Blackbird', false),
			rare('Wryneck', 2),
			firstEver('Blackcap', false)
		]);
		expect(combined.map((highlight) => highlight.type)).toEqual([
			'combined-first-ever',
			'rare-species'
		]);
	});

	it('is a noop on unrelated highlights', () => {
		const pool = [rare('Wryneck', 2), firstEver('Chaffinch', true)];
		expect(combineFirstEverHighlights(pool)).toEqual(pool);
	});
});
