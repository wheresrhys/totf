import { describe, it, expect } from 'vitest';
import {
	parseMonthAbbreviation,
	formatMonthAbbreviation,
	buildGroupSquashedMonthSummaryHref,
	buildSpeciesSquashedMonthHref
} from '../squashed-month';
import type { ViewedGroup } from '../group-slug';

const VIEWED_GROUP: ViewedGroup = { id: 1, slug: 'alpha' };

describe('parseMonthAbbreviation', () => {
	describe('Usual', () => {
		it.each([
			['jan', 1],
			['feb', 2],
			['mar', 3],
			['apr', 4],
			['may', 5],
			['jun', 6],
			['jul', 7],
			['aug', 8],
			['sep', 9],
			['oct', 10],
			['nov', 11],
			['dec', 12]
		])('parses "%s" as month %i', (abbreviation, month) => {
			expect(parseMonthAbbreviation(abbreviation)).toBe(month);
		});
	});

	describe('Structure', () => {
		it('is case-insensitive', () => {
			expect(parseMonthAbbreviation('JAN')).toBe(1);
			expect(parseMonthAbbreviation('Jan')).toBe(1);
		});
	});

	describe('Edge', () => {
		it('returns undefined for a numeric year string', () => {
			expect(parseMonthAbbreviation('2026')).toBeUndefined();
		});

		it('returns undefined for a full month name', () => {
			expect(parseMonthAbbreviation('january')).toBeUndefined();
		});

		it('returns undefined for an empty string', () => {
			expect(parseMonthAbbreviation('')).toBeUndefined();
		});
	});
});

describe('formatMonthAbbreviation', () => {
	it('round-trips every month number to its abbreviation', () => {
		for (let month = 1; month <= 12; month++) {
			expect(parseMonthAbbreviation(formatMonthAbbreviation(month))).toBe(
				month
			);
		}
	});

	it('formats January as "jan"', () => {
		expect(formatMonthAbbreviation(1)).toBe('jan');
	});

	it('formats December as "dec"', () => {
		expect(formatMonthAbbreviation(12)).toBe('dec');
	});
});

describe('buildGroupSquashedMonthSummaryHref', () => {
	it('builds a group-scoped squashed-month summary href', () => {
		expect(buildGroupSquashedMonthSummaryHref(VIEWED_GROUP, 1)).toBe(
			'/group/alpha/summary/jan'
		);
	});

	it('returns an empty string for an undefined viewedGroup', () => {
		expect(buildGroupSquashedMonthSummaryHref(undefined, 1)).toBe('');
	});
});

describe('buildSpeciesSquashedMonthHref', () => {
	it('builds an ungrouped squashed-month species href', () => {
		expect(buildSpeciesSquashedMonthHref('Robin', 12)).toBe(
			'/species/Robin/dec'
		);
	});
});
