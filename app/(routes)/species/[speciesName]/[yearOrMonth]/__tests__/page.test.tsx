import '@/app/__tests__/helpers/mock-species-tab-components';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	within,
	fireEvent
} from '@testing-library/react';
import Page, { fetchSpeciesYearOrMonthPageContent } from '../page';
import birdsSnapshot from '@/test-fixtures/snapshots/tables/Birds/robin-alpha.page-of-birds.json';
import {
	ROBIN_SPECIES_ID,
	makeSpeciesClient
} from '@/app/__tests__/helpers/robin-species-page-fixtures';
import type { FullFatPageData } from '@/app/(routes)/species/[speciesName]/PageContent';
import type { ViewedGroup } from '@/app/lib/group-slug';

const VIEWED_GROUP: ViewedGroup = { id: 1, slug: 'alpha' };

const { mockGetAuthenticatedSupabaseClient, mockFetchPageOfBirds } = vi.hoisted(
	() => ({
		mockGetAuthenticatedSupabaseClient: vi.fn(),
		mockFetchPageOfBirds: vi.fn()
	})
);

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

// `fetchSpeciesPageContentForPeriod` (shared across all 3 species route
// depths) now also resolves/prefetches the 6 `TabSet`-migrated totals tabs
// (#1065, #1066) — these stub out to an empty/no-op result by default so
// prefetch never fails here; this file's own tests don't assert on them
// (that's `page.test.tsx`'s/`PageContent.test.tsx`'s job), just on this
// route's own `fetchSpeciesYearOrMonthPageContent` behaviour.
vi.mock('@/app/actions/sp-data', () => ({
	fetchPageOfBirds: mockFetchPageOfBirds,
	fetchYearTotalsTabData: vi.fn().mockResolvedValue([]),
	fetchMonthTotalsTabData: vi.fn().mockResolvedValue([]),
	fetchSessionTotalsTabData: vi.fn().mockResolvedValue([]),
	fetchCombinedMonthTotalsTabData: vi
		.fn()
		.mockResolvedValue({ monthlyStats: [], monthSquashedStats: [] }),
	fetchSquashedMonthYearTotalsTabData: vi.fn().mockResolvedValue([])
}));

const birds = birdsSnapshot as FullFatPageData['birds'];

function renderYearPage(
	speciesName = 'Robin',
	yearOrMonth = '2026',
	tabId?: string
) {
	return Page({
		params: Promise.resolve({ speciesName, yearOrMonth }),
		...(tabId === undefined ? {} : { searchParams: Promise.resolve({ tabId }) })
	});
}

