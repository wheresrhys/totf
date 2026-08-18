import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { notFound } from 'next/navigation';
import Page from '../page';

const { mockResolveGroupIdBySlug } = vi.hoisted(() => ({
	mockResolveGroupIdBySlug: vi.fn()
}));

vi.mock('@/lib/group-slug', () => ({
	resolveGroupIdBySlug: mockResolveGroupIdBySlug
}));

vi.mock('@/app/(routes)/effort/page', () => ({
	default: vi.fn(({ viewedGroupId }: { viewedGroupId?: number }) => (
		<div data-testid="pay-off-page">viewedGroupId: {viewedGroupId}</div>
	))
}));

const TEST_GROUP_SLUG = 'test-group';

function renderPage() {
	return Page({ params: Promise.resolve({ groupSlug: TEST_GROUP_SLUG }) });
}

describe('cross-group effort page', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	describe('slug resolves to a group id', () => {
		it('renders PayOffPage with viewedGroupId set to the resolved numeric id', async () => {
			mockResolveGroupIdBySlug.mockResolvedValue(42);

			render(await renderPage());

			const rendered = await screen.findByTestId('pay-off-page');
			expect(rendered.textContent).toContain('42');
		});
	});

	describe('slug does not resolve', () => {
		it('calls notFound() when the slug does not resolve', async () => {
			mockResolveGroupIdBySlug.mockResolvedValue(null);
			vi.mocked(notFound).mockImplementationOnce(() => {
				throw new Error('NEXT_NOT_FOUND');
			});

			await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
		});
	});
});
