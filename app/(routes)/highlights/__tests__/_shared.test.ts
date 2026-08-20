import { describe, it, expect } from 'vitest';
import {
	parseYearParam,
	parseMonthParam,
	buildAllTimeHeading,
	buildYearHeading,
	buildYearMonthHeading
} from '../_shared';

describe('parseYearParam', () => {
	it('accepts a well-formed 4-digit year', () => {
		expect(parseYearParam('2026')).toBe(2026);
	});

	it('rejects a 3-digit year', () => {
		expect(parseYearParam('202')).toBeNull();
	});

	it('rejects a 5-digit year', () => {
		expect(parseYearParam('20260')).toBeNull();
	});

	it('rejects a non-numeric year', () => {
		expect(parseYearParam('abcd')).toBeNull();
	});
});

describe('parseMonthParam', () => {
	it('accepts each zero-padded month 01 through 12', () => {
		for (let month = 1; month <= 12; month++) {
			const padded = String(month).padStart(2, '0');
			expect(parseMonthParam(padded)).toBe(month);
		}
	});

	it('rejects an unpadded month like "8"', () => {
		expect(parseMonthParam('8')).toBeNull();
	});

	it('rejects "00"', () => {
		expect(parseMonthParam('00')).toBeNull();
	});

	it('rejects "13"', () => {
		expect(parseMonthParam('13')).toBeNull();
	});
});

describe('buildAllTimeHeading', () => {
	it('returns the all-time heading string', () => {
		expect(buildAllTimeHeading()).toBe('All time highlights');
	});
});

describe('buildYearHeading', () => {
	it('returns the year heading string', () => {
		expect(buildYearHeading(2026)).toBe('2026 highlights');
	});
});

describe('buildYearMonthHeading', () => {
	it('returns the long-month year heading string', () => {
		expect(buildYearMonthHeading(2026, 8)).toBe('August 2026 highlights');
	});
});
