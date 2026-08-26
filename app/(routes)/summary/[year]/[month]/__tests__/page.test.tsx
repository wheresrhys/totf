import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page, { fetchYearMonthSummaryData } from '../page';
import alphaStats from '@/test-fixtures/snapshots/fetchSummaryStats.alpha.json';

vi.mock('@/lib/underlying-stats', () => ({
	fetchSessionStats: vi.fn().mockResolvedValue({
		daySpeciesStats: [],
		sessionDates: ['2026-07-30', '2026-08-01', '2026-08-15', '2026-09-01']
	})
}));

const fetchSummaryStatsMock = vi.fn().mockResolvedValue(alphaStats);
vi.mock('@/app/actions/summary-stats', () => ({
	fetchSummaryStats: (...args: unknown[]) => fetchSummaryStatsMock(...args)
}));

vi.mock('@/app/actions/spp-data', () => ({
	fetchSpeciesData: vi.fn().mockResolvedValue([])
}));

describe('/summary/[year]/[month]', () => {
	afterEach(() => {
		cleanup();
		fetchSummaryStatsMock.mockClear();
	});

	it('renders "{long month} {year} summary" for a well-formed year/month', async () => {
		render(
			await Page({
				params: Promise.resolve({ year: '2026', month: '08' })
			})
		);
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('August 2026 summary');
	});

	it('renders "{long month} {year} summary" for an unpadded month', async () => {
		render(
			await Page({
				params: Promise.resolve({ year: '2026', month: '8' })
			})
		);
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('August 2026 summary');
	});

	it('renders only links for dates within the given year and month', async () => {
		render(
			await Page({
				params: Promise.resolve({
					year: '2026',
					month: '08',
					viewedGroup: { id: 1, slug: 'alpha' }
				})
			})
		);
		await screen.findByRole('heading', { level: 1 });
		const links = screen.getAllByRole('link');
		expect(links.map((link) => link.getAttribute('href'))).toEqual([
			'/group/alpha/session-temp/2026-08-01',
			'/group/alpha/session-temp/2026-08-15'
		]);
	});

	it('renders only links for dates within the given year and unpadded month', async () => {
		render(
			await Page({
				params: Promise.resolve({
					year: '2026',
					month: '8',
					viewedGroup: { id: 1, slug: 'alpha' }
				})
			})
		);
		await screen.findByRole('heading', { level: 1 });
		const links = screen.getAllByRole('link');
		expect(links.map((link) => link.getAttribute('href'))).toEqual([
			'/group/alpha/session-temp/2026-08-01',
			'/group/alpha/session-temp/2026-08-15'
		]);
	});

	it("fetchYearMonthSummaryData calls fetchSpeciesData with the month's first and last calendar day", async () => {
		const { fetchSpeciesData } = await import('@/app/actions/spp-data');
		await fetchYearMonthSummaryData({ year: '2026', month: '08' }, 1);
		expect(fetchSpeciesData).toHaveBeenCalledWith(
			1,
			'2026-08-01',
			'2026-08-31'
		);
	});

	it('calls fetchSummaryStats with the correct from_date/to_date bounds for this page', async () => {
		await fetchYearMonthSummaryData({ year: '2026', month: '08' }, 1);
		expect(fetchSummaryStatsMock).toHaveBeenCalledWith(
			1,
			'2026-08-01',
			'2026-08-31'
		);
	});

	it('calls fetchSummaryStats with the correct bounds for a shorter month (April)', async () => {
		await fetchYearMonthSummaryData({ year: '2026', month: '04' }, 1);
		expect(fetchSummaryStatsMock).toHaveBeenCalledWith(
			1,
			'2026-04-01',
			'2026-04-30'
		);
	});

	it('passes the fetched summary stats through to the rendered section', async () => {
		render(
			await Page({
				params: Promise.resolve({ year: '2026', month: '08' })
			})
		);
		await screen.findByRole('heading', { level: 1 });
		expect(screen.getByTestId('summary-stats-section')).not.toBeNull();
		expect(screen.getByText('Sessions').nextSibling?.textContent).toBe('10');
	});

	it('renders without the stats section when fetchSummaryStats resolves null', async () => {
		fetchSummaryStatsMock.mockResolvedValueOnce(null);
		render(
			await Page({
				params: Promise.resolve({ year: '2026', month: '08' })
			})
		);
		await screen.findByRole('heading', { level: 1 });
		expect(screen.queryByTestId('summary-stats-section')).toBeNull();
	});

	it('computes correct month bounds for December (year-end month)', async () => {
		const { fetchSpeciesData } = await import('@/app/actions/spp-data');
		await fetchYearMonthSummaryData({ year: '2026', month: '12' }, 1);
		expect(fetchSpeciesData).toHaveBeenCalledWith(
			1,
			'2026-12-01',
			'2026-12-31'
		);
	});
});
