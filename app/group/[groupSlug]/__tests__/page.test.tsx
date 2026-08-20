import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { redirect, notFound } from 'next/navigation';
import { getGroupCookie } from '@/app/actions/group-cookie';
import CrossGroupHome from '../page';

const { mockResolveGroupIdBySlug } = vi.hoisted(() => ({
	mockResolveGroupIdBySlug: vi.fn()
}));

vi.mock('@/lib/group-slug', () => ({
	resolveGroupIdBySlug: mockResolveGroupIdBySlug
}));

// Local override of the global next/navigation mock (vitest.setup.tsx) — this
// wrapper now also needs notFound(), alongside the redirect() the global mock
// already provides.
vi.mock('next/navigation', () => ({
	redirect: vi.fn(),
	notFound: vi.fn()
}));

vi.mock('@/app/(routes)/page', () => ({
	default: vi.fn(() => <div data-testid="mock-home" />)
}));

import Home from '@/app/(routes)/page';

function renderPage(groupSlug: string) {
	return CrossGroupHome({ params: Promise.resolve({ groupSlug }) });
}

describe('cross-group home page', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	describe('viewing a different group than the logged-in one', () => {
		beforeEach(() => {
			vi.mocked(getGroupCookie).mockResolvedValue(1);
			mockResolveGroupIdBySlug.mockResolvedValue(2);
		});

		it('passes viewedGroup matching { id, slug } resolved from resolveGroupIdBySlug to the underlying route page', async () => {
			render(await renderPage('viewed-group-slug'));
			screen.getByTestId('mock-home');

			expect(mockResolveGroupIdBySlug).toHaveBeenCalledWith(
				'viewed-group-slug'
			);
			expect(vi.mocked(Home).mock.calls[0][0]).toEqual(
				expect.objectContaining({
					viewedGroup: { id: 2, slug: 'viewed-group-slug' }
				})
			);
		});
	});

	describe('an unknown groupSlug', () => {
		beforeEach(() => {
			vi.mocked(getGroupCookie).mockResolvedValue(1);
			mockResolveGroupIdBySlug.mockResolvedValue(null);
			vi.mocked(notFound).mockImplementationOnce(() => {
				throw new Error('NEXT_NOT_FOUND');
			});
		});

		it('calls notFound() instead of rendering the route page', async () => {
			await expect(renderPage('no-such-group')).rejects.toThrow(
				'NEXT_NOT_FOUND'
			);

			expect(vi.mocked(notFound)).toHaveBeenCalled();
			expect(vi.mocked(Home)).not.toHaveBeenCalled();
		});
	});

	describe('groupSlug resolves to the logged-in group id', () => {
		beforeEach(() => {
			vi.mocked(getGroupCookie).mockResolvedValue(1);
			mockResolveGroupIdBySlug.mockResolvedValue(1);
			vi.mocked(redirect).mockImplementationOnce(() => {
				throw new Error('NEXT_REDIRECT');
			});
		});

		it('redirects to "/" without rendering the route page (regression, unchanged by this ticket)', async () => {
			await expect(renderPage('own-group-slug')).rejects.toThrow(
				'NEXT_REDIRECT'
			);

			expect(vi.mocked(redirect)).toHaveBeenCalledWith('/');
			expect(vi.mocked(Home)).not.toHaveBeenCalled();
		});
	});
});
