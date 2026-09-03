import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { SpMonthTotalsTab } from '../SpMonthTotalsTab';
import type { AggregateStatsResult } from '@/app/models/db';

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
		new_young_bird_count: 3,
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

	it('zero-fills all 12 calendar months even when the RPC returned data for only some', async () => {
		render(
			<SpMonthTotalsTab speciesName="Robin" viewedGroupId={1} year={2026} />
		);
		await waitFor(() => {
			expect(document.querySelectorAll('tbody tr').length).toBe(12);
		});
	});

	it('renders a row per month, each one that has sessions linking to /species/{name}/{year}/{month}', async () => {
		render(
			<SpMonthTotalsTab speciesName="Robin" viewedGroupId={1} year={2026} />
		);
		await waitFor(() => {
			expect(document.querySelectorAll('tbody tr').length).toBe(12);
		});
		expect(screen.getByText('January 2026')).not.toBeNull();
		expect(screen.queryByRole('link', { name: 'January 2026' })).toBeNull();
		const marchLink = screen.getByRole('link', { name: 'March 2026' });
		expect(marchLink.getAttribute('href')).toBe('/species/Robin/2026/3');
		expect(screen.getByText('December 2026')).not.toBeNull();
		expect(screen.queryByRole('link', { name: 'December 2026' })).toBeNull();
	});
});
