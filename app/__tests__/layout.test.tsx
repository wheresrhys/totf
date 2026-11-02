import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { getGroupCookie } from '@/app/actions/group-cookie';
import { AuthorisedView } from '../layout';

const {
	mockFetchRingingGroups,
	mockFetchSpeciesNames,
	mockGetRequestPathname,
	mockResolvePublicPageViewedGroupId,
	mockShouldExpandBirdNavByDefault
} = vi.hoisted(() => ({
	mockFetchRingingGroups: vi.fn(),
	mockFetchSpeciesNames: vi.fn(),
	mockGetRequestPathname: vi.fn(),
	mockResolvePublicPageViewedGroupId: vi.fn(),
	mockShouldExpandBirdNavByDefault: vi.fn()
}));

vi.mock('@/app/lib/global-nav-data', () => ({
	fetchRingingGroups: mockFetchRingingGroups,
	fetchSpeciesNames: mockFetchSpeciesNames
}));

vi.mock('@/app/lib/request-pathname', () => ({
	getRequestPathname: mockGetRequestPathname
}));

vi.mock('@/app/lib/global-nav-expansion', () => ({
	shouldExpandBirdNavByDefault: mockShouldExpandBirdNavByDefault
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
		mockFetchRingingGroups.mockResolvedValue(mockGroups);
		mockFetchSpeciesNames.mockResolvedValue([]);
		vi.mocked(getGroupCookie).mockResolvedValue(1);
		mockGetRequestPathname.mockResolvedValue(null);
		mockResolvePublicPageViewedGroupId.mockResolvedValue(null);
		mockShouldExpandBirdNavByDefault.mockReturnValue(false);
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

		it('resolves pathname (for the nav-expansion default) but never needs public-page access', async () => {
			await AuthorisedView({ children: <p>child content</p> });
			expect(mockGetRequestPathname).toHaveBeenCalled();
			expect(mockResolvePublicPageViewedGroupId).not.toHaveBeenCalled();
		});

		it("fetches the selected group's species and passes them through to the nav's species-by-letter panel", async () => {
			mockFetchSpeciesNames.mockResolvedValue([
				{ id: 1, species_name: 'Robin' }
			]);
			render(await AuthorisedView({ children: <p>child content</p> }));
			expect(mockFetchSpeciesNames).toHaveBeenCalledWith(
				mockGroups[0],
				expect.anything()
			);
			expect(
				screen.getByRole('button', { name: 'Show species starting with R' })
			).toBeDefined();
		});

		it('expands the search/species panel when the resolved pathname wants it expanded by default', async () => {
			mockGetRequestPathname.mockResolvedValue('/');
			mockShouldExpandBirdNavByDefault.mockReturnValue(true);
			const { container } = render(
				await AuthorisedView({ children: <p>child content</p> })
			);
			expect(mockShouldExpandBirdNavByDefault).toHaveBeenCalledWith('/');
			const wrapper = container.querySelector('#ring-search-form-wrapper');
			expect(wrapper?.classList.contains('hidden')).toBe(false);
		});

		it('leaves the search/species panel collapsed otherwise', async () => {
			mockGetRequestPathname.mockResolvedValue('/sessions');
			mockShouldExpandBirdNavByDefault.mockReturnValue(false);
			const { container } = render(
				await AuthorisedView({ children: <p>child content</p> })
			);
			expect(mockShouldExpandBirdNavByDefault).toHaveBeenCalledWith(
				'/sessions'
			);
			const wrapper = container.querySelector('#ring-search-form-wrapper');
			expect(wrapper?.classList.contains('hidden')).toBe(true);
		});
	});
});
