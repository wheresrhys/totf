import { describe, it, expect, afterEach, vi } from 'vitest';
import {
	render,
	screen,
	cleanup,
	within,
	fireEvent
} from '@testing-library/react';
import Page, { fetchYearSummaryData } from '../page';
import alphaStats from '@/test-fixtures/snapshots/fetchSummaryStats.alpha.json';

const fetchSummaryStatsMock = vi.fn().mockResolvedValue(alphaStats);
const fetchPeriodStatsMock = vi.fn().mockResolvedValue([]);
vi.mock('@/app/actions/summary-stats', () => ({
	fetchSummaryStats: (...args: unknown[]) => fetchSummaryStatsMock(...args),
	fetchPeriodStats: (...args: unknown[]) => fetchPeriodStatsMock(...args)
}));

const fetchSpeciesDataMock = vi.fn().mockResolvedValue([]);
vi.mock('@/app/actions/spp-data', () => ({
	fetchSpeciesData: (...args: unknown[]) => fetchSpeciesDataMock(...args)
}));

describe('/summary/[year]', () => {
	afterEach(() => {
		cleanup();
		fetchSummaryStatsMock.mockClear();
		fetchPeriodStatsMock.mockClear();
		fetchSpeciesDataMock.mockReset();
		fetchSpeciesDataMock.mockResolvedValue([]);
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

	it('calls fetchSummaryStats with the correct from_date/to_date bounds for this page', async () => {
		await fetchYearSummaryData({ year: '2026' }, 1);
		expect(fetchSummaryStatsMock).toHaveBeenCalledWith(
			1,
			'2026-01-01',
			'2026-12-31'
		);
	});

	it('does not eagerly fetch species data in the page data-fetcher (now lazy)', async () => {
		await fetchYearSummaryData({ year: '2026' }, 1);
		expect(fetchSpeciesDataMock).not.toHaveBeenCalled();
	});

	it('returns the year date bounds for the lazy species fetch', async () => {
		const data = await fetchYearSummaryData({ year: '2026' }, 1);
		expect(data.fromDate).toBe('2026-01-01');
		expect(data.toDate).toBe('2026-12-31');
	});

	it('passes the fetched summary stats through to the rendered section', async () => {
		render(await Page({ params: Promise.resolve({ year: '2026' }) }));
		await screen.findByRole('heading', { level: 1 });
		const summaryStatsSection = screen.getByTestId('summary-stats-section');
		expect(summaryStatsSection).not.toBeNull();
		expect(
			within(summaryStatsSection).getByText('Sessions').nextSibling?.textContent
		).toBe('10');
	});

	it('fetchYearSummaryData calls fetchPeriodStats with month grouping and the year bounds', async () => {
		await fetchYearSummaryData({ year: '2026' }, 1);
		expect(fetchPeriodStatsMock).toHaveBeenCalledWith(
			1,
			'month',
			'2026-01-01',
			'2026-12-31'
		);
	});

	it('zero-fills monthTotals to 12 rows even when the RPC returns a partial response', async () => {
		fetchPeriodStatsMock.mockResolvedValueOnce([
			{ ...(alphaStats as object), time_period: '2026-08-01' }
		]);
		const data = await fetchYearSummaryData({ year: '2026' }, 1);
		expect(data.monthTotals).toHaveLength(12);
		expect(data.monthTotals.map((row) => row.label)[0]).toBe('January 2026');
		expect(data.monthTotals.map((row) => row.label)[11]).toBe('December 2026');
	});

	it('renders without the stats section when fetchSummaryStats resolves null', async () => {
		fetchSummaryStatsMock.mockResolvedValueOnce(null);
		render(await Page({ params: Promise.resolve({ year: '2026' }) }));
		await screen.findByRole('heading', { level: 1 });
		expect(screen.queryByTestId('summary-stats-section')).toBeNull();
	});

	it('lazily renders species table rows linking to the year-scoped species URL (#625)', async () => {
		fetchSpeciesDataMock.mockResolvedValueOnce([
			{ ...(alphaStats as object), species_name: 'Robin' }
		]);
		render(await Page({ params: Promise.resolve({ year: '2026' }) }));
		await screen.findByRole('heading', { level: 1 });
		fireEvent.click(screen.getByRole('button', { name: 'Species totals' }));
		const link = await screen.findByRole('link', { name: 'Robin' });
		expect(link.getAttribute('href')).toBe('/species/Robin/2026');
		expect(fetchSpeciesDataMock).toHaveBeenCalledWith(
			1,
			'2026-01-01',
			'2026-12-31'
		);
	});
});
