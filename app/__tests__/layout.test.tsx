import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { getGroupCookie } from '@/app/actions/group-cookie';
import { AuthorisedView } from '../layout';

const {
	mockFrom,
	mockOrder,
	mockGetRequestPathname,
	mockResolvePublicPageViewedGroupId
} = vi.hoisted(() => {
	const mockOrder = vi.fn();
	const mockSelect = vi.fn(() => ({ order: mockOrder }));
	const mockFrom = vi.fn(() => ({ select: mockSelect }));
	return {
		mockFrom,
		mockOrder,
		mockGetRequestPathname: vi.fn(),
		mockResolvePublicPageViewedGroupId: vi.fn()
	};
});

vi.mock('@/lib/supabase', () => ({
	supabase: { from: mockFrom },
	catchSupabaseErrors: ({
		data,
		error
	}: {
		data: unknown;
		error: { message: string } | null;
	}) => {
		if (error) throw new Error(`Supabase error: ${error.message}`);
		return data;
	}
}));

vi.mock('@/app/lib/request-pathname', () => ({
	getRequestPathname: mockGetRequestPathname
}));

vi.mock('@/app/lib/auth/public-group-access', () => ({
	resolvePublicPageViewedGroupId: mockResolvePublicPageViewedGroupId
}));

vi.mock('@/app/actions/login', () => ({
	loginGroup: vi.fn()
}));

vi.mock('@/app/actions/logout', () => ({
	logout: vi.fn()
}));

const mockGroups = [{ id: 1, group_name: 'Alpha' }];

describe('root layout', () => {
	beforeEach(() => {
		mockOrder.mockResolvedValue({ data: mockGroups, error: null });
		vi.mocked(getGroupCookie).mockResolvedValue(1);
		mockGetRequestPathname.mockResolvedValue(null);
		mockResolvePublicPageViewedGroupId.mockResolvedValue(null);
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	describe('unauthenticated (getGroupCookie returns null)', () => {
		beforeEach(() => {
			vi.mocked(getGroupCookie).mockResolvedValue(null);
		});

		it('renders LoginModal', async () => {
			render(await AuthorisedView({ children: <p>child content</p> }));
			expect(screen.getByRole('button', { name: 'Login' })).toBeDefined();
		});

		it('does not render the main nav', async () => {
			render(await AuthorisedView({ children: <p>child content</p> }));
			expect(screen.queryByRole('navigation')).toBeNull();
		});

		describe('a request for a public group page', () => {
			beforeEach(() => {
				mockGetRequestPathname.mockResolvedValue('/group/alpha/summary');
				mockResolvePublicPageViewedGroupId.mockResolvedValue(1);
			});

			it('renders children', async () => {
				render(await AuthorisedView({ children: <p>child content</p> }));
				expect(screen.getByText('child content')).toBeDefined();
			});

			it('renders the main nav in read-only mode, showing the viewed group name', async () => {
				render(await AuthorisedView({ children: <p>child content</p> }));
				expect(screen.getByRole('navigation')).toBeDefined();
				expect(screen.getByText('Alpha')).toBeDefined();
			});

			it('does not render aspects that require a logged-in group', async () => {
				render(await AuthorisedView({ children: <p>child content</p> }));
				expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
				expect(screen.queryByRole('link', { name: 'Import data' })).toBeNull();
				expect(screen.queryByRole('link', { name: 'Sessions' })).toBeNull();
			});

			it('does not render LoginModal', async () => {
				render(await AuthorisedView({ children: <p>child content</p> }));
				expect(screen.queryByRole('button', { name: 'Login' })).toBeNull();
			});
		});

		describe('a request that is not a public group page', () => {
			beforeEach(() => {
				mockGetRequestPathname.mockResolvedValue('/group/alpha/effort');
				mockResolvePublicPageViewedGroupId.mockResolvedValue(null);
			});

			it('renders LoginModal instead of children', async () => {
				render(await AuthorisedView({ children: <p>child content</p> }));
				expect(screen.queryByText('child content')).toBeNull();
				expect(screen.getByRole('button', { name: 'Login' })).toBeDefined();
			});
		});
	});

	describe('authenticated (getGroupCookie returns 1)', () => {
		it('renders children', async () => {
			render(await AuthorisedView({ children: <p>child content</p> }));
			expect(screen.getByText('child content')).toBeDefined();
		});

		it('renders the main nav', async () => {
			render(await AuthorisedView({ children: <p>child content</p> }));
			expect(screen.getByRole('navigation')).toBeDefined();
		});

		it('does not render LoginModal', async () => {
			render(await AuthorisedView({ children: <p>child content</p> }));
			expect(screen.queryByRole('button', { name: 'Login' })).toBeNull();
		});

		it('does not need to resolve pathname or public-page access at all', async () => {
			await AuthorisedView({ children: <p>child content</p> });
			expect(mockGetRequestPathname).not.toHaveBeenCalled();
			expect(mockResolvePublicPageViewedGroupId).not.toHaveBeenCalled();
		});
	});
});
