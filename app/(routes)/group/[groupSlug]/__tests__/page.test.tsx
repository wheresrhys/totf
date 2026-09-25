import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { redirect } from 'next/navigation';
import { getGroupCookie } from '@/app/actions/group-cookie';
import GroupHomePage from '../page';
import { describeGroupScopeDelegation } from '@/app/__tests__/helpers/group-scope-delegation';

const { mockResolveGroupIdBySlug } = vi.hoisted(() => ({
	mockResolveGroupIdBySlug: vi.fn()
}));

vi.mock('@/app/lib/group-slug', () => ({
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

import HomePage from '@/app/(routes)/page';

function renderPage(groupSlug: string) {
	return GroupHomePage({ params: Promise.resolve({ groupSlug }) });
}

describe('cross-group home page', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	describeGroupScopeDelegation({
		renderGroupPage: ({ groupSlug }) => renderPage(groupSlug),
		mockResolveGroupIdBySlug,
		DelegatePage: HomePage,
		testId: 'mock-home',
		beforeEachSetup: () => {
			vi.mocked(getGroupCookie).mockResolvedValue(1);
		}
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
			expect(vi.mocked(HomePage)).not.toHaveBeenCalled();
		});
	});
});
