import { describe, it, expect } from 'vitest';
import { combineSessionTotalRecords } from '../combine-session-total-records';
import { sessionTotalRecord, periodFields } from './fixtures';

describe('combineSessionTotalRecords (Comb-1)', () => {
	it('merges same-scope encounters and species records into one combined record', () => {
		const combined = combineSessionTotalRecords([
			sessionTotalRecord('encounters', 'this-year', 120),
			sessionTotalRecord('species', 'this-year', 15)
		]);
		expect(combined).toEqual([
			{
				type: 'combined-session-total-record',
				scope: 'this-year',
				encounterValue: 120,
				speciesValue: 15,
				...periodFields
			}
		]);
	});

	it('leaves records over different scopes separate', () => {
		const encounters = sessionTotalRecord('encounters', 'all-time', 200);
		const species = sessionTotalRecord('species', 'this-year', 15);
		const combined = combineSessionTotalRecords([encounters, species]);
		expect(combined).toEqual([encounters, species]);
	});

	it('takes the list position of the encounters record', () => {
		const combined = combineSessionTotalRecords([
			sessionTotalRecord('species', 'this-year', 15),
			sessionTotalRecord('encounters', 'this-year', 120)
		]);
		expect(combined).toHaveLength(1);
		expect(combined[0].type).toBe('combined-session-total-record');
	});

	it('leaves a lone session-total record unchanged', () => {
		const lone = sessionTotalRecord('encounters', 'this-year', 120);
		expect(combineSessionTotalRecords([lone])).toEqual([lone]);
	});
});
