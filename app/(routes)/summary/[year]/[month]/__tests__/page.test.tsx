import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page, { fetchYearMonthSummaryData } from '../page';

vi.mock('@/lib/underlying-stats', () => ({
	fetchSessionStats: vi.fn().mockResolvedValue({
		daySpeciesStats: [],
		sessionDates: ['2026-07-30', '2026-08-01', '2026-08-15', '2026-09-01']
	})
}));

vi.mock('@/app/actions/spp-data', () => ({
	fetchSpeciesData: vi.fn().mockResolvedValue([])
}));

describe('/summary/[year]/[month]', () => {
	afterEach(() => {
		cleanup();
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
