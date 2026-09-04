import { describe, it, expect } from 'vitest';
import { removeBusiestSinceWhenBusiestRecordHeld } from '../remove-busiest-since-when-busiest-record-held';
import {
	sessionTotalRecord,
	speciesCountRecord,
	busiestSince,
	quietestSince
} from './fixtures';

describe('removeBusiestSinceWhenBusiestRecordHeld (Rem-1)', () => {
	it('drops a busiest-since comparison when a busiest session-total record is present', () => {
		const removed = removeBusiestSinceWhenBusiestRecordHeld([
			sessionTotalRecord('encounters', 'this-year', 120),
			busiestSince
		]);
		expect(removed).toEqual([
			sessionTotalRecord('encounters', 'this-year', 120)
		]);
	});

	it('keeps a busiest-since comparison when no busiest record is present', () => {
		const removed = removeBusiestSinceWhenBusiestRecordHeld([
			sessionTotalRecord('species', 'this-year', 15),
			busiestSince
		]);
		expect(removed).toContainEqual(busiestSince);
	});

	it('never drops a quietest-since comparison', () => {
		const removed = removeBusiestSinceWhenBusiestRecordHeld([
			sessionTotalRecord('encounters', 'this-year', 120),
			quietestSince
		]);
		expect(removed).toContainEqual(quietestSince);
	});

	it('is a noop on unrelated highlights', () => {
		const pool = [speciesCountRecord('Wren', 'all-time', 5), quietestSince];
		expect(removeBusiestSinceWhenBusiestRecordHeld(pool)).toEqual(pool);
	});

	it('does not mutate the input list', () => {
		const pool = [
			sessionTotalRecord('encounters', 'this-year', 120),
			busiestSince
		];
		const snapshot = [...pool];
		removeBusiestSinceWhenBusiestRecordHeld(pool);
		expect(pool).toEqual(snapshot);
	});
});
