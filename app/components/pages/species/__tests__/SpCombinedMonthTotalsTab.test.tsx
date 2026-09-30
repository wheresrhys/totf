import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	waitFor,
	fireEvent
} from '@testing-library/react';
import { SpCombinedMonthTotalsTab } from '../SpCombinedMonthTotalsTab';
import type { CoreStatsResult } from '@/app/models/db';
import {
	getCellTextByHeading,
	getColumnIndex
} from '@/app/__tests__/helpers/table';
import {
	buildCoreStatsRow,
	buildMonthSquashedFixture
} from '@/app/__tests__/helpers/core-stats-fixtures';

vi.mock('@/app/actions/sp-data', () => ({
	fetchSpeciesPeriodTotals: vi.fn(),
	fetchSpeciesCombinedMonthTotals: vi.fn()
}));

function renderTab(
	overrides: Partial<{
		speciesName: string;
		viewedGroupId: number;
		isActive: boolean;
	}> = {}
) {
	const props = {
		speciesName: 'Robin',
		viewedGroupId: 1,
		isActive: true,
		...overrides
	};
	return render(
		<SpCombinedMonthTotalsTab
			speciesName={props.speciesName}
			viewedGroupId={props.viewedGroupId}
			isActive={props.isActive}
		/>
	);
}

