import { describe, it, expect } from 'vitest';
import {
	enumerateReviewPeriods,
	hasUsableWindow,
	isEmptySelection
} from '../period-enumeration';

function timePeriods(periods: { timePeriod: string }[]): string[] {
	return periods.map((period) => period.timePeriod);
}

describe('enumerateReviewPeriods', () => {
	describe('enumerating days', () => {
		it('lists every day between fromDate and toDate inclusive', () => {
			const periods = enumerateReviewPeriods(
				{ fromDate: '2025-01-01', toDate: '2025-01-03' },
				'day'
			);
			expect(timePeriods(periods)).toEqual([
				'2025-01-01',
				'2025-01-02',
				'2025-01-03'
			]);
			expect(periods[0].label).toBe('1 January 2025');
		});

		it('rolls over into the next month when the window crosses a month boundary', () => {
			const periods = enumerateReviewPeriods(
				{ fromDate: '2025-01-30', toDate: '2025-02-02' },
				'day'
			);
			expect(timePeriods(periods)).toEqual([
				'2025-01-30',
				'2025-01-31',
				'2025-02-01',
				'2025-02-02'
			]);
		});

		it('rolls over into the next year when the window crosses a year boundary', () => {
			const periods = enumerateReviewPeriods(
				{ fromDate: '2025-12-30', toDate: '2026-01-02' },
				'day'
			);
			expect(timePeriods(periods)).toEqual([
				'2025-12-30',
				'2025-12-31',
				'2026-01-01',
				'2026-01-02'
			]);
		});

		it('accounts for a leap year when enumerating through February', () => {
			const periods = enumerateReviewPeriods(
				{ fromDate: '2024-02-27', toDate: '2024-03-01' },
				'day'
			);
			expect(timePeriods(periods)).toEqual([
				'2024-02-27',
				'2024-02-28',
				'2024-02-29',
				'2024-03-01'
			]);
		});

		it('returns a single period when fromDate equals toDate', () => {
			const periods = enumerateReviewPeriods(
				{ fromDate: '2025-05-10', toDate: '2025-05-10' },
				'day'
			);
			expect(timePeriods(periods)).toEqual(['2025-05-10']);
		});
	});

	describe('enumerating months', () => {
		it('lists every calendar month the window touches, even when the window only partially overlaps the first or last month', () => {
			const periods = enumerateReviewPeriods(
				{ fromDate: '2025-03-15', toDate: '2025-08-10' },
				'month'
			);
			expect(timePeriods(periods)).toEqual([
				'2025-03-01',
				'2025-04-01',
				'2025-05-01',
				'2025-06-01',
				'2025-07-01',
				'2025-08-01'
			]);
			expect(periods[0].label).toBe('March 2025');
		});

		it('rolls over into the next year when the window spans a year boundary', () => {
			const periods = enumerateReviewPeriods(
				{ fromDate: '2025-11-10', toDate: '2026-02-05' },
				'month'
			);
			expect(timePeriods(periods)).toEqual([
				'2025-11-01',
				'2025-12-01',
				'2026-01-01',
				'2026-02-01'
			]);
		});

		it('returns a single period when the window sits entirely inside one month', () => {
			const periods = enumerateReviewPeriods(
				{ fromDate: '2025-06-01', toDate: '2025-06-30' },
				'month'
			);
			expect(timePeriods(periods)).toEqual(['2025-06-01']);
		});
	});

	describe('enumerating years', () => {
		it('lists every calendar year the window touches', () => {
			const periods = enumerateReviewPeriods(
				{ fromDate: '2023-06-01', toDate: '2025-02-01' },
				'year'
			);
			expect(timePeriods(periods)).toEqual([
				'2023-01-01',
				'2024-01-01',
				'2025-01-01'
			]);
			expect(periods[0].label).toBe('2023');
		});

		it('returns a single period when the window sits entirely inside one year', () => {
			const periods = enumerateReviewPeriods(
				{ fromDate: '2025-01-01', toDate: '2025-12-31' },
				'year'
			);
			expect(timePeriods(periods)).toEqual(['2025-01-01']);
		});
	});

	describe('a recurring (yearless) month window', () => {
		it('enumerates one period per spanned year at month granularity', () => {
			const periods = enumerateReviewPeriods(
				{ fromDate: '2021-01-01', toDate: '2023-12-31', recurringMonth: 5 },
				'month'
			);
			expect(timePeriods(periods)).toEqual([
				'2021-05-01',
				'2022-05-01',
				'2023-05-01'
			]);
			expect(periods[0].label).toBe('May 2021');
		});

		it('enumerates the same one-period-per-year result at year granularity', () => {
			const window = {
				fromDate: '2021-01-01',
				toDate: '2023-12-31',
				recurringMonth: 5
			};
			expect(enumerateReviewPeriods(window, 'year')).toEqual(
				enumerateReviewPeriods(window, 'month')
			);
		});

		it('enumerates every day of the recurring month in each spanned year at day granularity', () => {
			const periods = enumerateReviewPeriods(
				{ fromDate: '2021-01-01', toDate: '2022-12-31', recurringMonth: 5 },
				'day'
			);
			expect(periods).toHaveLength(31 * 2);
			expect(timePeriods(periods)[0]).toBe('2021-05-01');
			expect(timePeriods(periods)[30]).toBe('2021-05-31');
			expect(timePeriods(periods)[31]).toBe('2022-05-01');
		});

		it('skips a spanned year whose occurrence of the month falls entirely outside the explicit bounds', () => {
			const periods = enumerateReviewPeriods(
				{ fromDate: '2021-06-01', toDate: '2023-03-31', recurringMonth: 5 },
				'month'
			);
			expect(timePeriods(periods)).toEqual(['2022-05-01']);
		});

		it("clips the first and last spanned year's days to the explicit fromDate/toDate bounds", () => {
			const periods = enumerateReviewPeriods(
				{ fromDate: '2021-05-15', toDate: '2022-05-10', recurringMonth: 5 },
				'day'
			);
			const periodDates = timePeriods(periods);
			expect(periodDates[0]).toBe('2021-05-15');
			expect(periodDates).toHaveLength(17 + 10);
			expect(periodDates[16]).toBe('2021-05-31');
			expect(periodDates[17]).toBe('2022-05-01');
			expect(periodDates.at(-1)).toBe('2022-05-10');
		});
	});
});

