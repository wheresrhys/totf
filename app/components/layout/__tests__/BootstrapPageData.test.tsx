import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

vi.unmock('@/app/components/layout/BootstrapPageData');

const { mockGetGroupCookie, mockResolveGroupSlugById } = vi.hoisted(() => ({
	mockGetGroupCookie: vi.fn(),
	mockResolveGroupSlugById: vi.fn()
}));

vi.mock('@/app/actions/group-cookie', () => ({
	getGroupCookie: mockGetGroupCookie
}));

vi.mock('@/lib/group-slug', () => ({
	resolveGroupSlugById: mockResolveGroupSlugById
}));

vi.mock('next/server', () => ({
	connection: vi.fn().mockResolvedValue(undefined)
}));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('BootstrapPageData — viewedGroupSlug resolution', () => {
	it('resolves to null (rather than crashing) when resolveGroupSlugById finds no row', async () => {
		mockGetGroupCookie.mockResolvedValue(1);
		mockResolveGroupSlugById.mockResolvedValue(null);
		const { LoadWithData } = await import('../BootstrapPageData');

		const element = await LoadWithData({
			getCacheKeys: () => ['test'],
			dataFetcher: async () => ({ ok: true }),
			PageComponent: ({ viewedGroupSlug }) => (
				<div data-testid="page">slug: {String(viewedGroupSlug)}</div>
			)
		});

		render(element);
		const rendered = await screen.findByTestId('page');
		expect(rendered.textContent).toBe('slug: null');
	});
});
