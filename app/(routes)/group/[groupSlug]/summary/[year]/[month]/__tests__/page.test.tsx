import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { notFound } from 'next/navigation';
import GroupSummaryYearMonthPage from '../page';

const { mockResolveGroupIdBySlug } = vi.hoisted(() => ({
	mockResolveGroupIdBySlug: vi.fn()
}));

vi.mock('@/app/lib/group-slug', () => ({
	resolveGroupIdBySlug: mockResolveGroupIdBySlug
}));

vi.mock('next/navigation', () => ({
	notFound: vi.fn()
}));

vi.mock('@/app/(routes)/summary/[year]/[month]/page', () => ({
	default: vi.fn(() => <div data-testid="mock-year-month-summary-page" />)
}));

import YearMonthSummaryPage from '@/app/(routes)/summary/[year]/[month]/page';

describe('GroupSummaryYearMonthPage', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	describe('a known groupSlug', () => {
		beforeEach(() => {
			mockResolveGroupIdBySlug.mockResolvedValue(2);
		});

		it('delegates to the year/month summary page with the resolved viewedGroup and year/month params', async () => {
			render(
				await GroupSummaryYearMonthPage({
					params: Promise.resolve({
						groupSlug: 'viewed-group-slug',
						year: '2025',
						month: '3'
					})
				})
			);
			screen.getByTestId('mock-year-month-summary-page');

			expect(mockResolveGroupIdBySlug).toHaveBeenCalledWith(
				'viewed-group-slug'
			);
			expect(vi.mocked(YearMonthSummaryPage).mock.calls[0][0]).toEqual(
				expect.objectContaining({
					viewedGroup: { id: 2, slug: 'viewed-group-slug' }
				})
			);
			await expect(
				vi.mocked(YearMonthSummaryPage).mock.calls[0][0].params
			).resolves.toEqual({ year: '2025', month: '3' });
		});

		// #804: the year/month summary page's new `searchParams` prop is
		// optional precisely so this call site (which `withGroupScope` never
		// threads it through) keeps rendering/type-checking unaffected.
		it('delegates without a searchParams prop, since withGroupScope does not thread one through', async () => {
			render(
				await GroupSummaryYearMonthPage({
					params: Promise.resolve({
						groupSlug: 'viewed-group-slug',
						year: '2025',
						month: '3'
					})
				})
			);
			screen.getByTestId('mock-year-month-summary-page');
			expect(
				vi.mocked(YearMonthSummaryPage).mock.calls[0][0]
			).not.toHaveProperty('searchParams');
		});
	});

	describe('an unknown groupSlug', () => {
		beforeEach(() => {
			mockResolveGroupIdBySlug.mockResolvedValue(null);
			vi.mocked(notFound).mockImplementationOnce(() => {
				throw new Error('NEXT_NOT_FOUND');
			});
		});

		it('calls notFound() instead of rendering the route page', async () => {
			await expect(
				GroupSummaryYearMonthPage({
					params: Promise.resolve({
						groupSlug: 'no-such-group',
						year: '2025',
						month: '3'
					})
				})
			).rejects.toThrow('NEXT_NOT_FOUND');

			expect(vi.mocked(notFound)).toHaveBeenCalled();
			expect(vi.mocked(YearMonthSummaryPage)).not.toHaveBeenCalled();
		});
	});
});
