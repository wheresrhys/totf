import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page, { fetchAllTimeSummaryData } from '../page';
import alphaStats from '@/test-fixtures/snapshots/fetchSummaryStats.alpha.json';

vi.mock('@/lib/underlying-stats', () => ({
	fetchSessionStats: vi.fn().mockResolvedValue({
		daySpeciesStats: [],
		sessionDates: ['2025-04-01', '2026-01-05']
	})
}));

const fetchSummaryStatsMock = vi.fn().mockResolvedValue(alphaStats);
vi.mock('@/app/actions/summary-stats', () => ({
	fetchSummaryStats: (...args: unknown[]) => fetchSummaryStatsMock(...args)
}));

vi.mock('@/app/actions/spp-data', () => ({
	fetchSpeciesData: vi.fn().mockResolvedValue([])
}));

describe('/summary (all-time)', () => {
	afterEach(() => {
		cleanup();
		fetchSummaryStatsMock.mockClear();
	});

	it('renders the "All time summary" heading', async () => {
		render(await Page());
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('All time summary');
	});

	it('renders a session link for every date returned by fetchSessionStats', async () => {
		render(await Page());
		await screen.findByRole('heading', { level: 1 });
		expect(screen.getAllByRole('link')).toHaveLength(2);
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

	it('fetchAllTimeSummaryData calls fetchSpeciesData with no date bounds', async () => {
		const { fetchSpeciesData } = await import('@/app/actions/spp-data');
		await fetchAllTimeSummaryData({}, 1);
		expect(fetchSpeciesData).toHaveBeenCalledWith(1);
	});
});
