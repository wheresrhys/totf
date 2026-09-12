import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	waitFor,
	fireEvent
} from '@testing-library/react';
import { SpMonthTotalsTab } from '../SpMonthTotalsTab';
import type { AggregateStatsResult } from '@/app/models/db';
import { getColumnIndex } from '@/app/__tests__/helpers/table';

vi.mock('@/app/actions/sp-data', () => ({
	fetchSpeciesPeriodTotals: vi.fn()
}));

function buildMonthlyStat(
	overrides: Partial<AggregateStatsResult> = {}
): AggregateStatsResult {
	return {
		species_name: null,
		time_period: '2026-03-01',
		session_count: 2,
		total_effort: '06:00:00',
		effort_per_session: '03:00:00',
		effort_per_encounter: '00:30:00',
		avg_encounters_per_session: 6,
		max_per_session: 8,
		species_count: 1,
		bird_count: 12,
		encounter_count: 14,
		new_bird_count: 9,
		max_new_per_session: 6,
		max_weight: 13.1,
		avg_weight: 11.2,
		min_weight: 9.8,
		median_weight: 10.8,
		max_wing: 68,
		avg_wing: 66.6,
		min_wing: 65,
		median_wing: 67,
		pullus_bird_count: 1,
		juv_bird_count: 2,
		postjuv_bird_count: 1,
		adult_bird_count: 6,
		unknown_age_bird_count: 2,
		...overrides
	} as AggregateStatsResult;
}

describe('SpMonthTotalsTab', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(async () => {
		const { fetchSpeciesPeriodTotals } = await import('@/app/actions/sp-data');
		vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([
			buildMonthlyStat({ time_period: '2026-03-01' })
		]);
	});

	it('shows a loading spinner while data is fetching', async () => {
		const { fetchSpeciesPeriodTotals } = await import('@/app/actions/sp-data');
		let resolveData!: (v: AggregateStatsResult[]) => void;
		vi.mocked(fetchSpeciesPeriodTotals).mockReturnValue(
			new Promise((resolve) => {
				resolveData = resolve;
			})
		);
		render(
			<SpMonthTotalsTab speciesName="Robin" viewedGroupId={1} year={2026} />
		);
		expect(document.querySelector('.loading')).toBeDefined();
		resolveData([]);
	});

	it('fetches month-grouped totals scoped to the species and date range', async () => {
		const { fetchSpeciesPeriodTotals } = await import('@/app/actions/sp-data');
		render(
			<SpMonthTotalsTab
				speciesName="Robin"
				viewedGroupId={1}
				year={2026}
				fromDate="2026-01-01"
				toDate="2026-12-31"
			/>
		);
		await waitFor(() => {
			expect(screen.getByTestId('period-totals-table')).toBeTruthy();
		});
		expect(fetchSpeciesPeriodTotals).toHaveBeenCalledWith(
			'Robin',
			1,
			'month',
			'2026-01-01',
			'2026-12-31'
		);
	});

	it('renders a row for a month that has sessions, linking to /species/{name}/{year}/{month}', async () => {
		render(
			<SpMonthTotalsTab speciesName="Robin" viewedGroupId={1} year={2026} />
		);
		await waitFor(() => {
			// Only March has sessions in the default mock; the rest are
			// zero-filled and hidden by default.
			expect(document.querySelectorAll('tbody tr').length).toBe(1);
		});
		const marchLink = screen.getByRole('link', { name: 'March 2026' });
		expect(marchLink.getAttribute('href')).toBe('/species/Robin/2026/3');
	});

	it('renders a "Busiest session" column between Encounters and Birds', async () => {
		render(
			<SpMonthTotalsTab speciesName="Robin" viewedGroupId={1} year={2026} />
		);
		await waitFor(() => {
			expect(document.querySelectorAll('tbody tr').length).toBe(1);
		});
		const encountersIndex = getColumnIndex('Encounters');
		const busiestSessionIndex = getColumnIndex('Busiest session');
		const birdsIndex = getColumnIndex('Birds');
		expect(busiestSessionIndex).toBe(encountersIndex + 1);
		expect(busiestSessionIndex).toBe(birdsIndex - 1);
	});

	describe('empty months toggle', () => {
		it('renders only months with data by default (Hide)', async () => {
			render(
				<SpMonthTotalsTab speciesName="Robin" viewedGroupId={1} year={2026} />
			);
			await waitFor(() => {
				expect(document.querySelectorAll('tbody tr').length).toBe(1);
			});
			expect(
				(screen.getByRole('radio', { name: 'Hide' }) as HTMLInputElement)
					.checked
			).toBe(true);
			// Only March has sessions in the default mock.
			expect(screen.getByText('March 2026')).not.toBeNull();
		});

		it('shows all 12 months when toggled to Show', async () => {
			render(
				<SpMonthTotalsTab speciesName="Robin" viewedGroupId={1} year={2026} />
			);
			await waitFor(() => {
				expect(document.querySelectorAll('tbody tr').length).toBe(1);
			});
			fireEvent.click(screen.getByRole('radio', { name: 'Show' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(12);
			expect(screen.getByText('January 2026')).not.toBeNull();
			expect(screen.queryByRole('link', { name: 'January 2026' })).toBeNull();
			expect(screen.getByText('December 2026')).not.toBeNull();
			expect(screen.queryByRole('link', { name: 'December 2026' })).toBeNull();
		});

		it('restores hidden months when toggled back to Hide', async () => {
			render(
				<SpMonthTotalsTab speciesName="Robin" viewedGroupId={1} year={2026} />
			);
			await waitFor(() => {
				expect(document.querySelectorAll('tbody tr').length).toBe(1);
			});
			fireEvent.click(screen.getByRole('radio', { name: 'Show' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(12);
			fireEvent.click(screen.getByRole('radio', { name: 'Hide' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(1);
		});

		it('has no visible effect for a year with no empty months', async () => {
			const { fetchSpeciesPeriodTotals } =
				await import('@/app/actions/sp-data');
			vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue(
				Array.from({ length: 12 }, (_unused, index) =>
					buildMonthlyStat({
						time_period: `2026-${String(index + 1).padStart(2, '0')}-01`,
						session_count: 2
					})
				)
			);
			render(
				<SpMonthTotalsTab speciesName="Robin" viewedGroupId={1} year={2026} />
			);
			await waitFor(() => {
				expect(document.querySelectorAll('tbody tr').length).toBe(12);
			});
			fireEvent.click(screen.getByRole('radio', { name: 'Show' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(12);
		});

		it('shows exactly one month for a year that is empty except one', async () => {
			const { fetchSpeciesPeriodTotals } =
				await import('@/app/actions/sp-data');
			vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([
				buildMonthlyStat({ time_period: '2026-08-01', session_count: 3 })
			]);
			render(
				<SpMonthTotalsTab speciesName="Robin" viewedGroupId={1} year={2026} />
			);
			await waitFor(() => {
				expect(document.querySelectorAll('tbody tr').length).toBe(1);
			});
			expect(screen.getByText('August 2026')).not.toBeNull();
		});
	});
});
