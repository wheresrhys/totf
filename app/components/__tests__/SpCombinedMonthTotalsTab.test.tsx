import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { SpCombinedMonthTotalsTab } from '../SpCombinedMonthTotalsTab';
import type { AggregateStatsResult } from '@/app/models/db';

vi.mock('@/app/actions/sp-data', () => ({
	fetchSpeciesPeriodTotals: vi.fn()
}));

function buildMonthlyStat(
	overrides: Partial<AggregateStatsResult> = {}
): AggregateStatsResult {
	return {
		species_name: null,
		time_period: '2020-01-01',
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

describe('SpCombinedMonthTotalsTab', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(async () => {
		const { fetchSpeciesPeriodTotals } = await import('@/app/actions/sp-data');
		vi.mocked(fetchSpeciesPeriodTotals).mockReset();
		vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([
			buildMonthlyStat({ time_period: '2020-01-01' })
		]);
	});

	describe('Usual', () => {
		it('fetches species month totals with no date range once the tab becomes active', async () => {
			const { fetchSpeciesPeriodTotals } =
				await import('@/app/actions/sp-data');
			render(
				<SpCombinedMonthTotalsTab
					speciesName="Robin"
					viewedGroupId={1}
					isActive={true}
				/>
			);
			await waitFor(() => {
				expect(screen.getByTestId('period-totals-table')).toBeTruthy();
			});
			expect(fetchSpeciesPeriodTotals).toHaveBeenCalledWith(
				'Robin',
				1,
				'month'
			);
		});

		it('renders 12 calendar-month rows, Jan through Dec, folded across every recorded year for the species', async () => {
			const { fetchSpeciesPeriodTotals } =
				await import('@/app/actions/sp-data');
			vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([
				buildMonthlyStat({ time_period: '2020-01-01' }),
				buildMonthlyStat({ time_period: '2021-01-01' }),
				buildMonthlyStat({ time_period: '2020-08-01' })
			]);
			render(
				<SpCombinedMonthTotalsTab
					speciesName="Robin"
					viewedGroupId={1}
					isActive={true}
				/>
			);
			await waitFor(() => {
				expect(document.querySelectorAll('tbody tr').length).toBe(12);
			});
		});

		it("renders the folded rows through PeriodTotalsTable with month labels consistent with the group-wide 'Month totals' convention", async () => {
			render(
				<SpCombinedMonthTotalsTab
					speciesName="Robin"
					viewedGroupId={1}
					isActive={true}
				/>
			);
			await waitFor(() => {
				expect(document.querySelectorAll('tbody tr').length).toBe(12);
			});
			// Combine-years labels are month name only — no year, no link.
			expect(screen.getByText('January')).toBeTruthy();
			expect(screen.queryByText('January 2020')).toBeNull();
			expect(screen.queryByRole('link', { name: 'January' })).toBeNull();
		});
	});

	describe('Structure', () => {
		it("sums a given month's stats across multiple years into a single folded row", async () => {
			const { fetchSpeciesPeriodTotals } =
				await import('@/app/actions/sp-data');
			vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([
				buildMonthlyStat({ time_period: '2020-01-01', encounter_count: 30 }),
				buildMonthlyStat({ time_period: '2021-01-01', encounter_count: 45 })
			]);
			render(
				<SpCombinedMonthTotalsTab
					speciesName="Robin"
					viewedGroupId={1}
					isActive={true}
				/>
			);
			await waitFor(() => {
				expect(document.querySelectorAll('tbody tr').length).toBe(12);
			});
			const januaryRow = screen.getByText('January').closest('tr');
			const cells = januaryRow?.querySelectorAll('td') ?? [];
			expect(cells[4]?.textContent).toBe('75');
		});

		it('shows a loading state before the fetch resolves', async () => {
			const { fetchSpeciesPeriodTotals } =
				await import('@/app/actions/sp-data');
			let resolveData!: (v: AggregateStatsResult[]) => void;
			vi.mocked(fetchSpeciesPeriodTotals).mockReturnValue(
				new Promise((resolve) => {
					resolveData = resolve;
				})
			);
			render(
				<SpCombinedMonthTotalsTab
					speciesName="Robin"
					viewedGroupId={1}
					isActive={true}
				/>
			);
			expect(document.querySelector('.loading')).toBeTruthy();
			resolveData([]);
		});
	});

	describe('Edge', () => {
		it('does not call fetchSpeciesPeriodTotals until the tab is selected', async () => {
			const { fetchSpeciesPeriodTotals } =
				await import('@/app/actions/sp-data');
			render(
				<SpCombinedMonthTotalsTab
					speciesName="Robin"
					viewedGroupId={1}
					isActive={false}
				/>
			);
			expect(fetchSpeciesPeriodTotals).not.toHaveBeenCalled();
		});

		it('renders all 12 months with zero-filled stats when the species has no recorded history at all', async () => {
			const { fetchSpeciesPeriodTotals } =
				await import('@/app/actions/sp-data');
			vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([]);
			render(
				<SpCombinedMonthTotalsTab
					speciesName="Robin"
					viewedGroupId={1}
					isActive={true}
				/>
			);
			await waitFor(() => {
				expect(document.querySelectorAll('tbody tr').length).toBe(12);
			});
			const januaryRow = screen.getByText('January').closest('tr');
			const cells = januaryRow?.querySelectorAll('td') ?? [];
			expect(cells[4]?.textContent).toBe('0');
		});

		it("disables the AggregateByToggle and renders the birds/individuals column as '-'", async () => {
			render(
				<SpCombinedMonthTotalsTab
					speciesName="Robin"
					viewedGroupId={1}
					isActive={true}
				/>
			);
			await waitFor(() => {
				expect(document.querySelectorAll('tbody tr').length).toBe(12);
			});
			const encounterToggle = screen.getByRole('radio', {
				name: 'Encounter'
			}) as HTMLInputElement;
			expect(encounterToggle.checked).toBe(true);
			expect(encounterToggle.disabled).toBe(true);
			document.querySelectorAll('tbody tr').forEach((row) => {
				const cells = row.querySelectorAll('td');
				expect(cells[5]?.textContent).toBe('-');
			});
		});
	});
});
