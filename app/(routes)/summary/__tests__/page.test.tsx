import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page, { fetchAllTimeSummaryData } from '../page';
import alphaStats from '@/test-fixtures/snapshots/fetchSummaryStats.alpha.json';

const fetchSummaryStatsMock = vi.fn().mockResolvedValue(alphaStats);
const fetchYearlyTotalsMock = vi.fn().mockResolvedValue([]);
vi.mock('@/app/actions/summary-stats', () => ({
	fetchSummaryStats: (...args: unknown[]) => fetchSummaryStatsMock(...args),
	fetchYearlyTotals: (...args: unknown[]) => fetchYearlyTotalsMock(...args)
}));

const fetchSpeciesDataMock = vi.fn().mockResolvedValue([]);
vi.mock('@/app/actions/spp-data', () => ({
	fetchSpeciesData: (...args: unknown[]) => fetchSpeciesDataMock(...args)
}));

describe('/summary (all-time)', () => {
	afterEach(() => {
		cleanup();
		fetchSummaryStatsMock.mockClear();
		fetchYearlyTotalsMock.mockClear();
		fetchSpeciesDataMock.mockClear();
	});

	it('renders the "All time summary" heading', async () => {
		render(await Page());
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('All time summary');
	});

	it('calls fetchSummaryStats with the correct from_date/to_date bounds for this page', async () => {
		await fetchAllTimeSummaryData({}, 1);
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
		await fetchAllTimeSummaryData({}, 1);
		expect(fetchSpeciesDataMock).not.toHaveBeenCalled();
	});

	it('renders the default Year totals tab but no species table on first paint', async () => {
		render(await Page());
		await screen.findByRole('heading', { level: 1 });
		expect(screen.getByRole('button', { name: 'Year totals' })).toBeTruthy();
		expect(screen.queryByTestId('species-totals-table')).toBeNull();
		expect(fetchSpeciesDataMock).not.toHaveBeenCalled();
	});

	it('fetchAllTimeSummaryData calls fetchYearlyTotals with the viewed group id', async () => {
		await fetchAllTimeSummaryData({}, 1);
		expect(fetchYearlyTotalsMock).toHaveBeenCalledWith(1);
	});

	it('includes yearlyTotals in the returned page data', async () => {
		const yearlyStats = [{ time_period: '2026-01-01' }];
		fetchYearlyTotalsMock.mockResolvedValueOnce(yearlyStats);
		const data = await fetchAllTimeSummaryData({}, 1);
		expect(data.yearlyTotals).toBe(yearlyStats);
	});
});
