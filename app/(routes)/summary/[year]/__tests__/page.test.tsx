import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page, { fetchYearSummaryData } from '../page';
import alphaStats from '@/test-fixtures/snapshots/fetchSummaryStats.alpha.json';

vi.mock('@/lib/underlying-stats', () => ({
	fetchSessionStats: vi.fn().mockResolvedValue({
		daySpeciesStats: [],
		sessionDates: ['2025-04-01', '2026-01-05', '2026-06-30']
	})
}));

const fetchSummaryStatsMock = vi.fn().mockResolvedValue(alphaStats);
vi.mock('@/app/actions/summary-stats', () => ({
	fetchSummaryStats: (...args: unknown[]) => fetchSummaryStatsMock(...args)
}));

vi.mock('@/app/actions/spp-data', () => ({
	fetchSpeciesData: vi.fn().mockResolvedValue([])
}));

describe('/summary/[year]', () => {
	afterEach(() => {
		cleanup();
		fetchSummaryStatsMock.mockClear();
	});

	it('renders "{year} summary" for a well-formed year', async () => {
		render(await Page({ params: Promise.resolve({ year: '2026' }) }));
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('2026 summary');
	});

	it('renders the heading even with zero sessions that year (no DB check)', async () => {
		render(await Page({ params: Promise.resolve({ year: '1901' }) }));
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('1901 summary');
	});

	it('renders only links for dates within the given year', async () => {
		render(
			await Page({
				params: Promise.resolve({
					year: '2026',
					viewedGroup: { id: 1, slug: 'alpha' }
				})
			})
		);
		await screen.findByRole('heading', { level: 1 });
		const links = screen.getAllByRole('link');
		expect(links.map((link) => link.getAttribute('href'))).toEqual([
			'/group/alpha/session-temp/2026-01-05',
			'/group/alpha/session-temp/2026-06-30'
		]);
	});

	it('calls fetchSummaryStats with the correct from_date/to_date bounds for this page', async () => {
		await fetchYearSummaryData({ year: '2026' }, 1);
		expect(fetchSummaryStatsMock).toHaveBeenCalledWith(
			1,
			'2026-01-01',
			'2026-12-31'
		);
	});

	it('fetchYearSummaryData calls fetchSpeciesData with `${year}-01-01` to `${year}-12-31`', async () => {
		const { fetchSpeciesData } = await import('@/app/actions/spp-data');
		await fetchYearSummaryData({ year: '2026' }, 1);
		expect(fetchSpeciesData).toHaveBeenCalledWith(
			1,
			'2026-01-01',
			'2026-12-31'
		);
	});

	it('passes the fetched summary stats through to the rendered section', async () => {
		render(await Page({ params: Promise.resolve({ year: '2026' }) }));
		await screen.findByRole('heading', { level: 1 });
		expect(screen.getByTestId('summary-stats-section')).not.toBeNull();
		expect(screen.getByText('Sessions').nextSibling?.textContent).toBe('10');
	});

	it('renders without the stats section when fetchSummaryStats resolves null', async () => {
		fetchSummaryStatsMock.mockResolvedValueOnce(null);
		render(await Page({ params: Promise.resolve({ year: '2026' }) }));
		await screen.findByRole('heading', { level: 1 });
		expect(screen.queryByTestId('summary-stats-section')).toBeNull();
	});
});
