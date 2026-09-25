import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { SpYearTotalsTab } from '../SpYearTotalsTab';
import type { CoreStatsResult } from '@/app/models/db';
import { getColumnIndex } from '@/app/__tests__/helpers/table';
import { buildCoreStatsRow } from '@/app/__tests__/helpers/core-stats-fixtures';

vi.mock('@/app/actions/sp-data', () => ({
	fetchSpeciesPeriodTotals: vi.fn()
}));

describe('SpYearTotalsTab', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(async () => {
		const { fetchSpeciesPeriodTotals } = await import('@/app/actions/sp-data');
		vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([
			buildCoreStatsRow({ time_period: '2025-01-01' }),
			buildCoreStatsRow({ time_period: '2026-01-01' })
		]);
	});

	it('shows a loading spinner while data is fetching', async () => {
		const { fetchSpeciesPeriodTotals } = await import('@/app/actions/sp-data');
		let resolveData!: (v: CoreStatsResult[]) => void;
		vi.mocked(fetchSpeciesPeriodTotals).mockReturnValue(
			new Promise((resolve) => {
				resolveData = resolve;
			})
		);
		render(<SpYearTotalsTab speciesName="Robin" viewedGroupId={1} />);
		expect(document.querySelector('.loading')).toBeDefined();
		resolveData([]);
	});

	it('fetches year-grouped totals scoped to the species', async () => {
		const { fetchSpeciesPeriodTotals } = await import('@/app/actions/sp-data');
		render(<SpYearTotalsTab speciesName="Robin" viewedGroupId={1} />);
		await waitFor(() => {
			expect(screen.getByTestId('period-totals-table')).toBeTruthy();
		});
		expect(fetchSpeciesPeriodTotals).toHaveBeenCalledWith('Robin', 1, 'year');
	});

	it('renders a row per year, each linking to /species/{name}/{year}', async () => {
		render(<SpYearTotalsTab speciesName="Robin" viewedGroupId={1} />);
		await waitFor(() => {
			expect(document.querySelectorAll('tbody tr').length).toBe(2);
		});
		const link2025 = screen.getByRole('link', { name: '2025' });
		const link2026 = screen.getByRole('link', { name: '2026' });
		expect(link2025.getAttribute('href')).toBe('/species/Robin/2025');
		expect(link2026.getAttribute('href')).toBe('/species/Robin/2026');
	});

	it('renders a "Busiest session" column between Encounters and Birds', async () => {
		render(<SpYearTotalsTab speciesName="Robin" viewedGroupId={1} />);
		await waitFor(() => {
			expect(document.querySelectorAll('tbody tr').length).toBe(2);
		});
		const encountersIndex = getColumnIndex('Encounters');
		const busiestSessionIndex = getColumnIndex('Busiest session');
		const birdsIndex = getColumnIndex('Birds');
		expect(busiestSessionIndex).toBe(encountersIndex + 1);
		expect(busiestSessionIndex).toBe(birdsIndex - 1);
	});

	it('shows the period table empty state when no years are returned', async () => {
		const { fetchSpeciesPeriodTotals } = await import('@/app/actions/sp-data');
		vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([]);
		render(<SpYearTotalsTab speciesName="Robin" viewedGroupId={1} />);
		await waitFor(() => {
			expect(screen.getByText('No data recorded.')).toBeTruthy();
		});
	});
});
