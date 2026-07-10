import { describe, it, expect } from 'vitest';
import { getSeasonMonths } from '../seasons';

describe('getSeasonMonths', () => {
	it('returns numeric months when thisYear is false', () => {
		const date = new Date('2024-11-15');
		expect(getSeasonMonths(date, false)).toEqual([11, 12, 1, 2, 3]);
	});

	it('returns YYYY-MM strings for a spring date', () => {
		const date = new Date('2024-05-10');
		expect(getSeasonMonths(date, true)).toEqual([
			'2024-04',
			'2024-05',
			'2024-06',
			'2024-07'
		]);
	});

	it('assigns Nov/Dec to the starting year and Jan–Mar to the following year for a November winter date', () => {
		const date = new Date('2024-11-15');
		expect(getSeasonMonths(date, true)).toEqual([
			'2024-11',
			'2024-12',
			'2025-01',
			'2025-02',
			'2025-03'
		]);
	});

	it('assigns Nov/Dec to the previous year for a January winter date', () => {
		const date = new Date('2025-01-20');
		expect(getSeasonMonths(date, true)).toEqual([
			'2024-11',
			'2024-12',
			'2025-01',
			'2025-02',
			'2025-03'
		]);
	});
});
