import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { SpYearTotalsTab } from '../SpYearTotalsTab';
import type { AggregateStatsResult } from '@/app/models/db';

vi.mock('@/app/actions/sp-data', () => ({
	fetchSpeciesPeriodTotals: vi.fn()
}));

function buildYearlyStat(
	overrides: Partial<AggregateStatsResult> = {}
): AggregateStatsResult {
	return {
		species_name: null,
		time_period: '2026-01-01',
		session_count: 4,
		total_effort: '18:00:00',
		effort_per_session: '02:00:00',
		effort_per_encounter: '02:34:17',
		avg_encounters_per_session: 1.75,
		max_per_session: 3,
		species_count: 1,
		bird_count: 40,
		encounter_count: 55,
		new_bird_count: 30,
		max_new_per_session: 3,
		max_weight: 13.1,
		avg_weight: 11.2,
		min_weight: 9.8,
		median_weight: 10.8,
		max_wing: 68,
		avg_wing: 66.6,
		min_wing: 65,
		median_wing: 67,
		pullus_bird_count: 2,
		juv_bird_count: 5,
		postjuv_bird_count: 3,
		adult_bird_count: 15,
		unknown_age_bird_count: 5,
		new_young_bird_count: 7,
		...overrides
	} as AggregateStatsResult;
}

describe('SpYearTotalsTab', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(async () => {
		const { fetchSpeciesPeriodTotals } = await import('@/app/actions/sp-data');
		vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([
			buildYearlyStat({ time_period: '2025-01-01' }),
			buildYearlyStat({ time_period: '2026-01-01' })
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

	it('shows the period table empty state when no years are returned', async () => {
		const { fetchSpeciesPeriodTotals } = await import('@/app/actions/sp-data');
		vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([]);
		render(<SpYearTotalsTab speciesName="Robin" viewedGroupId={1} />);
		await waitFor(() => {
			expect(screen.getByText('No data recorded.')).toBeTruthy();
		});
	});
});
