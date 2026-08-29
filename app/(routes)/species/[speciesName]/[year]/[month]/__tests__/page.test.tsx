import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import Page, { fetchSpYearMonthPageData } from '../page';
import spPageSnapshot from '@/test-fixtures/snapshots/fetchSpPageData.alpha.robin.json';
import type { FullFatPageData } from '@/app/(routes)/species/[speciesName]/page';

const {
	mockGetAuthenticatedSupabaseClient,
	mockGetTopPeriodsByMetric,
	mockFetchPageOfBirds
} = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn(),
	mockGetTopPeriodsByMetric: vi.fn(),
	mockFetchPageOfBirds: vi.fn()
}));

vi.mock('@/lib/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

vi.mock('@/app/actions/top-performers', () => ({
	getTopPeriodsByMetric: mockGetTopPeriodsByMetric
}));

vi.mock('@/app/actions/sp-data', () => ({
	fetchPageOfBirds: mockFetchPageOfBirds
}));

vi.mock('@/app/components/SpIndividualsTab', () => ({
	SpIndividualsTab: () => <div data-testid="sp-individuals-tab" />
}));

vi.mock('@/app/components/SpNotableRetrapsTab', () => ({
	SpNotableRetrapsTab: () => <div data-testid="sp-notable-retraps-tab" />
}));

vi.mock('@/app/components/SpStatsHistoryTab', () => ({
	SpStatsHistoryTab: () => <div data-testid="sp-stats-history-tab" />
}));

vi.mock('@/app/components/SpWeightWingTab', () => ({
	SpWeightWingTab: () => <div data-testid="sp-weight-wing-tab" />
}));

const { topSessions, birds, speciesStats } =
	spPageSnapshot as unknown as FullFatPageData;

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

function renderMonthPage(speciesName = 'Robin', year = '2026', month = '08') {
	return Page({ params: Promise.resolve({ speciesName, year, month }) });
}

describe('/species/[speciesName]/[year]/[month]', () => {
	afterEach(() => {
		cleanup();
		mockGetTopPeriodsByMetric.mockReset();
		mockFetchPageOfBirds.mockReset();
	});

	describe('Usual: species with encounters in the month', () => {
		beforeEach(() => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeSpeciesClient());
			mockGetTopPeriodsByMetric.mockResolvedValue(topSessions);
			mockFetchPageOfBirds.mockResolvedValue(birds);
		});

		it('renders the "{species} {long month} {year}" heading with an "All time" link', async () => {
			render(await renderMonthPage());
			await screen.findByTestId('sp-individuals-tab');
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
			await screen.findByTestId('sp-individuals-tab');
			expect(screen.getByRole('button', { name: 'Bird list' })).toBeDefined();
			expect(screen.getByTestId('headline-stats')).toBeDefined();
		});

		it('shows neither a "Year totals" nor a "Month totals" tab', async () => {
			render(await renderMonthPage());
			await screen.findByTestId('sp-individuals-tab');
			expect(screen.queryByRole('button', { name: 'Year totals' })).toBeNull();
			expect(screen.queryByRole('button', { name: 'Month totals' })).toBeNull();
		});

		it("does not show the all-time 'Month totals' tab on the month-scoped species page", async () => {
			render(await renderMonthPage());
			await screen.findByTestId('sp-individuals-tab');
			expect(screen.queryByRole('button', { name: 'Month totals' })).toBeNull();
			expect(screen.queryByTestId('sp-combined-month-totals-tab')).toBeNull();
		});

		it('does not show a "Session totals" tab on the month-scoped species page', async () => {
			render(await renderMonthPage());
			await screen.findByTestId('sp-individuals-tab');
			expect(
				screen.queryByRole('button', { name: 'Session totals' })
			).toBeNull();
		});
	});

	describe('date-range plumbing', () => {
		beforeEach(() => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeSpeciesClient());
			mockGetTopPeriodsByMetric.mockResolvedValue(topSessions);
			mockFetchPageOfBirds.mockResolvedValue(birds);
		});

		it("threads the month's first/last calendar day into fetchPageOfBirds", async () => {
			await fetchSpYearMonthPageData(
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
			await fetchSpYearMonthPageData(
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

		it('threads year_filter and month_filter into the top-sessions filter', async () => {
			await fetchSpYearMonthPageData(
				{ speciesName: 'Robin', year: '2026', month: '08' },
				1
			);
			expect(mockGetTopPeriodsByMetric).toHaveBeenCalledWith(
				expect.objectContaining({
					filters: expect.objectContaining({
						year_filter: 2026,
						month_filter: 8
					})
				})
			);
		});
	});

	describe('Structure: species with zero encounters in the month', () => {
		beforeEach(() => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeSpeciesClient());
			mockGetTopPeriodsByMetric.mockResolvedValue([]);
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
		});
	});

	describe('Edge: unknown species', () => {
		beforeEach(() => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(
				makeSpeciesClient(null)
			);
			mockGetTopPeriodsByMetric.mockResolvedValue([]);
			mockFetchPageOfBirds.mockResolvedValue([]);
		});

		it('rejects when the species lookup finds no row (surfacing the not-found path)', async () => {
			await expect(
				fetchSpYearMonthPageData(
					{ speciesName: 'Nonexistent', year: '2026', month: '08' },
					1
				)
			).rejects.toThrow();
		});
	});
});
