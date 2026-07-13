import { describe, it, expect } from 'vitest';
import {
	getSeasonMonths,
	getSeasonPeriodLabel,
	isCurrentSeasonPeriod
} from '../seasons';

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

describe('getSeasonPeriodLabel', () => {
	it('labels a spring date with its calendar year', () => {
		expect(getSeasonPeriodLabel(new Date('2024-05-10'))).toBe('spring 2024');
	});

	it('labels an autumn date with its calendar year', () => {
		expect(getSeasonPeriodLabel(new Date('2023-09-15'))).toBe('autumn 2023');
	});

	it('labels a November winter date with its start year and end-year suffix', () => {
		expect(getSeasonPeriodLabel(new Date('2024-11-15'))).toBe('winter 2024/25');
	});

	it('labels a February winter date with the previous start year', () => {
		expect(getSeasonPeriodLabel(new Date('2025-02-10'))).toBe('winter 2024/25');
	});
});

describe('isCurrentSeasonPeriod', () => {
	it('returns true when today falls within the same season period', () => {
		expect(
			isCurrentSeasonPeriod(new Date('2024-09-15'), new Date('2024-10-20'))
		).toBe(true);
	});

	it('returns true across the year end within one winter', () => {
		expect(
			isCurrentSeasonPeriod(new Date('2024-12-05'), new Date('2025-01-20'))
		).toBe(true);
	});

	it('returns false when today is in the same season of a later year', () => {
		expect(
			isCurrentSeasonPeriod(new Date('2023-09-15'), new Date('2024-09-15'))
		).toBe(false);
	});

	it('returns false when today is outside the season months of the same year', () => {
		expect(
			isCurrentSeasonPeriod(new Date('2024-05-10'), new Date('2024-09-15'))
		).toBe(false);
	});
});
