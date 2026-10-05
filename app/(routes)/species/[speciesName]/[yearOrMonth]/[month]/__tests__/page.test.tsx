import '@/app/__tests__/helpers/mock-species-tab-components';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	within,
	fireEvent
} from '@testing-library/react';
import Page, { fetchSpeciesYearMonthPageContent } from '../page';
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
// route's own `fetchSpeciesYearMonthPageContent` behaviour.
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

function renderMonthPage(
	speciesName = 'Robin',
	yearOrMonth = '2026',
	month = '08',
	tabId?: string
) {
	return Page({
		params: Promise.resolve({ speciesName, yearOrMonth, month }),
		...(tabId === undefined ? {} : { searchParams: Promise.resolve({ tabId }) })
	});
}

describe('/species/[speciesName]/[yearOrMonth]/[month]', () => {
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
			// Session totals (#1065) now renders through `TabSet`'s own strip
			// (`ariaLabel="Totals"`), separate from the legacy
			// `useLinkableTabs`/`TabNav` strip (`ariaLabel="Tabs"`, default)
			// covering the tabs not yet migrated — see `SpeciesData`'s doc comment
			// in `PageContent.tsx` for why there are two for the interim.
			it('renders Session totals/Highlights in its own TabSet strip, and Biometrics/Demographics/Bird list in the legacy strip (no Year/Month totals)', async () => {
				render(await renderMonthPage());
				await screen.findByTestId('sp-session-totals-tab');
				const totalsLabels = within(
					screen.getByRole('tablist', { name: 'Totals' })
				)
					.getAllByRole('button')
					.map((button) => button.textContent);
				expect(totalsLabels).toEqual(['Session totals', 'Highlights']);
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

		it('?tabId=bird-list wins over the month-scoped route’s Session totals default in the legacy strip, though Session totals keeps rendering in its own TabSet strip', async () => {
			render(await renderMonthPage('Robin', '2026', '08', 'bird-list'));
			await screen.findByTestId('sp-individuals-tab');
			// Session totals is `TabSet`'s sole tab at this route depth (#1065),
			// so it's unconditionally mounted there — `bird-list` only wins within
			// the legacy strip's own mutual exclusivity. Not prefetched (the
			// resolved initial tab is `bird-list`, not `session-totals`), so
			// `TabContent` fetches it client-side — `findByTestId` waits that out.
			await screen.findByTestId('sp-session-totals-tab');
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
				{ speciesName: 'Robin', yearOrMonth: '2026', month: '08' },
				1,
				VIEWED_GROUP
			);
			expect(mockFetchPageOfBirds).toHaveBeenCalledWith(
				ROBIN_SPECIES_ID,
				VIEWED_GROUP,
				0,
				'2026-08-01',
				'2026-08-31'
			);
		});

		it('computes the correct bounds for a shorter month (April)', async () => {
			await fetchSpeciesYearMonthPageContent(
				{ speciesName: 'Robin', yearOrMonth: '2026', month: '04' },
				1,
				VIEWED_GROUP
			);
			expect(mockFetchPageOfBirds).toHaveBeenCalledWith(
				ROBIN_SPECIES_ID,
				VIEWED_GROUP,
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
					{ speciesName: 'Nonexistent', yearOrMonth: '2026', month: '08' },
					1,
					VIEWED_GROUP
				)
			).rejects.toThrow();
		});
	});

	it('calls notFound() when the parent segment is a month abbreviation (no day-drill under a squashed month)', async () => {
		await expect(
			fetchSpeciesYearMonthPageContent(
				{ speciesName: 'Robin', yearOrMonth: 'jan', month: '08' },
				1,
				VIEWED_GROUP
			)
		).rejects.toThrow();
	});
});
