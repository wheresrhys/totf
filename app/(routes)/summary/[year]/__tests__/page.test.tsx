import { describe, it, expect, afterEach, vi } from 'vitest';
import {
	render,
	screen,
	cleanup,
	within,
	fireEvent,
	waitFor
} from '@testing-library/react';
import Page, { fetchSummaryYearPageContent } from '../page';
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

describe('/summary/[year]', () => {
	afterEach(() => {
		cleanup();
		fetchSummaryStatsMock.mockClear();
		fetchPeriodStatsMock.mockClear();
		fetchSpeciesDataMock.mockReset();
		fetchSpeciesDataMock.mockResolvedValue([]);
		fetchPeriodTotalsMock.mockClear();
		fetchPeriodTotalsMock.mockResolvedValue([]);
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
		await fetchSummaryYearPageContent({ year: '2026' }, 1);
		expect(fetchSummaryStatsMock).toHaveBeenCalledWith(
			1,
			'2026-01-01',
			'2026-12-31'
		);
	});

	it('does not eagerly fetch species data in the page data-fetcher (now lazy)', async () => {
		await fetchSummaryYearPageContent({ year: '2026' }, 1);
		expect(fetchSpeciesDataMock).not.toHaveBeenCalled();
	});

	it('returns the year date bounds for the lazy species fetch', async () => {
		const data = await fetchSummaryYearPageContent({ year: '2026' }, 1);
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

	it('fetchSummaryYearPageContent calls fetchPeriodStats with month grouping and the year bounds', async () => {
		await fetchSummaryYearPageContent({ year: '2026' }, 1);
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
		const data = await fetchSummaryYearPageContent({ year: '2026' }, 1);
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

	describe('Session totals tab', () => {
		it('selecting the Session totals tab fetches day-grouped totals bounded to {year}-01-01 / {year}-12-31', async () => {
			fetchPeriodTotalsMock.mockResolvedValueOnce([buildDayStat('2026-08-16')]);
			render(await Page({ params: Promise.resolve({ year: '2026' }) }));
			await screen.findByRole('heading', { level: 1 });
			fireEvent.click(screen.getByRole('button', { name: 'Session totals' }));
			await screen.findByRole('link', { name: '16th August 2026' });
			expect(fetchPeriodTotalsMock).toHaveBeenCalledWith(
				1,
				'day',
				'2026-01-01',
				'2026-12-31'
			);
		});

		it('Session totals tab appears immediately after Month totals, which remains the default tab', async () => {
			render(await Page({ params: Promise.resolve({ year: '2026' }) }));
			await screen.findByRole('heading', { level: 1 });
			const tabs = screen.getAllByRole('button');
			expect(tabs.map((tab) => tab.textContent)).toEqual([
				'Month totals',
				'Session totals',
				'Species totals'
			]);
			expect(tabs[0].getAttribute('aria-current')).toBe('true');
		});

		it("the page's initial render (Month totals active) triggers no day-grouped fetch", async () => {
			render(await Page({ params: Promise.resolve({ year: '2026' }) }));
			await screen.findByRole('heading', { level: 1 });
			expect(fetchPeriodTotalsMock).not.toHaveBeenCalled();
		});

		it('renders the shared empty state when that year has no sessions', async () => {
			render(await Page({ params: Promise.resolve({ year: '2026' }) }));
			await screen.findByRole('heading', { level: 1 });
			fireEvent.click(screen.getByRole('button', { name: 'Session totals' }));
			await screen.findByText('No data recorded.');
		});

		it('selecting the Session totals tab a second time does not trigger a second fetch', async () => {
			render(await Page({ params: Promise.resolve({ year: '2026' }) }));
			await screen.findByRole('heading', { level: 1 });
			fireEvent.click(screen.getByRole('button', { name: 'Session totals' }));
			await waitFor(() =>
				expect(fetchPeriodTotalsMock).toHaveBeenCalledTimes(1)
			);
			fireEvent.click(screen.getByRole('button', { name: 'Month totals' }));
			fireEvent.click(screen.getByRole('button', { name: 'Session totals' }));
			await waitFor(() =>
				expect(fetchPeriodTotalsMock).toHaveBeenCalledTimes(1)
			);
		});
	});
});