describe('SpCombinedMonthTotalsTab', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(async () => {
		const { fetchSpeciesPeriodTotals, fetchSpeciesCombinedMonthTotals } =
			await import('@/app/actions/sp-data');
		vi.mocked(fetchSpeciesPeriodTotals).mockReset();
		vi.mocked(fetchSpeciesCombinedMonthTotals).mockReset();
		vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([
			buildCoreStatsRow({ time_period: '2020-01-01' })
		]);
		vi.mocked(fetchSpeciesCombinedMonthTotals).mockResolvedValue([
			buildCoreStatsRow({ time_period: '2000-01-01' })
		]);
	});

	describe('Usual', () => {
		it('fetches both species period totals and species combined month totals with no date range once the tab becomes active', async () => {
			const { fetchSpeciesPeriodTotals, fetchSpeciesCombinedMonthTotals } =
				await import('@/app/actions/sp-data');
			renderTab();
			await waitFor(() => {
				expect(screen.getByTestId('period-totals-table')).toBeTruthy();
			});
			expect(fetchSpeciesPeriodTotals).toHaveBeenCalledWith(
				'Robin',
				1,
				'month'
			);
			expect(fetchSpeciesCombinedMonthTotals).toHaveBeenCalledWith('Robin', 1);
		});

		it("renders the month-squashed rows through PeriodTotalsTable with month labels consistent with the group-wide 'Month totals' convention", async () => {
			renderTab();
			await waitFor(() => {
				// Hide default: only January (the sole nonzero month-squashed row)
				// shows.
				expect(document.querySelectorAll('tbody tr').length).toBe(1);
			});
			// Combine-years labels are month name only — no year — and link into
			// the squashed-month species page (#1005).
			expect(screen.queryByText('January 2020')).toBeNull();
			expect(
				screen.getByRole('link', { name: 'January' }).getAttribute('href')
			).toBe('/species/Robin/jan');
		});

		it('renders a "Busiest session" column between Encounters and Birds', async () => {
			renderTab();
			await waitFor(() => {
				expect(document.querySelectorAll('tbody tr').length).toBe(1);
			});
			const encountersIndex = getColumnIndex('Encounters');
			const busiestSessionIndex = getColumnIndex('Busiest session');
			const birdsIndex = getColumnIndex('Birds');
			expect(busiestSessionIndex).toBe(encountersIndex + 1);
			expect(busiestSessionIndex).toBe(birdsIndex - 1);
		});
	});

	describe('Structure', () => {
		it("uses the 'month-squashed' RPC row's value directly, not summed from the per-year fetchSpeciesPeriodTotals rows", async () => {
			const { fetchSpeciesPeriodTotals, fetchSpeciesCombinedMonthTotals } =
				await import('@/app/actions/sp-data');
			// Per-year rows that would sum to 75 if folded client-side — the
			// combined view must ignore these and use the RPC's own value instead.
			vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([
				buildCoreStatsRow({ time_period: '2020-01-01', encounter_count: 30 }),
				buildCoreStatsRow({ time_period: '2021-01-01', encounter_count: 45 })
			]);
			vi.mocked(fetchSpeciesCombinedMonthTotals).mockResolvedValue([
				buildCoreStatsRow({ time_period: '2000-01-01', encounter_count: 75 })
			]);
			renderTab();
			await waitFor(() => {
				// Hide default: only January (the sole nonzero month-squashed row)
				// shows.
				expect(document.querySelectorAll('tbody tr').length).toBe(1);
			});
			expect(getCellTextByHeading('Encounters', 'January')).toBe('75');
		});

		it('shows a loading state before the fetch resolves', async () => {
			const { fetchSpeciesPeriodTotals } =
				await import('@/app/actions/sp-data');
			let resolveData!: (v: CoreStatsResult[]) => void;
			vi.mocked(fetchSpeciesPeriodTotals).mockReturnValue(
				new Promise((resolve) => {
					resolveData = resolve;
				})
			);
			renderTab();
			expect(document.querySelector('.loading')).toBeTruthy();
			resolveData([]);
		});
	});

	describe('Edge', () => {
		it('does not call fetchSpeciesPeriodTotals or fetchSpeciesCombinedMonthTotals until the tab is selected', async () => {
			const { fetchSpeciesPeriodTotals, fetchSpeciesCombinedMonthTotals } =
				await import('@/app/actions/sp-data');
			renderTab({ isActive: false });
			expect(fetchSpeciesPeriodTotals).not.toHaveBeenCalled();
			expect(fetchSpeciesCombinedMonthTotals).not.toHaveBeenCalled();
		});

		it('shows "No data recorded." rather than erroring when the species has no recorded history at all', async () => {
			const { fetchSpeciesPeriodTotals, fetchSpeciesCombinedMonthTotals } =
				await import('@/app/actions/sp-data');
			vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([]);
			vi.mocked(fetchSpeciesCombinedMonthTotals).mockResolvedValue([]);
			renderTab();
			await waitFor(() => {
				// Every zero-filled month is empty, so Hide default filters all 12
				// away.
				expect(screen.getByText('No data recorded.')).toBeTruthy();
			});
			expect(document.querySelectorAll('tbody tr').length).toBe(0);
		});

		it('no longer locks the Aggregate-by toggle to Encounter, now that bird_count is accurate', async () => {
			const { fetchSpeciesCombinedMonthTotals } =
				await import('@/app/actions/sp-data');
			vi.mocked(fetchSpeciesCombinedMonthTotals).mockResolvedValue([
				buildCoreStatsRow({ time_period: '2000-01-01', bird_count: 40 })
			]);
			renderTab();
			await waitFor(() => {
				expect(document.querySelectorAll('tbody tr').length).toBe(1);
			});
			const bird = screen.getByRole('radio', {
				name: 'Bird'
			}) as HTMLInputElement;
			const encounter = screen.getByRole('radio', {
				name: 'Encounter'
			}) as HTMLInputElement;
			expect(bird.checked).toBe(true);
			expect(bird.disabled).toBe(false);
			expect(encounter.disabled).toBe(false);
			expect(getCellTextByHeading('Birds', 0)).toBe('40');
		});
	});
});

