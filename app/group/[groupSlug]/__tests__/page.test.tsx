import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { redirect, notFound } from 'next/navigation';
import { getGroupCookie } from '@/app/actions/group-cookie';
import Page from '../page';

const { mockResolveGroupIdBySlug } = vi.hoisted(() => ({
	mockResolveGroupIdBySlug: vi.fn()
}));

vi.mock('@/lib/group-slug', () => ({
	resolveGroupIdBySlug: mockResolveGroupIdBySlug
}));

vi.mock('@/app/(routes)/page', () => ({
	default: vi.fn(({ viewedGroupId }: { viewedGroupId?: number }) => (
		<div data-testid="home-page">viewedGroupId: {viewedGroupId}</div>
	))
}));

const TEST_GROUP_SLUG = 'other-group';

function renderPage() {
	return Page({ params: Promise.resolve({ groupSlug: TEST_GROUP_SLUG }) });
}

describe('cross-group home page', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	describe('slug resolves to a group id', () => {
		it('renders Home with viewedGroupId set to the resolved numeric id, when it differs from the logged-in group', async () => {
			mockResolveGroupIdBySlug.mockResolvedValue(42);
			vi.mocked(getGroupCookie).mockResolvedValue(1);

			render(await renderPage());

			const rendered = await screen.findByTestId('home-page');
			expect(rendered.textContent).toContain('42');
		});

		it('redirects to "/" when the resolved id equals the logged-in group id', async () => {
			mockResolveGroupIdBySlug.mockResolvedValue(1);
			vi.mocked(getGroupCookie).mockResolvedValue(1);

			await renderPage();

			expect(vi.mocked(redirect)).toHaveBeenCalledWith('/');
		});
	});

	describe('slug does not resolve', () => {
		it('calls notFound() instead of rendering Home or redirecting', async () => {
			mockResolveGroupIdBySlug.mockResolvedValue(null);
			vi.mocked(notFound).mockImplementationOnce(() => {
				throw new Error('NEXT_NOT_FOUND');
			});

			await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
			expect(vi.mocked(redirect)).not.toHaveBeenCalled();
		});
	});
});
