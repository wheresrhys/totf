import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page, { fetchAllTimeSummaryData } from '../page';

vi.mock('@/lib/underlying-stats', () => ({
	fetchSessionStats: vi.fn().mockResolvedValue({
		daySpeciesStats: [],
		sessionDates: ['2025-04-01', '2026-01-05']
	})
}));

vi.mock('@/app/actions/spp-data', () => ({
	fetchSpeciesData: vi.fn().mockResolvedValue([])
}));

describe('/summary (all-time)', () => {
	afterEach(() => {
		cleanup();
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

	it('fetchAllTimeSummaryData calls fetchSpeciesData with no date bounds', async () => {
		const { fetchSpeciesData } = await import('@/app/actions/spp-data');
		await fetchAllTimeSummaryData({}, 1);
		expect(fetchSpeciesData).toHaveBeenCalledWith(1);
	});
});
