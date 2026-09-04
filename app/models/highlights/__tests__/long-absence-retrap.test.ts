import { describe, it, expect } from 'vitest';
import type { LongAbsenceRetrapsResult } from '@/app/models/db';
import { deriveLongAbsenceRetraps } from '../long-absence-retrap';

function makeLongAbsenceRetrapResult(
	overrides: Partial<LongAbsenceRetrapsResult> = {}
): LongAbsenceRetrapsResult {
	return {
		ring_no: 'ARRETRAP',
		species_name: 'Robin',
		previous_date: '2021-06-20',
		gap_days: 1000,
		...overrides
	};
}

describe('deriveLongAbsenceRetraps', () => {
	it('maps rows to highlights preserving gap-descending order', () => {
		const results: LongAbsenceRetrapsResult[] = [
			makeLongAbsenceRetrapResult({
				ring_no: 'AAA111',
				species_name: 'Robin',
				previous_date: '2020-01-01',
				gap_days: 1500
			}),
			makeLongAbsenceRetrapResult({
				ring_no: 'BBB222',
				species_name: 'Wren',
				previous_date: '2021-06-20',
				gap_days: 1000
			})
		];
		const highlights = deriveLongAbsenceRetraps(results, '2024-03-15');
		expect(highlights).toHaveLength(2);
		expect(highlights[0]).toMatchObject({
			type: 'long-absence-retrap',
			ringNo: 'AAA111',
			speciesName: 'Robin',
			previousDate: '2020-01-01'
		});
		expect(highlights[1]).toMatchObject({
			type: 'long-absence-retrap',
			ringNo: 'BBB222',
			speciesName: 'Wren',
			previousDate: '2021-06-20'
		});
	});
});
