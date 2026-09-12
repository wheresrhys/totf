import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	within,
	fireEvent
} from '@testing-library/react';
import Page, { fetchSpeciesYearMonthPageContent } from '../page';
import spPageSnapshot from '@/test-fixtures/snapshots/fetchSpPageData.alpha.robin.json';
import type { FullFatPageData } from '@/app/(routes)/species/[speciesName]/PageContent';

const { mockGetAuthenticatedSupabaseClient, mockFetchPageOfBirds } = vi.hoisted(
	() => ({
		mockGetAuthenticatedSupabaseClient: vi.fn(),
		mockFetchPageOfBirds: vi.fn()
	})
);

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

vi.mock('@/app/actions/sp-data', () => ({
	fetchPageOfBirds: mockFetchPageOfBirds
}));

vi.mock('@/app/components/pages/species/SpIndividualsTab', () => ({
	SpIndividualsTab: () => <div data-testid="sp-individuals-tab" />
}));

vi.mock('@/app/components/pages/species/SpNotableRetrapsTab', () => ({
	SpNotableRetrapsTab: () => <div data-testid="sp-notable-retraps-tab" />
}));

vi.mock('@/app/components/pages/species/SpBusiestSessionsTab', () => ({
	SpBusiestSessionsTab: () => <div data-testid="sp-busiest-sessions-tab" />
}));

vi.mock('@/app/components/pages/species/SpStatsHistoryTab', () => ({
	SpStatsHistoryTab: () => <div data-testid="sp-stats-history-tab" />
}));

vi.mock('@/app/components/pages/species/SpWeightWingTab', () => ({
	SpWeightWingTab: () => <div data-testid="sp-weight-wing-tab" />
}));

vi.mock('@/app/components/pages/species/SpSessionTotalsTab', () => ({
	SpSessionTotalsTab: () => <div data-testid="sp-session-totals-tab" />
}));

const { birds, speciesStats } = spPageSnapshot as unknown as FullFatPageData;

function makeSpeciesClient(
	speciesId: number | null = spPageSnapshot.speciesId
) {
	const fromChain = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		single: vi.fn().mockReturnThis(),
		then: (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
			Promise.resolve(
				speciesId === null
					? { data: null, error: { message: 'no rows' } }
					: { data: { id: speciesId }, error: null }
			).then(resolve)
	};
	const rpcThenable = {
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data: [speciesStats], error: null }).then(resolve)
	};
	return {
		from: vi.fn().mockReturnValue(fromChain),
		rpc: vi.fn().mockReturnValue(rpcThenable)
	};
}

function renderMonthPage(
	speciesName = 'Robin',
	year = '2026',
	month = '08',
	tabId?: string
) {
	return Page({
		params: Promise.resolve({ speciesName, year, month }),
		...(tabId === undefined ? {} : { searchParams: Promise.resolve({ tabId }) })
	});
}

