import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { SpSquashedMonthYearTotalsTab } from '../SpSquashedMonthYearTotalsTab';
import type { CoreStatsResult } from '@/app/models/db';
import { buildCoreStatsRow } from '@/app/__tests__/helpers/core-stats-fixtures';

vi.mock('@/app/actions/sp-data', () => ({
	fetchSpeciesPeriodTotals: vi.fn()
}));

describe('SpSquashedMonthYearTotalsTab', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(async () => {
		const { fetchSpeciesPeriodTotals } = await import('@/app/actions/sp-data');
		vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([
			buildCoreStatsRow({ time_period: '2024-01-01' }),
			buildCoreStatsRow({ time_period: '2025-01-01' })
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
		render(
			<SpSquashedMonthYearTotalsTab
				speciesName="Robin"
				viewedGroupId={1}
				squashedMonth={1}
			/>
		);
		expect(document.querySelector('.loading')).toBeDefined();
		resolveData([]);
	});

	it('fetches year-grouped totals scoped to the species and month_filter', async () => {
		const { fetchSpeciesPeriodTotals } = await import('@/app/actions/sp-data');
		render(
			<SpSquashedMonthYearTotalsTab
				speciesName="Robin"
				viewedGroupId={1}
				squashedMonth={1}
			/>
		);
		await waitFor(() => {
			expect(screen.getByTestId('period-totals-table')).toBeTruthy();
		});
		expect(fetchSpeciesPeriodTotals).toHaveBeenCalledWith(
			'Robin',
			1,
			'year',
			undefined,
			undefined,
			1
		);
	});

	it('labels each row "{month name} {year}" and links to /species/{name}/{year}/{month}', async () => {
		render(
			<SpSquashedMonthYearTotalsTab
				speciesName="Robin"
				viewedGroupId={1}
				squashedMonth={1}
			/>
		);
		await waitFor(() => {
			expect(document.querySelectorAll('tbody tr').length).toBe(2);
		});
		const link2024 = screen.getByRole('link', { name: 'January 2024' });
		expect(link2024.getAttribute('href')).toBe('/species/Robin/2024/1');
		const link2025 = screen.getByRole('link', { name: 'January 2025' });
		expect(link2025.getAttribute('href')).toBe('/species/Robin/2025/1');
	});

	it('uses the requested squashed month for every row regardless of its own bucket month', async () => {
		render(
			<SpSquashedMonthYearTotalsTab
				speciesName="Robin"
				viewedGroupId={1}
				squashedMonth={12}
			/>
		);
		await waitFor(() => {
			expect(screen.getByText('December 2024')).toBeTruthy();
		});
		expect(
			screen.getByRole('link', { name: 'December 2024' }).getAttribute('href')
		).toBe('/species/Robin/2024/12');
	});

	it("renders the table's empty state when the species has no data for that month, without crashing", async () => {
		const { fetchSpeciesPeriodTotals } = await import('@/app/actions/sp-data');
		vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([]);
		render(
			<SpSquashedMonthYearTotalsTab
				speciesName="Robin"
				viewedGroupId={1}
				squashedMonth={1}
			/>
		);
		await waitFor(() => {
			expect(screen.getByText('No data recorded.')).toBeTruthy();
		});
	});
});
