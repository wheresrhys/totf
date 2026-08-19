import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { redirect } from 'next/navigation';
import { getGroupCookie } from '@/app/actions/group-cookie';
import CrossGroupHome from '../page';

const { mockResolveGroupSlugById } = vi.hoisted(() => ({
	mockResolveGroupSlugById: vi.fn()
}));

vi.mock('@/lib/group-slug', () => ({
	resolveGroupSlugById: mockResolveGroupSlugById
}));

vi.mock('@/app/(routes)/page', () => ({
	default: vi.fn(() => <div data-testid="mock-home" />)
}));

import Home from '@/app/(routes)/page';

function renderPage(groupId: string) {
	return CrossGroupHome({ params: Promise.resolve({ groupId }) });
}

describe('cross-group home page', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	describe('viewing a different group than the logged-in one', () => {
		beforeEach(() => {
			vi.mocked(getGroupCookie).mockResolvedValue(1);
			mockResolveGroupSlugById.mockResolvedValue('viewed-group-slug');
		});

		it('passes viewedGroup matching { id, slug } resolved from resolveGroupSlugById to the underlying route page', async () => {
			render(await renderPage('2'));
			screen.getByTestId('mock-home');

			expect(mockResolveGroupSlugById).toHaveBeenCalledWith(2);
			expect(vi.mocked(Home).mock.calls[0][0]).toEqual(
				expect.objectContaining({
					viewedGroupId: 2,
					viewedGroup: { id: 2, slug: 'viewed-group-slug' }
				})
			);
		});
	});

	describe('viewedGroupId equals the logged-in group id', () => {
		beforeEach(() => {
			vi.mocked(getGroupCookie).mockResolvedValue(1);
			vi.mocked(redirect).mockImplementationOnce(() => {
				throw new Error('NEXT_REDIRECT');
			});
		});

		it('redirects to "/" without resolving a slug or rendering the route page (regression, unchanged by this ticket)', async () => {
			await expect(renderPage('1')).rejects.toThrow('NEXT_REDIRECT');

			expect(vi.mocked(redirect)).toHaveBeenCalledWith('/');
			expect(mockResolveGroupSlugById).not.toHaveBeenCalled();
			expect(vi.mocked(Home)).not.toHaveBeenCalled();
		});
	});
});