describe('/species/[speciesName]/[year]/[month]', () => {
	afterEach(() => {
		cleanup();
		mockFetchPageOfBirds.mockReset();
	});

	describe('Usual: species with encounters in the month', () => {
		beforeEach(() => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeSpeciesClient());
			mockFetchPageOfBirds.mockResolvedValue(birds);
		});

		it('renders the "{species} {long month} {year}" heading with an "All time" link', async () => {
			render(await renderMonthPage());
			await screen.findByTestId('sp-session-totals-tab');
			const heading = screen.getByRole('heading', { level: 1 });
			expect(heading.textContent).toContain('Robin August 2026');
			expect(
				within(heading)
					.getByRole('link', { name: 'All time' })
					.getAttribute('href')
			).toBe('/species/Robin');
		});

		it('renders the species tabs and stats for the scoped data', async () => {
			render(await renderMonthPage());
			await screen.findByTestId('sp-session-totals-tab');
			expect(screen.getByRole('button', { name: 'Bird list' })).toBeDefined();
		});

		it('shows neither a "Year totals" nor a "Month totals" tab', async () => {
			render(await renderMonthPage());
			await screen.findByTestId('sp-session-totals-tab');
			expect(screen.queryByRole('button', { name: 'Year totals' })).toBeNull();
			expect(screen.queryByRole('button', { name: 'Month totals' })).toBeNull();
		});

		it("does not show the all-time 'Month totals' tab on the month-scoped species page", async () => {
			render(await renderMonthPage());
			await screen.findByTestId('sp-session-totals-tab');
			expect(screen.queryByRole('button', { name: 'Month totals' })).toBeNull();
			expect(screen.queryByTestId('sp-combined-month-totals-tab')).toBeNull();
		});

		describe('tab order and defaults (month-scoped page)', () => {
			it('renders tab buttons in the order Session totals, Highlights, Biometrics, Population, Bird list (no Year/Month totals)', async () => {
				render(await renderMonthPage());
				await screen.findByTestId('sp-session-totals-tab');
				const labels = within(screen.getByRole('tablist'))
					.getAllByRole('button')
					.map((button) => button.textContent);
				expect(labels).toEqual([
					'Session totals',
					'Highlights',
					'Biometrics',
					'Population',
					'Bird list'
				]);
			});

			it('renders SpSessionTotalsTab on initial render without clicking (eager default)', async () => {
				render(await renderMonthPage());
				await screen.findByTestId('sp-session-totals-tab');
			});

			it('shows a "Session totals" button on the month-scoped page', async () => {
				render(await renderMonthPage());
				await screen.findByTestId('sp-session-totals-tab');
				expect(
					screen.getByRole('button', { name: 'Session totals' })
				).toBeDefined();
			});

			it('renders SpSessionTotalsTab after clicking the Session totals button', async () => {
				render(await renderMonthPage());
				await screen.findByTestId('sp-session-totals-tab');
				fireEvent.click(screen.getByRole('button', { name: 'Session totals' }));
				await screen.findByTestId('sp-session-totals-tab');
			});

			it('does not mount SpIndividualsTab until the Bird list tab is clicked', async () => {
				render(await renderMonthPage());
				await screen.findByTestId('sp-session-totals-tab');
				expect(screen.queryByTestId('sp-individuals-tab')).toBeNull();
				fireEvent.click(screen.getByRole('button', { name: 'Bird list' }));
				await screen.findByTestId('sp-individuals-tab');
			});
		});
	});

	describe('?tabId= query param (#803)', () => {
		beforeEach(() => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeSpeciesClient());
			mockFetchPageOfBirds.mockResolvedValue(birds);
		});

		it('with no tabId search param, the month-scoped default (Session totals) renders unchanged', async () => {
			render(await renderMonthPage());
			await screen.findByTestId('sp-session-totals-tab');
			expect(
				screen
					.getByRole('button', { name: 'Session totals' })
					.getAttribute('aria-current')
			).toBe('true');
		});

		it('?tabId=bird-list wins over the month-scoped route’s Session totals default', async () => {
			render(await renderMonthPage('Robin', '2026', '08', 'bird-list'));
			await screen.findByTestId('sp-individuals-tab');
			expect(screen.queryByTestId('sp-session-totals-tab')).toBeNull();
			expect(
				screen
					.getByRole('button', { name: 'Bird list' })
					.getAttribute('aria-current')
			).toBe('true');
		});

		it('?tabId=not-a-real-tab falls back to the month-scoped default, with no crash and no blank pane', async () => {
			render(await renderMonthPage('Robin', '2026', '08', 'not-a-real-tab'));
			await screen.findByTestId('sp-session-totals-tab');
			expect(
				screen
					.getByRole('button', { name: 'Session totals' })
					.getAttribute('aria-current')
			).toBe('true');
		});
	});

	describe('date-range plumbing', () => {
		beforeEach(() => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeSpeciesClient());
			mockFetchPageOfBirds.mockResolvedValue(birds);
		});

		it("threads the month's first/last calendar day into fetchPageOfBirds", async () => {
			await fetchSpeciesYearMonthPageContent(
				{ speciesName: 'Robin', year: '2026', month: '08' },
				1
			);
			expect(mockFetchPageOfBirds).toHaveBeenCalledWith(
				spPageSnapshot.speciesId,
				1,
				0,
				'2026-08-01',
				'2026-08-31'
			);
		});

		it('computes the correct bounds for a shorter month (April)', async () => {
			await fetchSpeciesYearMonthPageContent(
				{ speciesName: 'Robin', year: '2026', month: '04' },
				1
			);
			expect(mockFetchPageOfBirds).toHaveBeenCalledWith(
				spPageSnapshot.speciesId,
				1,
				0,
				'2026-04-01',
				'2026-04-30'
			);
		});
	});

	describe('Structure: species with zero encounters in the month', () => {
		beforeEach(() => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeSpeciesClient());
			mockFetchPageOfBirds.mockResolvedValue([]);
		});

		it('renders the not-authorised/no-data message but keeps the scoped heading', async () => {
			render(await renderMonthPage());
			await screen.findByText(
				'Not authorised to view any encounter data for this species'
			);
			const heading = screen.getByRole('heading', { level: 1 });
			expect(heading.textContent).toContain('Robin August 2026');
			expect(
				within(heading).getByRole('link', { name: 'All time' })
			).toBeDefined();
			// not-authorised/zero-encounters branch renders no tab buttons at all
			expect(screen.queryByRole('tablist')).toBeNull();
			expect(
				screen.queryByRole('button', { name: 'Session totals' })
			).toBeNull();
			expect(screen.queryByRole('button', { name: 'Bird list' })).toBeNull();
		});
	});

	describe('Edge: unknown species', () => {
		beforeEach(() => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(
				makeSpeciesClient(null)
			);
			mockFetchPageOfBirds.mockResolvedValue([]);
		});

		it('rejects when the species lookup finds no row (surfacing the not-found path)', async () => {
			await expect(
				fetchSpeciesYearMonthPageContent(
					{ speciesName: 'Nonexistent', year: '2026', month: '08' },
					1
				)
			).rejects.toThrow();
		});
	});
});
