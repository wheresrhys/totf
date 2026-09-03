import { describe, it, expect, afterEach, vi } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	waitFor
} from '@testing-library/react';
import Page, { fetchSummaryPageContent } from '../page';
import alphaStats from '@/test-fixtures/snapshots/fetchSummaryStats.alpha.json';

const fetchSummaryStatsMock = vi.fn().mockResolvedValue(alphaStats);
const fetchYearlyTotalsMock = vi.fn().mockResolvedValue([]);
const fetchPeriodStatsMock = vi.fn().mockResolvedValue([]);
vi.mock('@/app/actions/summary-stats', () => ({
	fetchSummaryStats: (...args: unknown[]) => fetchSummaryStatsMock(...args),
	fetchYearlyTotals: (...args: unknown[]) => fetchYearlyTotalsMock(...args),
	fetchPeriodStats: (...args: unknown[]) => fetchPeriodStatsMock(...args)
}));

const fetchSpeciesDataMock = vi.fn().mockResolvedValue([]);
vi.mock('@/app/actions/spp-data', () => ({
	fetchSpeciesData: (...args: unknown[]) => fetchSpeciesDataMock(...args)
}));

const fetchPeriodTotalsMock = vi.fn().mockResolvedValue([]);
vi.mock('@/app/actions/period-totals', () => ({
	fetchPeriodTotals: (...args: unknown[]) => fetchPeriodTotalsMock(...args)
}));

function buildDayStat(time_period: string) {
	return {
		species_name: null,
		time_period,
		session_count: 1,
		total_effort: '06:00:00',
		species_count: 5,
		bird_count: 12,
		encounter_count: 14,
		new_bird_count: 9,
		pullus_bird_count: 1,
		juv_bird_count: 2,
		postjuv_bird_count: 1,
		adult_bird_count: 6,
		unknown_age_bird_count: 2,
		new_young_bird_count: 3
	};
}

describe('/summary (all-time)', () => {
	afterEach(() => {
		cleanup();
		fetchSummaryStatsMock.mockClear();
		fetchYearlyTotalsMock.mockClear();
		fetchPeriodStatsMock.mockClear();
		fetchSpeciesDataMock.mockClear();
		fetchPeriodTotalsMock.mockClear();
		fetchPeriodTotalsMock.mockResolvedValue([]);
	});

	it('renders the "All time summary" heading', async () => {
		render(await Page());
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('All time summary');
	});

	it('calls fetchSummaryStats with the correct from_date/to_date bounds for this page', async () => {
		await fetchSummaryPageContent({}, 1);
		expect(fetchSummaryStatsMock).toHaveBeenCalledWith(1);
	});

	it('passes the fetched summary stats through to the rendered section', async () => {
		render(await Page());
		await screen.findByRole('heading', { level: 1 });
		expect(screen.getByTestId('summary-stats-section')).not.toBeNull();
		expect(screen.getByText('Sessions').nextSibling?.textContent).toBe('10');
	});

	it('renders without the stats section when fetchSummaryStats resolves null', async () => {
		fetchSummaryStatsMock.mockResolvedValueOnce(null);
		render(await Page());
		await screen.findByRole('heading', { level: 1 });
		expect(screen.queryByTestId('summary-stats-section')).toBeNull();
	});

	it('does not eagerly fetch species data in the page data-fetcher (now lazy)', async () => {
		await fetchSummaryPageContent({}, 1);
		expect(fetchSpeciesDataMock).not.toHaveBeenCalled();
	});

	it('renders the default Year totals tab but no species table on first paint', async () => {
		render(await Page());
		await screen.findByRole('heading', { level: 1 });
		expect(screen.getByRole('button', { name: 'Year totals' })).toBeTruthy();
		expect(screen.queryByTestId('species-totals-table')).toBeNull();
		expect(fetchSpeciesDataMock).not.toHaveBeenCalled();
	});

	it('fetchSummaryPageContent calls fetchYearlyTotals with the viewed group id', async () => {
		await fetchSummaryPageContent({}, 1);
		expect(fetchYearlyTotalsMock).toHaveBeenCalledWith(1);
	});

	it('includes yearlyTotals in the returned page data', async () => {
		const yearlyStats = [{ time_period: '2026-01-01' }];
		fetchYearlyTotalsMock.mockResolvedValueOnce(yearlyStats);
		const data = await fetchSummaryPageContent({}, 1);
		expect(data.yearlyTotals).toBe(yearlyStats);
	});

	it('renders the all-time "Month totals" tab, without eagerly fetching its period stats', async () => {
		render(await Page());
		await screen.findByRole('heading', { level: 1 });
		expect(screen.getByRole('button', { name: 'Month totals' })).toBeTruthy();
		// Lazy: the tab exists but its data isn't fetched until first selected.
		expect(fetchPeriodStatsMock).not.toHaveBeenCalled();
	});

	describe('Session totals tab', () => {
		it("selecting the Session totals tab fetches day-grouped totals for the group's entire history, with no date bounds", async () => {
			fetchPeriodTotalsMock.mockResolvedValueOnce([buildDayStat('2026-08-16')]);
			render(await Page());
			await screen.findByRole('heading', { level: 1 });
			fireEvent.click(screen.getByRole('button', { name: 'Session totals' }));
			await screen.findByRole('link', { name: '16th August 2026' });
			expect(fetchPeriodTotalsMock).toHaveBeenCalledWith(
				1,
				'day',
				undefined,
				undefined
			);
		});

		it('selecting the Session totals tab a second time does not trigger a second fetch', async () => {
			render(await Page());
			await screen.findByRole('heading', { level: 1 });
			fireEvent.click(screen.getByRole('button', { name: 'Session totals' }));
			await waitFor(() =>
				expect(fetchPeriodTotalsMock).toHaveBeenCalledTimes(1)
			);
			fireEvent.click(screen.getByRole('button', { name: 'Year totals' }));
			fireEvent.click(screen.getByRole('button', { name: 'Session totals' }));
			await waitFor(() =>
				expect(fetchPeriodTotalsMock).toHaveBeenCalledTimes(1)
			);
		});

		it('Session totals tab appears after Month totals, with Year totals remaining the default tab', async () => {
			render(await Page());
			await screen.findByRole('heading', { level: 1 });
			const tabs = screen.getAllByRole('button');
			expect(tabs.map((tab) => tab.textContent)).toEqual([
				'Year totals',
				'Month totals',
				'Session totals',
				'Species totals'
			]);
			expect(tabs[0].getAttribute('aria-current')).toBe('true');
		});

		it("each returned day links to the group-scoped session route via the group's resolved slug", async () => {
			fetchPeriodTotalsMock.mockResolvedValueOnce([buildDayStat('2026-08-16')]);
			render(await Page());
			await screen.findByRole('heading', { level: 1 });
			fireEvent.click(screen.getByRole('button', { name: 'Session totals' }));
			const link = await screen.findByRole('link', {
				name: '16th August 2026'
			});
			expect(link.getAttribute('href')).toBe('/group/alpha/session/2026-08-16');
		});

		it("the page's initial render (Year totals active) triggers no day-grouped fetch", async () => {
			render(await Page());
			await screen.findByRole('heading', { level: 1 });
			expect(fetchPeriodTotalsMock).not.toHaveBeenCalled();
		});

		it('renders the shared empty state when the group has no sessions at all', async () => {
			render(await Page());
			await screen.findByRole('heading', { level: 1 });
			fireEvent.click(screen.getByRole('button', { name: 'Session totals' }));
			await screen.findByText('No data recorded.');
		});
	});
});
