import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	within,
	fireEvent
} from '@testing-library/react';
import Page, { fetchSpeciesYearPageContent } from '../page';
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

vi.mock('@/app/components/pages/species/SpMonthTotalsTab', () => ({
	SpMonthTotalsTab: () => <div data-testid="sp-month-totals-tab" />
}));

vi.mock('@/app/components/pages/species/SpCombinedMonthTotalsTab', () => ({
	SpCombinedMonthTotalsTab: () => (
		<div data-testid="sp-combined-month-totals-tab" />
	)
}));

vi.mock('@/app/components/pages/species/SpSessionTotalsTab', () => ({
	SpSessionTotalsTab: () => <div data-testid="sp-session-totals-tab" />
}));

vi.mock('@/app/components/pages/species/SpWeightWingTab', () => ({
	SpWeightWingTab: () => <div data-testid="sp-weight-wing-tab" />
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

function renderYearPage(speciesName = 'Robin', year = '2026', tabId?: string) {
	return Page({
		params: Promise.resolve({ speciesName, year }),
		...(tabId === undefined ? {} : { searchParams: Promise.resolve({ tabId }) })
	});
}

describe('/species/[speciesName]/[year]', () => {
	afterEach(() => {
		cleanup();
		mockFetchPageOfBirds.mockReset();
	});

	describe('Usual: species with encounters in the year', () => {
		beforeEach(() => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeSpeciesClient());
			mockFetchPageOfBirds.mockResolvedValue(birds);
		});

		it('renders the period-scoped heading "{species} {year}" with an "All time" link', async () => {
			render(await renderYearPage());
			await screen.findByTestId('sp-month-totals-tab');
			const heading = screen.getByRole('heading', { level: 1 });
			expect(heading.textContent).toContain('Robin 2026');
			expect(
				within(heading)
					.getByRole('link', { name: 'All time' })
					.getAttribute('href')
			).toBe('/species/Robin');
		});

		it('renders the species tabs and stats for the scoped data', async () => {
			render(await renderYearPage());
			await screen.findByTestId('sp-month-totals-tab');
			expect(screen.getByRole('button', { name: 'Bird list' })).toBeDefined();
		});

		describe('tab order and defaults (year-scoped page)', () => {
			it('renders tab buttons in the order Month totals, Session totals, Highlights, Biometrics, Population, Bird list (no Year totals)', async () => {
				render(await renderYearPage());
				await screen.findByTestId('sp-month-totals-tab');
				const labels = within(screen.getByRole('tablist'))
					.getAllByRole('button')
					.map((button) => button.textContent);
				expect(labels).toEqual([
					'Month totals',
					'Session totals',
					'Highlights',
					'Biometrics',
					'Population',
					'Bird list'
				]);
				expect(
					screen.queryByRole('button', { name: 'Year totals' })
				).toBeNull();
			});

			it('renders SpMonthTotalsTab on initial render without clicking (eager default)', async () => {
				render(await renderYearPage());
				await screen.findByTestId('sp-month-totals-tab');
			});

			it('does not mount SpIndividualsTab until the Bird list tab is clicked', async () => {
				render(await renderYearPage());
				await screen.findByTestId('sp-month-totals-tab');
				expect(screen.queryByTestId('sp-individuals-tab')).toBeNull();
				fireEvent.click(screen.getByRole('button', { name: 'Bird list' }));
				await screen.findByTestId('sp-individuals-tab');
			});

			it("has exactly one 'Month totals' button and it's the year-scoped variant, not the all-time combined one", async () => {
				render(await renderYearPage());
				await screen.findByTestId('sp-month-totals-tab');
				expect(
					screen.getAllByRole('button', { name: 'Month totals' })
				).toHaveLength(1);
				expect(screen.getByTestId('sp-month-totals-tab')).toBeDefined();
				expect(screen.queryByTestId('sp-combined-month-totals-tab')).toBeNull();
			});
		});

		it('shows a "Session totals" tab on the year-scoped species page', async () => {
			render(await renderYearPage());
			await screen.findByTestId('sp-month-totals-tab');
			expect(
				screen.getByRole('button', { name: 'Session totals' })
			).toBeDefined();
		});

		it('lazily loads SpSessionTotalsTab only once "Session totals" is selected, consistent with the other tabs', async () => {
			render(await renderYearPage());
			await screen.findByTestId('sp-month-totals-tab');
			expect(screen.queryByTestId('sp-session-totals-tab')).toBeNull();
			fireEvent.click(screen.getByRole('button', { name: 'Session totals' }));
			await screen.findByTestId('sp-session-totals-tab');
		});
	});

	describe('?tabId= query param (#803)', () => {
		beforeEach(() => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeSpeciesClient());
			mockFetchPageOfBirds.mockResolvedValue(birds);
		});

		it('with no tabId search param, the year-scoped default (Month totals) renders unchanged', async () => {
			render(await renderYearPage());
			await screen.findByTestId('sp-month-totals-tab');
			expect(
				screen
					.getByRole('button', { name: 'Month totals' })
					.getAttribute('aria-current')
			).toBe('true');
		});

		it('?tabId=month-totals selects the year-scoped Month totals tab', async () => {
			render(await renderYearPage('Robin', '2026', 'month-totals'));
			await screen.findByTestId('sp-month-totals-tab');
			expect(
				screen
					.getByRole('button', { name: 'Month totals' })
					.getAttribute('aria-current')
			).toBe('true');
		});

		it('?tabId=bird-list wins over the year-scoped route’s Month totals default', async () => {
			render(await renderYearPage('Robin', '2026', 'bird-list'));
			await screen.findByTestId('sp-individuals-tab');
			expect(screen.queryByTestId('sp-month-totals-tab')).toBeNull();
		});

		it('?tabId=not-a-real-tab falls back to the year-scoped default, with no crash and no blank pane', async () => {
			render(await renderYearPage('Robin', '2026', 'not-a-real-tab'));
			await screen.findByTestId('sp-month-totals-tab');
			expect(
				screen
					.getByRole('button', { name: 'Month totals' })
					.getAttribute('aria-current')
			).toBe('true');
		});
	});

	describe('date-range plumbing', () => {
		beforeEach(() => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeSpeciesClient());
			mockFetchPageOfBirds.mockResolvedValue(birds);
		});

		it('threads the whole-year from/to bounds into fetchPageOfBirds', async () => {
			await fetchSpeciesYearPageContent(
				{ speciesName: 'Robin', year: '2026' },
				1
			);
			expect(mockFetchPageOfBirds).toHaveBeenCalledWith(
				spPageSnapshot.speciesId,
				1,
				0,
				'2026-01-01',
				'2026-12-31'
			);
		});

		it('threads the whole-year range into aggregate stats', async () => {
			const client = makeSpeciesClient();
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
			await fetchSpeciesYearPageContent(
				{ speciesName: 'Robin', year: '2026' },
				1
			);
			expect(client.rpc).toHaveBeenCalledWith(
				'core_stats',
				expect.objectContaining({
					from_date: '2026-01-01',
					to_date: '2026-12-31'
				})
			);
		});
	});

	describe('Structure: species with zero encounters in the year', () => {
		beforeEach(() => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeSpeciesClient());
			mockFetchPageOfBirds.mockResolvedValue([]);
		});

		it('renders the not-authorised/no-data message but keeps the scoped heading', async () => {
			render(await renderYearPage());
			await screen.findByText(
				'Not authorised to view any encounter data for this species'
			);
			const heading = screen.getByRole('heading', { level: 1 });
			expect(heading.textContent).toContain('Robin 2026');
			expect(
				within(heading).getByRole('link', { name: 'All time' })
			).toBeDefined();
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
				fetchSpeciesYearPageContent(
					{ speciesName: 'Nonexistent', year: '2026' },
					1
				)
			).rejects.toThrow();
		});
	});
});