describe('hasUsableWindow', () => {
	it('returns false for null', () => {
		expect(hasUsableWindow(null)).toBe(false);
	});

	it('returns false when neither fromDate nor toDate is set', () => {
		expect(hasUsableWindow({})).toBe(false);
	});

	it('returns false when only one of fromDate/toDate is set', () => {
		expect(hasUsableWindow({ fromDate: '2025-01-01' })).toBe(false);
		expect(hasUsableWindow({ toDate: '2025-01-01' })).toBe(false);
	});

	it('returns true when both fromDate and toDate are set, regardless of recurringMonth', () => {
		expect(
			hasUsableWindow({ fromDate: '2025-01-01', toDate: '2025-12-31' })
		).toBe(true);
		expect(
			hasUsableWindow({
				fromDate: '2025-01-01',
				toDate: '2025-12-31',
				recurringMonth: 5
			})
		).toBe(true);
	});
});

describe('isEmptySelection', () => {
	it('returns true when year, month, fromDate and toDate are all unset', () => {
		expect(isEmptySelection({})).toBe(true);
	});

	it('returns false when any one of year, month, fromDate or toDate is set', () => {
		expect(isEmptySelection({ year: 2025 })).toBe(false);
		expect(isEmptySelection({ month: 5 })).toBe(false);
		expect(isEmptySelection({ fromDate: '2025-01-01' })).toBe(false);
		expect(isEmptySelection({ toDate: '2025-01-01' })).toBe(false);
	});
});
