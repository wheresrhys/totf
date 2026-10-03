import { describe, it, expect } from 'vitest';
import {
	computeEffectiveDateRange,
	deriveYearMonthDateRange,
	isMonthSelectedWithoutYear
} from '../temporal-filter';

describe('deriving a date range from year/month alone', () => {
	it('derives no bounds at all when neither year nor month is selected', () => {
		expect(deriveYearMonthDateRange({})).toEqual({});
	});

	it('derives the whole calendar year when only a year is selected', () => {
		expect(deriveYearMonthDateRange({ year: 2022 })).toEqual({
			fromDate: '2022-01-01',
			toDate: '2022-12-31'
		});
	});

	it('derives that month in that year when both are selected', () => {
		expect(deriveYearMonthDateRange({ year: 2022, month: 2 })).toEqual({
			fromDate: '2022-02-01',
			toDate: '2022-02-28'
		});
	});

	it('derives the leap day as part of February in a leap year', () => {
		expect(deriveYearMonthDateRange({ year: 2024, month: 2 })).toEqual({
			fromDate: '2024-02-01',
			toDate: '2024-02-29'
		});
	});

	it('derives no bounds but a recurring month when a month is selected without a year', () => {
		expect(deriveYearMonthDateRange({ month: 5 })).toEqual({
			recurringMonth: 5
		});
	});
});

describe('computing the effective date range', () => {
	describe('intersecting the derived range with the explicit dates', () => {
		it('returns an empty range when nothing is selected', () => {
			expect(computeEffectiveDateRange({})).toEqual({});
		});

		it('returns the explicit dates untouched when no year or month narrows them', () => {
			expect(
				computeEffectiveDateRange({
					fromDate: '2022-03-15',
					toDate: '2022-09-20'
				})
			).toEqual({ fromDate: '2022-03-15', toDate: '2022-09-20' });
		});

		it('takes the later of the two lower bounds and the earlier of the two upper bounds', () => {
			expect(
				computeEffectiveDateRange({
					year: 2022,
					fromDate: '2022-03-15',
					toDate: '2023-09-20'
				})
			).toEqual({ fromDate: '2022-03-15', toDate: '2022-12-31' });
		});

		it('leaves a side unbounded when neither the derived range nor the selection bounds it', () => {
			expect(computeEffectiveDateRange({ fromDate: '2022-03-15' })).toEqual({
				fromDate: '2022-03-15'
			});
		});

		it('carries a recurring month through alongside the bounds it recurs within', () => {
			expect(
				computeEffectiveDateRange({
					month: 5,
					fromDate: '2021-01-01',
					toDate: '2023-12-31'
				})
			).toEqual({
				recurringMonth: 5,
				fromDate: '2021-01-01',
				toDate: '2023-12-31'
			});
		});
	});

	describe('rejecting selections no date can satisfy', () => {
		it('returns null when the explicit dates are the wrong way round', () => {
			expect(
				computeEffectiveDateRange({
					fromDate: '2022-09-20',
					toDate: '2022-03-15'
				})
			).toBeNull();
		});

		it('returns null when the explicit dates fall entirely outside the selected year', () => {
			expect(
				computeEffectiveDateRange({
					year: 2022,
					fromDate: '2023-01-01',
					toDate: '2023-12-31'
				})
			).toBeNull();
		});

		it('returns null when the explicit dates miss the selected year and month', () => {
			expect(
				computeEffectiveDateRange({
					year: 2022,
					month: 2,
					fromDate: '2022-03-01'
				})
			).toBeNull();
		});

		it('returns null when a recurring month never occurs inside the explicit dates, even though they span two years', () => {
			expect(
				computeEffectiveDateRange({
					month: 5,
					fromDate: '2021-06-01',
					toDate: '2022-03-31'
				})
			).toBeNull();
		});

		it('keeps a recurring month that only partially overlaps the explicit dates', () => {
			expect(
				computeEffectiveDateRange({
					month: 5,
					fromDate: '2021-06-01',
					toDate: '2022-05-10'
				})
			).toEqual({
				recurringMonth: 5,
				fromDate: '2021-06-01',
				toDate: '2022-05-10'
			});
		});

		it('keeps a recurring month bounded on one side only, since it recurs forever in the other direction', () => {
			expect(
				computeEffectiveDateRange({ month: 5, fromDate: '2021-06-01' })
			).toEqual({ recurringMonth: 5, fromDate: '2021-06-01' });
		});
	});
});

describe('spotting a month selected without a year', () => {
	it('is true for a month on its own', () => {
		expect(isMonthSelectedWithoutYear({ month: 5 })).toBe(true);
	});

	it('is false once a year accompanies the month', () => {
		expect(isMonthSelectedWithoutYear({ year: 2022, month: 5 })).toBe(false);
	});

	it('is false for a year on its own', () => {
		expect(isMonthSelectedWithoutYear({ year: 2022 })).toBe(false);
	});
});
