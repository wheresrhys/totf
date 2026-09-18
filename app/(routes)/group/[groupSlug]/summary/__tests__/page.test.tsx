import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { notFound } from 'next/navigation';
import GroupSummaryPage from '../page';

const { mockResolveGroupIdBySlug } = vi.hoisted(() => ({
	mockResolveGroupIdBySlug: vi.fn()
}));

vi.mock('@/app/lib/group-slug', () => ({
	resolveGroupIdBySlug: mockResolveGroupIdBySlug
}));

// Local override of the global next/navigation mock (vitest.setup.tsx) — this
// wrapper also needs notFound().
vi.mock('next/navigation', () => ({
	notFound: vi.fn()
}));

vi.mock('@/app/(routes)/summary/page', () => ({
	default: vi.fn(() => <div data-testid="mock-summary-page" />)
}));

import AllTimeSummaryPage from '@/app/(routes)/summary/page';

describe('GroupSummaryPage', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	describe('a known groupSlug', () => {
		beforeEach(() => {
			mockResolveGroupIdBySlug.mockResolvedValue(2);
		});

		it('delegates to the top-level summary page with the resolved viewedGroup', async () => {
			render(
				await GroupSummaryPage({
					params: Promise.resolve({ groupSlug: 'viewed-group-slug' })
				})
			);
			screen.getByTestId('mock-summary-page');

			expect(mockResolveGroupIdBySlug).toHaveBeenCalledWith(
				'viewed-group-slug'
			);
			expect(vi.mocked(AllTimeSummaryPage).mock.calls[0][0]).toEqual(
				expect.objectContaining({
					viewedGroup: { id: 2, slug: 'viewed-group-slug' }
				})
			);
		});

		// #804: the top-level summary page's new `searchParams` prop is
		// optional precisely so this call site (which `withGroupScope` never
		// threads it through) keeps rendering/type-checking unaffected.
		it('delegates without a searchParams prop, since withGroupScope does not thread one through', async () => {
			render(
				await GroupSummaryPage({
					params: Promise.resolve({ groupSlug: 'viewed-group-slug' })
				})
			);
			screen.getByTestId('mock-summary-page');
			expect(vi.mocked(AllTimeSummaryPage).mock.calls[0][0]).not.toHaveProperty(
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
				GroupSummaryPage({
					params: Promise.resolve({ groupSlug: 'no-such-group' })
				})
			).rejects.toThrow('NEXT_NOT_FOUND');

			expect(vi.mocked(notFound)).toHaveBeenCalled();
			expect(vi.mocked(AllTimeSummaryPage)).not.toHaveBeenCalled();
		});
	});
});
