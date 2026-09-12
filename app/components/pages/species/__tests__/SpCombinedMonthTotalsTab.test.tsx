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
import { getCellTextByHeading } from '@/app/__tests__/helpers/table';

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

		it("renders the folded rows through PeriodTotalsTable with month labels consistent with the group-wide 'Month totals' convention", async () => {
			render(
				<SpCombinedMonthTotalsTab
					speciesName="Robin"
					viewedGroupId={1}
					isActive={true}
				/>
			);
			await waitFor(() => {
				// Hide default: only January (the sole nonzero folded bucket) shows.
				expect(document.querySelectorAll('tbody tr').length).toBe(1);
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
				// Hide default: only January (the sole nonzero folded bucket) shows.
				expect(document.querySelectorAll('tbody tr').length).toBe(1);
			});
			expect(getCellTextByHeading('Encounters', 'January')).toBe('75');
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

		it('shows "No data recorded." rather than erroring when the species has no recorded history at all', async () => {
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
				// Every zero-filled month is empty, so Hide default filters all 12
				// away.
				expect(screen.getByText('No data recorded.')).toBeTruthy();
			});
			expect(document.querySelectorAll('tbody tr').length).toBe(0);
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
				// Hide default: only January (the sole nonzero folded bucket) shows.
				expect(document.querySelectorAll('tbody tr').length).toBe(1);
			});
			const encounterToggle = screen.getByRole('radio', {
				name: 'Encounter'
			}) as HTMLInputElement;
			expect(encounterToggle.checked).toBe(true);
			expect(encounterToggle.disabled).toBe(true);
			const table = screen.getByRole('table');
			table.querySelectorAll('tbody tr').forEach((_, rowIndex) => {
				expect(getCellTextByHeading(table, 'Birds', rowIndex)).toBe('-');
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
				// Hide default: only January and August (the nonzero folded
				// buckets) show.
				expect(document.querySelectorAll('tbody tr').length).toBe(2)
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
				expect(document.querySelectorAll('tbody tr').length).toBe(2)
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
				expect(document.querySelectorAll('tbody tr').length).toBe(1)
			);
			fireEvent.click(screen.getByRole('radio', { name: 'By year' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(1);

			// Unlocked, the toggle defaults to 'Bird' (matching every other
			// unlocked `PeriodTotalsTable` usage), so the bird-based count is
			// already showing without needing to click anything.
			expect(
				(screen.getByRole('radio', { name: 'Bird' }) as HTMLInputElement)
					.checked
			).toBe(true);
			expect(getCellTextByHeading('Pulli', 0)).toBe('2');

			fireEvent.click(screen.getByRole('radio', { name: 'Encounter' }));
			expect(getCellTextByHeading('Pulli', 0)).toBe('5');

			fireEvent.click(screen.getByRole('radio', { name: 'Bird' }));
			expect(getCellTextByHeading('Pulli', 0)).toBe('2');
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
				expect(document.querySelectorAll('tbody tr').length).toBe(2)
			);

			fireEvent.click(screen.getByRole('radio', { name: 'By year' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(3);

			fireEvent.click(screen.getByRole('radio', { name: 'Combined' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(2);
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
				expect(document.querySelectorAll('tbody tr').length).toBe(2)
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
				expect(document.querySelectorAll('tbody tr').length).toBe(2)
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
				// Hide default: only the single nonzero folded January bucket shows.
				expect(document.querySelectorAll('tbody tr').length).toBe(1)
			);
			// Combined: with only one contributing year, the January bucket's
			// summed value equals that single year's own value.
			expect(getCellTextByHeading('Encounters', 'January')).toBe('30');

			fireEvent.click(screen.getByRole('radio', { name: 'By year' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(1);
			expect(getCellTextByHeading('Encounters', 'January')).toBe('30');
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
				expect(document.querySelectorAll('tbody tr').length).toBe(2)
			);
			expect(fetchSpeciesPeriodTotals).toHaveBeenCalledTimes(1);

			fireEvent.click(screen.getByRole('radio', { name: 'By year' }));
			fireEvent.click(screen.getByRole('radio', { name: 'Combined' }));
			fireEvent.click(screen.getByRole('radio', { name: 'By year' }));

			expect(fetchSpeciesPeriodTotals).toHaveBeenCalledTimes(1);
		});
	});
});

describe('SpCombinedMonthTotalsTab — empty months toggle', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(async () => {
		const { fetchSpeciesPeriodTotals } = await import('@/app/actions/sp-data');
		vi.mocked(fetchSpeciesPeriodTotals).mockReset();
		vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([
			buildMonthlyStat({ time_period: '2020-01-01', session_count: 4 })
		]);
	});

	describe('Usual', () => {
		it('renders only months with data by default (Hide)', async () => {
			render(
				<SpCombinedMonthTotalsTab
					speciesName="Robin"
					viewedGroupId={1}
					isActive={true}
				/>
			);
			await waitFor(() =>
				// Only January is folded from a real year; the rest are synthesized
				// and hidden by default.
				expect(document.querySelectorAll('tbody tr').length).toBe(1)
			);
			expect(
				(screen.getByRole('radio', { name: 'Hide' }) as HTMLInputElement)
					.checked
			).toBe(true);
			expect(screen.getByText('January')).toBeTruthy();
		});
	});

	describe('Structure', () => {
		it('shows zero-session months in the combined view when toggled to Show', async () => {
			render(
				<SpCombinedMonthTotalsTab
					speciesName="Robin"
					viewedGroupId={1}
					isActive={true}
				/>
			);
			await waitFor(() =>
				expect(document.querySelectorAll('tbody tr').length).toBe(1)
			);
			fireEvent.click(screen.getByRole('radio', { name: 'Show' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(12);
			expect(screen.getByText('January')).toBeTruthy();
		});

		it('shows zero-session months in the by-year view when toggled to Show', async () => {
			const { fetchSpeciesPeriodTotals } =
				await import('@/app/actions/sp-data');
			vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([
				buildMonthlyStat({ time_period: '2020-01-01', session_count: 4 }),
				buildMonthlyStat({ time_period: '2020-08-01', session_count: 0 })
			]);
			render(
				<SpCombinedMonthTotalsTab
					speciesName="Robin"
					viewedGroupId={1}
					isActive={true}
				/>
			);
			await waitFor(() =>
				// The August row (session_count 0) is dropped by default; January
				// (4) stays.
				expect(document.querySelectorAll('tbody tr').length).toBe(1)
			);
			fireEvent.click(screen.getByRole('radio', { name: 'By year' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(1);
			expect(screen.getByText('January 2020')).toBeTruthy();
			fireEvent.click(screen.getByRole('radio', { name: 'Show' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(2);
			expect(screen.getByText('August 2020')).toBeTruthy();
		});
	});

	describe('Edge', () => {
		it('has no visible effect when no calendar month is empty across any year', async () => {
			const { fetchSpeciesPeriodTotals } =
				await import('@/app/actions/sp-data');
			vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue(
				Array.from({ length: 12 }, (_unused, index) =>
					buildMonthlyStat({
						time_period: `2020-${String(index + 1).padStart(2, '0')}-01`,
						session_count: 3
					})
				)
			);
			render(
				<SpCombinedMonthTotalsTab
					speciesName="Robin"
					viewedGroupId={1}
					isActive={true}
				/>
			);
			await waitFor(() =>
				// Hide default has nothing to filter, since no month is empty.
				expect(document.querySelectorAll('tbody tr').length).toBe(12)
			);
			fireEvent.click(screen.getByRole('radio', { name: 'Show' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(12);
		});

		it('shows only the months with data by default when all but one calendar month is empty across all years', async () => {
			const { fetchSpeciesPeriodTotals } =
				await import('@/app/actions/sp-data');
			vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([
				buildMonthlyStat({ time_period: '2020-08-01', session_count: 5 }),
				buildMonthlyStat({ time_period: '2021-08-01', session_count: 2 })
			]);
			render(
				<SpCombinedMonthTotalsTab
					speciesName="Robin"
					viewedGroupId={1}
					isActive={true}
				/>
			);
			await waitFor(() =>
				// Both years fold into the single August bucket.
				expect(document.querySelectorAll('tbody tr').length).toBe(1)
			);
			expect(screen.getByText('August')).toBeTruthy();
		});

		it('toggling combine-years does not reset the empty-months toggle, and vice versa', async () => {
			const { fetchSpeciesPeriodTotals } =
				await import('@/app/actions/sp-data');
			vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([
				buildMonthlyStat({ time_period: '2020-01-01', session_count: 4 })
			]);
			render(
				<SpCombinedMonthTotalsTab
					speciesName="Robin"
					viewedGroupId={1}
					isActive={true}
				/>
			);
			await waitFor(() =>
				expect(document.querySelectorAll('tbody tr').length).toBe(1)
			);
			// Hide is already the default. Flip combine-years — empty-months
			// stays Hide.
			fireEvent.click(screen.getByRole('radio', { name: 'By year' }));
			expect(
				(screen.getByRole('radio', { name: 'Hide' }) as HTMLInputElement)
					.checked
			).toBe(true);
			// Flip combine-years back — still Hide.
			fireEvent.click(screen.getByRole('radio', { name: 'Combined' }));
			expect(
				(screen.getByRole('radio', { name: 'Hide' }) as HTMLInputElement)
					.checked
			).toBe(true);
			// And combine-years is unaffected by toggling empty-months.
			fireEvent.click(screen.getByRole('radio', { name: 'Show' }));
			expect(
				(screen.getByRole('radio', { name: 'Combined' }) as HTMLInputElement)
					.checked
			).toBe(true);
		});
	});
});