describe('/species/[speciesName]/[yearOrMonth]', () => {
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
			// Month/Session totals (#1065) now render through `TabSet`'s own strip
			// (`ariaLabel="Totals"`), separate from the legacy
			// `useLinkableTabs`/`TabNav` strip (`ariaLabel="Tabs"`, default)
			// covering the tabs not yet migrated — see `SpeciesData`'s doc comment
			// in `PageContent.tsx` for why there are two for the interim.
			it('renders Month totals/Session totals/Highlights in the TabSet strip, and Biometrics/Demographics/Bird list in the legacy strip (no Year totals)', async () => {
				render(await renderYearPage());
				await screen.findByTestId('sp-month-totals-tab');
				const totalsLabels = within(
					screen.getByRole('tablist', { name: 'Totals' })
				)
					.getAllByRole('button')
					.map((button) => button.textContent);
				expect(totalsLabels).toEqual([
					'Month totals',
					'Session totals',
					'Highlights'
				]);
				const legacyLabels = within(
					screen.getByRole('tablist', { name: 'Tabs' })
				)
					.getAllByRole('button')
					.map((button) => button.textContent);
				expect(legacyLabels).toEqual([
					'Biometrics',
					'Demographics',
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

		it('?tabId=bird-list wins within the legacy strip; TabSet falls back to its own Month totals default since "bird-list" isn\'t one of its ids', async () => {
			render(await renderYearPage('Robin', '2026', 'bird-list'));
			await screen.findByTestId('sp-individuals-tab');
			// Not prefetched (the resolved initial tab is `bird-list`, not
			// `month-totals`), so `TabContent` fetches it client-side —
			// `findByTestId` waits that out.
			await screen.findByTestId('sp-month-totals-tab');
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
			await fetchSpeciesYearOrMonthPageContent(
				{ speciesName: 'Robin', yearOrMonth: '2026' },
				1,
				VIEWED_GROUP
			);
			expect(mockFetchPageOfBirds).toHaveBeenCalledWith(
				ROBIN_SPECIES_ID,
				VIEWED_GROUP,
				0,
				'2026-01-01',
				'2026-12-31'
			);
		});

		it('threads the whole-year range into aggregate stats', async () => {
			const client = makeSpeciesClient();
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
			await fetchSpeciesYearOrMonthPageContent(
				{ speciesName: 'Robin', yearOrMonth: '2026' },
				1,
				VIEWED_GROUP
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
				fetchSpeciesYearOrMonthPageContent(
					{ speciesName: 'Nonexistent', yearOrMonth: '2026' },
					1,
					VIEWED_GROUP
				)
			).rejects.toThrow();
		});
	});

	describe('squashed month variant (#1005)', () => {
		beforeEach(() => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeSpeciesClient());
			mockFetchPageOfBirds.mockResolvedValue(birds);
		});

		it('routes to the squashed-month fetch path for a month abbreviation', async () => {
			const data = await fetchSpeciesYearOrMonthPageContent(
				{ speciesName: 'Robin', yearOrMonth: 'jan' },
				1,
				VIEWED_GROUP
			);
			expect(data).toMatchObject({ squashedMonth: 1 });
		});

		it('is case-insensitive', async () => {
			const data = await fetchSpeciesYearOrMonthPageContent(
				{ speciesName: 'Robin', yearOrMonth: 'JAN' },
				1,
				VIEWED_GROUP
			);
			expect(data).toMatchObject({ squashedMonth: 1 });
		});

		it('falls through to the existing numeric-year behaviour for a numeric segment', async () => {
			const data = await fetchSpeciesYearOrMonthPageContent(
				{ speciesName: 'Robin', yearOrMonth: '2026' },
				1,
				VIEWED_GROUP
			);
			expect(data).toMatchObject({ year: 2026 });
			expect(data && 'squashedMonth' in data && data.squashedMonth).toBeFalsy();
		});

		it('renders "{species} {month name}" as the heading, with an "All time" link', async () => {
			render(await renderYearPage('Robin', 'jan'));
			await screen.findByTestId('sp-squashed-month-year-totals-tab');
			const heading = screen.getByRole('heading', { level: 1 });
			expect(heading.textContent).toContain('Robin January');
			expect(
				within(heading)
					.getByRole('link', { name: 'All time' })
					.getAttribute('href')
			).toBe('/species/Robin');
		});

		// Squashed-month's own "Year totals" tab (`SpSquashedMonthYearTotalsTab`)
		// is now on the `TabSet` strip too (#1066), alongside Session totals and
		// Highlights — only Biometrics/Demographics/Bird list remain on the
		// legacy strip.
		it('renders Session totals/Year totals/Highlights in the TabSet strip, and Biometrics/Demographics/Bird list in the legacy strip', async () => {
			render(await renderYearPage('Robin', 'jan'));
			await screen.findByTestId('sp-squashed-month-year-totals-tab');
			const totalsLabels = within(
				screen.getByRole('tablist', { name: 'Totals' })
			)
				.getAllByRole('button')
				.map((button) => button.textContent);
			expect(totalsLabels).toEqual([
				'Session totals',
				'Year totals',
				'Highlights'
			]);
			const legacyLabels = within(screen.getByRole('tablist', { name: 'Tabs' }))
				.getAllByRole('button')
				.map((button) => button.textContent);
			expect(legacyLabels).toEqual(['Biometrics', 'Demographics', 'Bird list']);
		});

		it('renders the squashed-month Year totals tab on initial render, active by default (no click needed)', async () => {
			render(await renderYearPage('Robin', 'jan'));
			await screen.findByTestId('sp-squashed-month-year-totals-tab');
			expect(
				screen
					.getByRole('button', { name: 'Year totals' })
					.getAttribute('aria-current')
			).toBe('true');
		});
	});
});