describe('species all-time Month totals tab — Combine years toggle', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(async () => {
		const { fetchSpeciesPeriodTotals, fetchSpeciesCombinedMonthTotals } =
			await import('@/app/actions/sp-data');
		vi.mocked(fetchSpeciesPeriodTotals).mockReset();
		vi.mocked(fetchSpeciesCombinedMonthTotals).mockReset();
		vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([
			buildCoreStatsRow({ time_period: '2020-01-01' }),
			buildCoreStatsRow({ time_period: '2021-01-01' }),
			buildCoreStatsRow({ time_period: '2020-08-01' })
		]);
		// One row per calendar month as the 'month-squashed' RPC mode returns
		// them — deliberately not the sum of the two January rows above (that's
		// exactly the double-count the fix removes).
		vi.mocked(fetchSpeciesCombinedMonthTotals).mockResolvedValue([
			buildCoreStatsRow({
				time_period: '2000-01-01',
				session_count: 10,
				encounter_count: 75,
				bird_count: 50,
				pullus_bird_count: 2,
				...({ pullus_enc_count: 5 } as Partial<CoreStatsResult>)
			}),
			buildCoreStatsRow({
				time_period: '2000-08-01',
				session_count: 2,
				encounter_count: 11,
				bird_count: 9
			})
		]);
	});

	describe('Usual', () => {
		it('defaults to combined calendar-month rows, encounters-only, with the bird/encounter toggle enabled', async () => {
			renderTab();
			await waitFor(() =>
				// Hide default: only January and August (the nonzero month-squashed
				// rows) show.
				expect(document.querySelectorAll('tbody tr').length).toBe(2)
			);
			expect(
				(screen.getByRole('radio', { name: 'Combined' }) as HTMLInputElement)
					.checked
			).toBe(true);
			expect(
				(screen.getByRole('radio', { name: 'Bird' }) as HTMLInputElement)
					.checked
			).toBe(true);
			expect(
				(screen.getByRole('radio', { name: 'Encounter' }) as HTMLInputElement)
					.disabled
			).toBe(false);
		});

		it('switching the toggle off renders one row per (month, year) combination returned for the species, without summing', async () => {
			renderTab();
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
				buildCoreStatsRow({
					time_period: '2020-01-01',
					pullus_bird_count: 2,
					...({ pullus_enc_count: 5 } as Partial<CoreStatsResult>)
				})
			]);
			renderTab();
			await waitFor(() =>
				// Combined (default) view uses the mocked month-squashed rows,
				// unaffected by the fetchSpeciesPeriodTotals override above.
				expect(document.querySelectorAll('tbody tr').length).toBe(2)
			);
			fireEvent.click(screen.getByRole('radio', { name: 'By year' }));
			await waitFor(() =>
				expect(document.querySelectorAll('tbody tr').length).toBe(1)
			);

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

		it('switching the toggle back on restores the combined, encounters-only view, keeping the bird/encounter toggle enabled', async () => {
			renderTab();
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
			).toBe(false);
		});
	});

	describe('Structure', () => {
		it("in the 'Combined' state, toggling AggregateByToggle between Bird and Encounter changes the rendered counts, now that it's unlocked", async () => {
			renderTab();
			await waitFor(() =>
				expect(document.querySelectorAll('tbody tr').length).toBe(2)
			);
			expect(getCellTextByHeading('Pulli', 0)).toBe('2');
			fireEvent.click(screen.getByRole('radio', { name: 'Encounter' }));
			expect(getCellTextByHeading('Pulli', 0)).toBe('5');
		});

		it('the combine-years control is the same shared component/pattern used by the group-wide all-time Month totals tab (#635), not a bespoke implementation', async () => {
			renderTab();
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
			renderTab({ speciesName: 'Blackbird' });
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
			const { fetchSpeciesPeriodTotals, fetchSpeciesCombinedMonthTotals } =
				await import('@/app/actions/sp-data');
			vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([
				buildCoreStatsRow({ time_period: '2020-01-01', encounter_count: 30 })
			]);
			vi.mocked(fetchSpeciesCombinedMonthTotals).mockResolvedValue([
				buildCoreStatsRow({ time_period: '2000-01-01', encounter_count: 30 })
			]);
			renderTab();
			await waitFor(() =>
				// Hide default: only the single nonzero month-squashed January row
				// shows.
				expect(document.querySelectorAll('tbody tr').length).toBe(1)
			);
			// Combined: with only one contributing year, the RPC's January value
			// equals that single year's own value.
			expect(getCellTextByHeading('Encounters', 'January')).toBe('30');

			fireEvent.click(screen.getByRole('radio', { name: 'By year' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(1);
			expect(getCellTextByHeading('Encounters', 'January')).toBe('30');
		});

		it('toggling combine-years on and off repeatedly does not trigger any additional fetch of species period totals', async () => {
			const { fetchSpeciesPeriodTotals, fetchSpeciesCombinedMonthTotals } =
				await import('@/app/actions/sp-data');
			renderTab();
			await waitFor(() =>
				expect(document.querySelectorAll('tbody tr').length).toBe(2)
			);
			expect(fetchSpeciesPeriodTotals).toHaveBeenCalledTimes(1);
			expect(fetchSpeciesCombinedMonthTotals).toHaveBeenCalledTimes(1);

			fireEvent.click(screen.getByRole('radio', { name: 'By year' }));
			fireEvent.click(screen.getByRole('radio', { name: 'Combined' }));
			fireEvent.click(screen.getByRole('radio', { name: 'By year' }));

			expect(fetchSpeciesPeriodTotals).toHaveBeenCalledTimes(1);
			expect(fetchSpeciesCombinedMonthTotals).toHaveBeenCalledTimes(1);
		});
	});
});

describe('SpCombinedMonthTotalsTab — empty months toggle', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(async () => {
		const { fetchSpeciesPeriodTotals, fetchSpeciesCombinedMonthTotals } =
			await import('@/app/actions/sp-data');
		vi.mocked(fetchSpeciesPeriodTotals).mockReset();
		vi.mocked(fetchSpeciesCombinedMonthTotals).mockReset();
		vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([
			buildCoreStatsRow({ time_period: '2020-01-01', session_count: 4 })
		]);
		// A realistic 12-row fixture (the real RPC always returns all 12), zero
		// except January.
		vi.mocked(fetchSpeciesCombinedMonthTotals).mockResolvedValue(
			buildMonthSquashedFixture({ 1: { session_count: 4 } })
		);
	});

	describe('Usual', () => {
		it('renders only months with data by default (Hide)', async () => {
			renderTab();
			await waitFor(() =>
				// Only January is a nonzero month-squashed row; the rest are
				// synthesized and hidden by default.
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
			renderTab();
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
				buildCoreStatsRow({ time_period: '2020-01-01', session_count: 4 }),
				buildCoreStatsRow({ time_period: '2020-08-01', session_count: 0 })
			]);
			renderTab();
			await waitFor(() =>
				// Combined (default) view uses the mocked month-squashed rows,
				// unaffected by the fetchSpeciesPeriodTotals override above.
				expect(document.querySelectorAll('tbody tr').length).toBe(1)
			);
			fireEvent.click(screen.getByRole('radio', { name: 'By year' }));
			await waitFor(() =>
				// The August row (session_count 0) is dropped by default; January
				// (4) stays.
				expect(document.querySelectorAll('tbody tr').length).toBe(1)
			);
			expect(screen.getByText('January 2020')).toBeTruthy();
			fireEvent.click(screen.getByRole('radio', { name: 'Show' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(2);
			expect(screen.getByText('August 2020')).toBeTruthy();
		});
	});

	describe('Edge', () => {
		it('has no visible effect when no calendar month is empty across any year', async () => {
			const { fetchSpeciesCombinedMonthTotals } =
				await import('@/app/actions/sp-data');
			vi.mocked(fetchSpeciesCombinedMonthTotals).mockResolvedValue(
				Array.from({ length: 12 }, (_unused, index) =>
					buildCoreStatsRow({
						time_period: `2000-${String(index + 1).padStart(2, '0')}-01`,
						session_count: 3
					})
				)
			);
			renderTab();
			await waitFor(() =>
				// Hide default has nothing to filter, since no month is empty.
				expect(document.querySelectorAll('tbody tr').length).toBe(12)
			);
			fireEvent.click(screen.getByRole('radio', { name: 'Show' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(12);
		});

		it('shows only the month with data by default when every other calendar month is empty', async () => {
			const { fetchSpeciesCombinedMonthTotals } =
				await import('@/app/actions/sp-data');
			vi.mocked(fetchSpeciesCombinedMonthTotals).mockResolvedValue([
				buildCoreStatsRow({ time_period: '2000-08-01', session_count: 7 })
			]);
			renderTab();
			await waitFor(() =>
				expect(document.querySelectorAll('tbody tr').length).toBe(1)
			);
			expect(screen.getByText('August')).toBeTruthy();
		});

		it('toggling combine-years does not reset the empty-months toggle, and vice versa', async () => {
			const { fetchSpeciesPeriodTotals } =
				await import('@/app/actions/sp-data');
			vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([
				buildCoreStatsRow({ time_period: '2020-01-01', session_count: 4 })
			]);
			renderTab();
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
