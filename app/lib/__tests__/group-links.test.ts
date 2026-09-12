import { describe, it, expect } from 'vitest';
import { buildGroupSummaryHref, buildGroupSessionHref } from '../group-links';
import type { ViewedGroup } from '../group-slug';

const viewedGroup: ViewedGroup = { id: 1, slug: 'alpha' };

describe('buildGroupSummaryHref', () => {
	describe('Usual', () => {
		it('builds a group-scoped href for a year and month', () => {
			expect(buildGroupSummaryHref(viewedGroup, { year: 2026, month: 3 })).toBe(
				'/group/alpha/summary/2026/3'
			);
		});
	});

	describe('Structure', () => {
		it('omits the month segment when period.month is undefined', () => {
			expect(buildGroupSummaryHref(viewedGroup, { year: 2026 })).toBe(
				'/group/alpha/summary/2026'
			);
		});
	});

	describe('Edge', () => {
		it('returns an empty string when viewedGroup is undefined', () => {
			expect(buildGroupSummaryHref(undefined, { year: 2026, month: 3 })).toBe(
				''
			);
		});

		it('returns an empty string when period is undefined', () => {
			expect(buildGroupSummaryHref(viewedGroup, undefined)).toBe('');
		});
	});
});

describe('buildGroupSessionHref', () => {
	describe('Usual', () => {
		it('builds a group-scoped session href for a date', () => {
			expect(buildGroupSessionHref(viewedGroup, '2026-03-15')).toBe(
				'/group/alpha/session/2026-03-15'
			);
		});
	});

	describe('Edge', () => {
		it('returns an empty string when viewedGroup is undefined', () => {
			expect(buildGroupSessionHref(undefined, '2026-03-15')).toBe('');
		});
	});
});
