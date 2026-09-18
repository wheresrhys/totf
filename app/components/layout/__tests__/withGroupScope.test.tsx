import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { notFound } from 'next/navigation';
import { withGroupScope } from '../withGroupScope';

const { mockResolveGroupIdBySlug } = vi.hoisted(() => ({
	mockResolveGroupIdBySlug: vi.fn()
}));

vi.mock('@/app/lib/group-slug', () => ({
	resolveGroupIdBySlug: mockResolveGroupIdBySlug
}));

// Local override of the global next/navigation mock (vitest.setup.tsx) — this
// helper needs notFound().
vi.mock('next/navigation', () => ({
	notFound: vi.fn()
}));

describe('withGroupScope', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	describe('a known groupSlug', () => {
		it('resolves the slug and renders renderPage with the { id, slug } viewedGroup', async () => {
			mockResolveGroupIdBySlug.mockResolvedValue(2);
			const renderPage = vi.fn(({ viewedGroup }) => (
				<div data-testid="child">{viewedGroup.id}</div>
			));
			const Page = withGroupScope(renderPage);

			render(await Page({ params: Promise.resolve({ groupSlug: 'alpha' }) }));

			expect(mockResolveGroupIdBySlug).toHaveBeenCalledWith('alpha');
			expect(screen.getByTestId('child').textContent).toBe('2');
			expect(renderPage).toHaveBeenCalledWith(
				expect.objectContaining({
					viewedGroup: { id: 2, slug: 'alpha' }
				})
			);
		});

		it('forwards the remaining (non-groupSlug) route params to renderPage', async () => {
			mockResolveGroupIdBySlug.mockResolvedValue(3);
			const renderPage = vi.fn(() => <div data-testid="child" />);
			const Page = withGroupScope<{ year: string; month: string }>(renderPage);

			render(
				await Page({
					params: Promise.resolve({
						groupSlug: 'beta',
						year: '2024',
						month: '06'
					})
				})
			);

			expect(renderPage).toHaveBeenCalledWith(
				expect.objectContaining({
					viewedGroup: { id: 3, slug: 'beta' },
					params: { year: '2024', month: '06' }
				})
			);
		});

		it('awaits an async renderPage before returning its element', async () => {
			mockResolveGroupIdBySlug.mockResolvedValue(4);
			const renderPage = vi.fn(async () => {
				await Promise.resolve();
				return <div data-testid="async-child" />;
			});
			const Page = withGroupScope(renderPage);

			render(await Page({ params: Promise.resolve({ groupSlug: 'gamma' }) }));

			// getByTestId throws if the async child never rendered.
			expect(screen.getByTestId('async-child')).toBeTruthy();
		});
	});

	describe('an unknown groupSlug', () => {
		it('calls notFound() and never invokes renderPage', async () => {
			mockResolveGroupIdBySlug.mockResolvedValue(null);
			vi.mocked(notFound).mockImplementationOnce(() => {
				throw new Error('NEXT_NOT_FOUND');
			});
			const renderPage = vi.fn(() => <div data-testid="child" />);
			const Page = withGroupScope(renderPage);

			await expect(
				Page({ params: Promise.resolve({ groupSlug: 'no-such-group' }) })
			).rejects.toThrow('NEXT_NOT_FOUND');

			expect(vi.mocked(notFound)).toHaveBeenCalled();
			expect(renderPage).not.toHaveBeenCalled();
		});
	});
});
