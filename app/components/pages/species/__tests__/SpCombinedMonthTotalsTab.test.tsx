import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	waitFor,
	fireEvent
} from '@testing-library/react';
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

describe('species all-time Month totals tab — Combine years toggle', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(async () => {
		const { fetchSpeciesPeriodTotals } = await import('@/app/actions/sp-data');
		vi.mocked(fetchSpeciesPeriodTotals).mockReset();
		vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([
			buildMonthlyStat({ time_period: '2020-01-01' }),
			buildMonthlyStat({ time_period: '2021-01-01' }),
			buildMonthlyStat({ time_period: '2020-08-01' })
		]);
	});

	describe('Usual', () => {
		it('defaults to combined calendar-month rows, encounters-only, with the bird/encounter toggle disabled', async () => {
			render(
				<SpCombinedMonthTotalsTab
					speciesName="Robin"
					viewedGroupId={1}
					isActive={true}
				/>
			);
			await waitFor(() =>
				expect(document.querySelectorAll('tbody tr').length).toBe(12)
			);
			expect(
				(screen.getByRole('radio', { name: 'Combined' }) as HTMLInputElement)
					.checked
			).toBe(true);
			expect(
				(screen.getByRole('radio', { name: 'Encounter' }) as HTMLInputElement)
					.disabled
			).toBe(true);
		});

		it('switching the toggle off renders one row per (month, year) combination returned for the species, without summing', async () => {
			render(
				<SpCombinedMonthTotalsTab
					speciesName="Robin"
					viewedGroupId={1}
					isActive={true}
				/>
			);
			await waitFor(() =>
				expect(document.querySelectorAll('tbody tr').length).toBe(12)
			);

			fireEvent.click(screen.getByRole('radio', { name: 'By year' }));

			expect(document.querySelectorAll('tbody tr').length).toBe(3);
			expect(
				screen.getByRole('link', { name: 'January 2020' }).getAttribute('href')
			).toBe('/species/Robin/2020/1');
			expect(
				screen.getByRole('link', { name: 'January 2021' }).getAttribute('href')
			).toBe('/species/Robin/2021/1');
			expect(
				screen.getByRole('link', { name: 'August 2020' }).getAttribute('href')
			).toBe('/species/Robin/2020/8');
		});

		it("switching the toggle off enables the bird/encounter toggle, and selecting 'Bird' re-derives the rendered rows as bird-based", async () => {
			const { fetchSpeciesPeriodTotals } =
				await import('@/app/actions/sp-data');
			vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([
				buildMonthlyStat({
					time_period: '2020-01-01',
					pullus_bird_count: 2,
					...({ pullus_enc_count: 5 } as Partial<AggregateStatsResult>)
				})
			]);
			render(
				<SpCombinedMonthTotalsTab
					speciesName="Robin"
					viewedGroupId={1}
					isActive={true}
				/>
			);
			await waitFor(() =>
				expect(document.querySelectorAll('tbody tr').length).toBe(12)
			);
			fireEvent.click(screen.getByRole('radio', { name: 'By year' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(1);

			const getPullusCell = () =>
				document.querySelector('tbody tr')?.querySelectorAll('td')[8];
			// Unlocked, the toggle defaults to 'Bird' (matching every other
			// unlocked `PeriodTotalsTable` usage), so the bird-based count is
			// already showing without needing to click anything.
			expect(
				(screen.getByRole('radio', { name: 'Bird' }) as HTMLInputElement)
					.checked
			).toBe(true);
			expect(getPullusCell()?.textContent).toBe('2');

			fireEvent.click(screen.getByRole('radio', { name: 'Encounter' }));
			expect(getPullusCell()?.textContent).toBe('5');

			fireEvent.click(screen.getByRole('radio', { name: 'Bird' }));
			expect(getPullusCell()?.textContent).toBe('2');
		});

		it('switching the toggle back on restores the combined, encounters-only view and disables the bird/encounter toggle again', async () => {
			render(
				<SpCombinedMonthTotalsTab
					speciesName="Robin"
					viewedGroupId={1}
					isActive={true}
				/>
			);
			await waitFor(() =>
				expect(document.querySelectorAll('tbody tr').length).toBe(12)
			);

			fireEvent.click(screen.getByRole('radio', { name: 'By year' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(3);

			fireEvent.click(screen.getByRole('radio', { name: 'Combined' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(12);
			expect(
				(screen.getByRole('radio', { name: 'Encounter' }) as HTMLInputElement)
					.disabled
			).toBe(true);
		});
	});

	describe('Structure', () => {
		it('the combine-years control is the same shared component/pattern used by the group-wide all-time Month totals tab (#635), not a bespoke implementation', async () => {
			render(
				<SpCombinedMonthTotalsTab
					speciesName="Robin"
					viewedGroupId={1}
					isActive={true}
				/>
			);
			await waitFor(() =>
				expect(document.querySelectorAll('tbody tr').length).toBe(12)
			);
			// `CombineYearsToggle`'s exact copy/markup (shared with
			// `SummaryTotalsSection`'s `AllTimeMonthTotalsTab`) rather than a
			// bespoke species-only control.
			expect(screen.getByText('Combine years:')).toBeTruthy();
			expect(screen.getByRole('radio', { name: 'Combined' })).toBeTruthy();
			expect(screen.getByRole('radio', { name: 'By year' })).toBeTruthy();
		});

		it('per-row (toggle-off) rows link to /species/{speciesName}/{year}/{month} for each row', async () => {
			render(
				<SpCombinedMonthTotalsTab
					speciesName="Blackbird"
					viewedGroupId={1}
					isActive={true}
				/>
			);
			await waitFor(() =>
				expect(document.querySelectorAll('tbody tr').length).toBe(12)
			);
			fireEvent.click(screen.getByRole('radio', { name: 'By year' }));

			[
				['January 2020', '/species/Blackbird/2020/1'],
				['January 2021', '/species/Blackbird/2021/1'],
				['August 2020', '/species/Blackbird/2020/8']
			].forEach(([label, href]) => {
				expect(
					screen.getByRole('link', { name: label }).getAttribute('href')
				).toBe(href);
			});
		});
	});

	describe('Edge', () => {
		it('a species with data in only one year renders matching values for that month whether combine-years is on or off', async () => {
			const { fetchSpeciesPeriodTotals } =
				await import('@/app/actions/sp-data');
			vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([
				buildMonthlyStat({ time_period: '2020-01-01', encounter_count: 30 })
			]);
			render(
				<SpCombinedMonthTotalsTab
					speciesName="Robin"
					viewedGroupId={1}
					isActive={true}
				/>
			);
			await waitFor(() =>
				expect(document.querySelectorAll('tbody tr').length).toBe(12)
			);
			// Combined: with only one contributing year, the January bucket's
			// summed value equals that single year's own value.
			const combinedJanuaryRow = screen.getByText('January').closest('tr');
			const combinedCells = combinedJanuaryRow?.querySelectorAll('td') ?? [];
			expect(combinedCells[4]?.textContent).toBe('30');

			fireEvent.click(screen.getByRole('radio', { name: 'By year' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(1);
			const perYearRow = document.querySelector('tbody tr');
			const perYearCells = perYearRow?.querySelectorAll('td') ?? [];
			expect(perYearCells[4]?.textContent).toBe('30');
		});

		it("a species with no recorded data shows 12 zero-filled rows when combined, and 'No data recorded.' when combine-years is off, without erroring", async () => {
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
			await waitFor(() =>
				expect(document.querySelectorAll('tbody tr').length).toBe(12)
			);

			fireEvent.click(screen.getByRole('radio', { name: 'By year' }));

			expect(screen.getByText('No data recorded.')).toBeTruthy();
			expect(document.querySelectorAll('tbody tr').length).toBe(0);
		});

		it('toggling combine-years on and off repeatedly does not trigger any additional fetch of species period totals', async () => {
			const { fetchSpeciesPeriodTotals } =
				await import('@/app/actions/sp-data');
			render(
				<SpCombinedMonthTotalsTab
					speciesName="Robin"
					viewedGroupId={1}
					isActive={true}
				/>
			);
			await waitFor(() =>
				expect(document.querySelectorAll('tbody tr').length).toBe(12)
			);
			expect(fetchSpeciesPeriodTotals).toHaveBeenCalledTimes(1);

			fireEvent.click(screen.getByRole('radio', { name: 'By year' }));
			fireEvent.click(screen.getByRole('radio', { name: 'Combined' }));
			fireEvent.click(screen.getByRole('radio', { name: 'By year' }));

			expect(fetchSpeciesPeriodTotals).toHaveBeenCalledTimes(1);
		});
	});
});
