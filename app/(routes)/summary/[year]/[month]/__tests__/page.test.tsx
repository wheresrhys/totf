import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import Page, { fetchYearMonthSummaryData } from '../page';
import alphaStats from '@/test-fixtures/snapshots/fetchSummaryStats.alpha.json';

const fetchSummaryStatsMock = vi.fn().mockResolvedValue(alphaStats);
vi.mock('@/app/actions/summary-stats', () => ({
	fetchSummaryStats: (...args: unknown[]) => fetchSummaryStatsMock(...args)
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

describe('/summary/[year]/[month]', () => {
	afterEach(() => {
		cleanup();
		fetchSummaryStatsMock.mockClear();
		fetchPeriodTotalsMock.mockClear();
		fetchSpeciesDataMock.mockReset();
		fetchSpeciesDataMock.mockResolvedValue([]);
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

	it('does not eagerly fetch species data in the page data-fetcher (now lazy)', async () => {
		await fetchYearMonthSummaryData({ year: '2026', month: '08' }, 1);
		expect(fetchSpeciesDataMock).not.toHaveBeenCalled();
	});

	it("returns the month's first and last calendar day as the lazy species-fetch bounds", async () => {
		const data = await fetchYearMonthSummaryData(
			{ year: '2026', month: '08' },
			1
		);
		expect(data.fromDate).toBe('2026-08-01');
		expect(data.toDate).toBe('2026-08-31');
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
		const data = await fetchYearMonthSummaryData(
			{ year: '2026', month: '12' },
			1
		);
		expect(data.fromDate).toBe('2026-12-01');
		expect(data.toDate).toBe('2026-12-31');
	});

	it("fetchYearMonthSummaryData requests per-day period totals scoped to the month's bounds", async () => {
		await fetchYearMonthSummaryData({ year: '2026', month: '08' }, 1);
		expect(fetchPeriodTotalsMock).toHaveBeenCalledWith(
			1,
			'day',
			'2026-08-01',
			'2026-08-31'
		);
	});

	it('renders "Session totals" as the first, default-active tab', async () => {
		render(
			await Page({
				params: Promise.resolve({ year: '2026', month: '08' })
			})
		);
		await screen.findByRole('heading', { level: 1 });
		const tabs = screen.getAllByRole('button');
		expect(tabs[0].textContent).toBe('Session totals');
		expect(tabs[0].getAttribute('aria-current')).toBe('true');
		expect(screen.getByRole('button', { name: 'Species totals' })).toBeTruthy();
	});

	it('links each session day to the group-scoped session-temp route', async () => {
		fetchPeriodTotalsMock.mockResolvedValueOnce([buildDayStat('2026-08-16')]);
		render(
			await Page({
				params: Promise.resolve({ year: '2026', month: '08' })
			})
		);
		await screen.findByRole('heading', { level: 1 });
		expect(
			screen
				.getByRole('link', { name: '16th August 2026' })
				.getAttribute('href')
		).toBe('/group/alpha/session-temp/2026-08-16');
	});

	it('lazily renders species table rows linking to the year-and-month-scoped species URL (#625)', async () => {
		fetchSpeciesDataMock.mockResolvedValueOnce([
			{ ...(alphaStats as object), species_name: 'Robin' }
		]);
		render(
			await Page({
				params: Promise.resolve({ year: '2026', month: '08' })
			})
		);
		await screen.findByRole('heading', { level: 1 });
		fireEvent.click(screen.getByRole('button', { name: 'Species totals' }));
		const link = await screen.findByRole('link', { name: 'Robin' });
		expect(link.getAttribute('href')).toBe('/species/Robin/2026/8');
		expect(fetchSpeciesDataMock).toHaveBeenCalledWith(
			1,
			'2026-08-01',
			'2026-08-31'
		);
	});
});
