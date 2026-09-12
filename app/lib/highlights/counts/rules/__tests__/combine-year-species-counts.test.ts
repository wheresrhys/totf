import { describe, it, expect } from 'vitest';
import { combineYearSpeciesCounts } from '../combine-year-species-counts';
import { speciesCountRecord, periodFields, busiestSince } from './fixtures';

describe('combineYearSpeciesCounts (Comb-3)', () => {
	it('leaves a single this-year species record unchanged', () => {
		const lone = speciesCountRecord('Chiffchaff', 'this-year', 5);
		expect(combineYearSpeciesCounts([lone])).toEqual([lone]);
	});

	it('merges multiple this-year records into one line dropping the counts', () => {
		const combined = combineYearSpeciesCounts([
			speciesCountRecord("Cetti's Warbler", 'this-year', 6),
			speciesCountRecord('Chiffchaff', 'this-year', 5),
			speciesCountRecord('Whitethroat', 'this-year', 4)
		]);
		expect(combined).toEqual([
			{
				type: 'combined-species-count-record',
				scope: 'this-year',
				speciesNames: ["Cetti's Warbler", 'Chiffchaff', 'Whitethroat'],
				...periodFields
			}
		]);
	});

	it('takes the list position of the first this-year record', () => {
		const combined = combineYearSpeciesCounts([
			speciesCountRecord("Cetti's Warbler", 'this-year', 6),
			speciesCountRecord('Blackcap', 'all-time', 24),
			speciesCountRecord('Chiffchaff', 'this-year', 5)
		]);
		expect(combined.map((highlight) => highlight.type)).toEqual([
			'combined-species-count-record',
			'species-count-record'
		]);
	});

	it('never merges all-time records', () => {
		const allTime = speciesCountRecord('Reed Warbler', 'all-time', 67, {
			placementRank: 2,
			isJointPlacement: false
		});
		const anotherAllTime = speciesCountRecord('Blackcap', 'all-time', 24);
		expect(combineYearSpeciesCounts([allTime, anotherAllTime])).toEqual([
			allTime,
			anotherAllTime
		]);
	});

	it('leaves a lone this-year record alongside an all-time record unchanged', () => {
		const year = speciesCountRecord('Chiffchaff', 'this-year', 5);
		const allTime = speciesCountRecord('Wren', 'all-time', 3);
		expect(combineYearSpeciesCounts([year, allTime])).toEqual([year, allTime]);
	});

	it('is a noop on unrelated highlights', () => {
		const pool = [speciesCountRecord('Wren', 'all-time', 3), busiestSince];
		expect(combineYearSpeciesCounts(pool)).toEqual(pool);
	});
});
