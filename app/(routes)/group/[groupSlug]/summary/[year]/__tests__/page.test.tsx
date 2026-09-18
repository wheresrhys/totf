import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { notFound } from 'next/navigation';
import GroupSummaryYearPage from '../page';

const { mockResolveGroupIdBySlug } = vi.hoisted(() => ({
	mockResolveGroupIdBySlug: vi.fn()
}));

vi.mock('@/app/lib/group-slug', () => ({
	resolveGroupIdBySlug: mockResolveGroupIdBySlug
}));

vi.mock('next/navigation', () => ({
	notFound: vi.fn()
}));

vi.mock('@/app/(routes)/summary/[year]/page', () => ({
	default: vi.fn(() => <div data-testid="mock-year-summary-page" />)
}));

import YearSummaryPage from '@/app/(routes)/summary/[year]/page';

describe('GroupSummaryYearPage', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	describe('a known groupSlug', () => {
		beforeEach(() => {
			mockResolveGroupIdBySlug.mockResolvedValue(2);
		});

		it('delegates to the year summary page with the resolved viewedGroup and year param', async () => {
			render(
				await GroupSummaryYearPage({
					params: Promise.resolve({
						groupSlug: 'viewed-group-slug',
						year: '2025'
					})
				})
			);
			screen.getByTestId('mock-year-summary-page');

			expect(mockResolveGroupIdBySlug).toHaveBeenCalledWith(
				'viewed-group-slug'
			);
			expect(vi.mocked(YearSummaryPage).mock.calls[0][0]).toEqual(
				expect.objectContaining({
					viewedGroup: { id: 2, slug: 'viewed-group-slug' }
				})
			);
			await expect(
				vi.mocked(YearSummaryPage).mock.calls[0][0].params
			).resolves.toEqual({ year: '2025' });
		});

		// #804: the year summary page's new `searchParams` prop is optional
		// precisely so this call site (which `withGroupScope` never threads
		// it through) keeps rendering/type-checking unaffected.
		it('delegates without a searchParams prop, since withGroupScope does not thread one through', async () => {
			render(
				await GroupSummaryYearPage({
					params: Promise.resolve({
						groupSlug: 'viewed-group-slug',
						year: '2025'
					})
				})
			);
			screen.getByTestId('mock-year-summary-page');
			expect(vi.mocked(YearSummaryPage).mock.calls[0][0]).not.toHaveProperty(
				'searchParams'
			);
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
				GroupSummaryYearPage({
					params: Promise.resolve({
						groupSlug: 'no-such-group',
						year: '2025'
					})
				})
			).rejects.toThrow('NEXT_NOT_FOUND');

			expect(vi.mocked(notFound)).toHaveBeenCalled();
			expect(vi.mocked(YearSummaryPage)).not.toHaveBeenCalled();
		});
	});
});
