import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	waitFor,
	getAllByRole
} from '@testing-library/react';
import { SummaryTotalsSection } from '../SummaryTotalsSection';
import { buildMonthTotalsRows } from '@/app/lib/month-totals';
import speciesDataSnapshot from '@/test-fixtures/snapshots/fetchSpeciesData.alpha.json';
import type { CoreStatsResult } from '@/app/models/db';
import type { ViewedGroup } from '@/app/lib/group-slug';
import {
	getCellTextByHeading,
	getColumnIndex
} from '@/app/__tests__/helpers/table';

const fetchSpeciesDataMock = vi.fn();
vi.mock('@/app/actions/spp-data', () => ({
	fetchSpeciesData: (...args: unknown[]) => fetchSpeciesDataMock(...args)
}));

const fetchPeriodStatsMock = vi.fn();
vi.mock('@/app/actions/summary-stats', () => ({
	fetchPeriodStats: (...args: unknown[]) => fetchPeriodStatsMock(...args)
}));

const fetchPeriodTotalsMock = vi.fn();
vi.mock('@/app/actions/period-totals', () => ({
	fetchPeriodTotals: (...args: unknown[]) => fetchPeriodTotalsMock(...args)
}));

const speciesStats = speciesDataSnapshot as unknown as CoreStatsResult[];
const monthTotals = buildMonthTotalsRows(2026, []);

const viewedGroup: ViewedGroup = { id: 1, slug: 'alpha' };

const summaryStats = {
	...speciesStats[0],
	session_count: 9,
	bird_count: 99
} as CoreStatsResult;

function buildDayStat(
	overrides: Partial<CoreStatsResult> = {}
): CoreStatsResult {
	return {
		species_name: null,
		time_period: '2026-08-16',
		session_count: 2,
		total_effort: '06:00:00',
		effort_per_session: '03:00:00',
		effort_per_encounter: '00:30:00',
		avg_encounters_per_session: 6,
		max_per_session: 8,
		species_count: 5,
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
	} as CoreStatsResult;
}

function buildYearlyStat(
	overrides: Partial<CoreStatsResult> = {}
): CoreStatsResult {
	return {
		species_name: null,
		time_period: '2026-01-01',
		session_count: 4,
		total_effort: '18:00:00',
		effort_per_session: '02:00:00',
		effort_per_encounter: '02:34:17',
		avg_encounters_per_session: 1.75,
		max_per_session: 3,
		species_count: 12,
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
	} as CoreStatsResult;
}

// Monthly (year, month) stats as `fetchPeriodStats(_, 'month')` returns them —
// two Januaries and one August, to exercise the combine-years fold.
const monthlyPeriodStats: CoreStatsResult[] = [
	buildYearlyStat({
		time_period: '2020-01-01',
		session_count: 4,
		encounter_count: 30,
		bird_count: 25
	}),
	buildYearlyStat({
		time_period: '2021-01-01',
		session_count: 6,
		encounter_count: 45,
		bird_count: 33
	}),
	buildYearlyStat({
		time_period: '2020-08-01',
		session_count: 2,
		encounter_count: 11,
		bird_count: 9
	})
];

describe('SummaryTotalsSection', () => {
	beforeEach(() => {
		fetchSpeciesDataMock.mockResolvedValue(speciesStats);
		fetchPeriodStatsMock.mockResolvedValue(monthlyPeriodStats);
		fetchPeriodTotalsMock.mockResolvedValue([]);
	});
	afterEach(() => {
		cleanup();
		fetchSpeciesDataMock.mockReset();
		fetchPeriodStatsMock.mockReset();
		fetchPeriodTotalsMock.mockReset();
	});

	describe('with monthTotals (year page)', () => {
		it('renders the "Month totals" tab first, active by default', () => {
			render(
				<SummaryTotalsSection
					monthTotals={monthTotals}
					viewedGroup={viewedGroup}
				/>
			);
			const tabs = getAllByRole(screen.getByRole('tablist'), 'button');
			expect(tabs.map((tab) => tab.textContent)).toEqual([
				'Month totals',
				'Session totals',
				'Species totals'
			]);
			expect(tabs[0].getAttribute('aria-current')).toBe('true');
		});
		// TODOD: skipping because links only generated for months with data and
		// the testfixture has empty data for each month
		it.skip('renders 12 month rows, each linking to /group/{slug}/summary/{year}/{month}', () => {
			render(
				<SummaryTotalsSection
					monthTotals={monthTotals}
					viewedGroup={viewedGroup}
				/>
			);
			expect(document.querySelectorAll('tbody tr').length).toBe(12);
			const januaryLink = screen.getByRole('link', { name: 'January 2026' });
			expect(januaryLink.getAttribute('href')).toBe(
				'/group/alpha/summary/2026/1'
			);
			const decemberLink = screen.getByRole('link', { name: 'December 2026' });
			expect(decemberLink.getAttribute('href')).toBe(
				'/group/alpha/summary/2026/12'
			);
		});

		it('lazily switches to the species totals table when its tab is clicked', async () => {
			render(
				<SummaryTotalsSection
					monthTotals={monthTotals}
					viewedGroup={viewedGroup}
				/>
			);
			fireEvent.click(screen.getByRole('button', { name: 'Species totals' }));
			await waitFor(() =>
				expect(document.querySelectorAll('tbody tr').length).toBe(
					speciesStats.length
				)
			);
			expect(screen.queryByRole('link', { name: 'January 2026' })).toBeNull();
		});

		it('forwards summaryStats to the Month totals table as its totals row', () => {
			// At least one populated month, since Hide default filters an
			// all-empty monthTotals down to zero rows (and no totals row).
			const populatedMonthTotals = buildMonthTotalsRows(2026, [
				buildYearlyStat({ time_period: '2026-03-01', session_count: 5 })
			]);
			render(
				<SummaryTotalsSection
					monthTotals={populatedMonthTotals}
					viewedGroup={viewedGroup}
					summaryStats={summaryStats}
				/>
			);
			expect(screen.getByTestId('totals-row').textContent).toContain('99');
		});

		it('renders a "Busiest session" column between Encounters and Birds', () => {
			// At least one populated month, since Hide default filters an
			// all-empty monthTotals down to zero rows (and no header row).
			const populatedMonthTotals = buildMonthTotalsRows(2026, [
				buildYearlyStat({ time_period: '2026-03-01', session_count: 5 })
			]);
			render(
				<SummaryTotalsSection
					monthTotals={populatedMonthTotals}
					viewedGroup={viewedGroup}
				/>
			);
			const encountersIndex = getColumnIndex('Encounters');
			const busiestSessionIndex = getColumnIndex('Busiest session');
			const birdsIndex = getColumnIndex('Birds');
			expect(busiestSessionIndex).toBe(encountersIndex + 1);
			expect(busiestSessionIndex).toBe(birdsIndex - 1);
		});
	});

	describe('with session totals (month summary page)', () => {
		it('renders "Session totals" as the first tab, active by default, with "Species totals" present as a second tab', () => {
			render(
				<SummaryTotalsSection
					sessionTotals={[buildDayStat()]}
					viewedGroup={viewedGroup}
				/>
			);
			const tabs = getAllByRole(screen.getByRole('tablist'), 'button');
			expect(tabs.map((tab) => tab.textContent)).toEqual([
				'Session totals',
				'Species totals'
			]);
			expect(
				screen
					.getByRole('button', { name: 'Session totals' })
					.getAttribute('aria-current')
			).toBe('true');
		});

		it('renders one row per session day, in the order supplied, each linking to the session route with the date formatted "16th August 2026"', () => {
			render(
				<SummaryTotalsSection
					sessionTotals={[
						buildDayStat({ time_period: '2026-08-02' }),
						buildDayStat({ time_period: '2026-08-16' })
					]}
					viewedGroup={viewedGroup}
				/>
			);
			const links = screen
				.getAllByRole('link')
				.filter((link) => link.getAttribute('href')?.includes('/session/'));
			expect(links.map((link) => link.textContent?.trim())).toEqual([
				'2nd August 2026',
				'16th August 2026'
			]);
			expect(links.map((link) => link.getAttribute('href'))).toEqual([
				'/group/alpha/session/2026-08-02',
				'/group/alpha/session/2026-08-16'
			]);
		});

		it('lazily switches to the "Species totals" table when its tab is clicked', async () => {
			render(
				<SummaryTotalsSection
					sessionTotals={[buildDayStat()]}
					viewedGroup={viewedGroup}
				/>
			);
			fireEvent.click(screen.getByRole('button', { name: 'Species totals' }));
			await waitFor(() =>
				expect(document.querySelectorAll('tbody tr').length).toBe(
					speciesStats.length
				)
			);
			expect(
				screen.queryByRole('link', { name: '16th August 2026' })
			).toBeNull();
		});

		it('renders a single session day', () => {
			render(
				<SummaryTotalsSection
					sessionTotals={[buildDayStat({ time_period: '2026-08-16' })]}
					viewedGroup={viewedGroup}
				/>
			);
			expect(document.querySelectorAll('tbody tr').length).toBe(1);
			expect(
				screen
					.getByRole('link', { name: '16th August 2026' })
					.getAttribute('href')
			).toBe('/group/alpha/session/2026-08-16');
		});

		it('renders the period table empty state when there were no sessions that month', () => {
			render(
				<SummaryTotalsSection sessionTotals={[]} viewedGroup={viewedGroup} />
			);
			expect(
				screen
					.getByRole('button', { name: 'Session totals' })
					.getAttribute('aria-current')
			).toBe('true');
			expect(screen.getByText('No data recorded.')).toBeTruthy();
		});

		it('forwards summaryStats to the Session totals table as its totals row', () => {
			render(
				<SummaryTotalsSection
					sessionTotals={[buildDayStat()]}
					viewedGroup={viewedGroup}
					summaryStats={summaryStats}
				/>
			);
			expect(screen.getByTestId('totals-row').textContent).toContain('99');
		});

		it('does not render a "Busiest session" column (eager sessionTotals path)', () => {
			render(
				<SummaryTotalsSection
					sessionTotals={[buildDayStat()]}
					viewedGroup={viewedGroup}
				/>
			);
			expect(
				screen.queryByRole('columnheader', { name: 'Busiest session' })
			).toBeNull();
		});

		it('does not render a "Busiest session" column (lazy-fetch path)', async () => {
			fetchPeriodTotalsMock.mockResolvedValue([buildDayStat()]);
			render(
				<SummaryTotalsSection
					monthTotals={monthTotals}
					viewedGroup={viewedGroup}
				/>
			);
			fireEvent.click(screen.getByRole('button', { name: 'Session totals' }));
			await waitFor(() =>
				expect(screen.getByTestId('period-totals-table')).toBeTruthy()
			);
			expect(
				screen.queryByRole('columnheader', { name: 'Busiest session' })
			).toBeNull();
		});
	});

	describe('with yearlyTotals (all-time summary page)', () => {
		it('renders "Year totals" as the first tab, active by default, with its content visible beneath it', () => {
			const yearlyTotals = [buildYearlyStat()];
			render(
				<SummaryTotalsSection
					yearlyTotals={yearlyTotals}
					viewedGroup={viewedGroup}
				/>
			);
			const tabs = getAllByRole(screen.getByRole('tablist'), 'button');
			expect(tabs.map((tab) => tab.textContent)).toEqual([
				'Year totals',
				'Session totals',
				'Species totals'
			]);
			expect(tabs[0].getAttribute('aria-current')).toBe('true');
			expect(screen.getByTestId('period-totals-table')).toBeTruthy();
		});

		it('renders the first column as a plain year number linking to /group/{slug}/summary/{year}', () => {
			const yearlyTotals = [buildYearlyStat({ time_period: '2026-01-01' })];
			render(
				<SummaryTotalsSection
					yearlyTotals={yearlyTotals}
					viewedGroup={viewedGroup}
				/>
			);
			const link = screen.getByRole('link', { name: '2026' });
			expect(link.getAttribute('href')).toBe('/group/alpha/summary/2026');
		});

		it('keeps "Species totals" present and lazily switches to it on click', async () => {
			const yearlyTotals = [buildYearlyStat()];
			render(
				<SummaryTotalsSection
					yearlyTotals={yearlyTotals}
					viewedGroup={viewedGroup}
				/>
			);
			fireEvent.click(screen.getByRole('button', { name: 'Species totals' }));
			expect(
				screen
					.getByRole('button', { name: 'Species totals' })
					.getAttribute('aria-current')
			).toBe('true');
			await waitFor(() =>
				expect(document.querySelectorAll('tbody tr').length).toBe(
					speciesStats.length
				)
			);
		});

		it("renders the shared table's empty state when yearlyTotals is empty, without crashing", () => {
			render(
				<SummaryTotalsSection yearlyTotals={[]} viewedGroup={viewedGroup} />
			);
			expect(screen.getByRole('button', { name: 'Year totals' })).toBeTruthy();
			expect(screen.queryByTestId('period-totals-table')).toBeNull();
		});

		it('forwards summaryStats to the Year totals table as its totals row', () => {
			const yearlyTotals = [buildYearlyStat()];
			render(
				<SummaryTotalsSection
					yearlyTotals={yearlyTotals}
					viewedGroup={viewedGroup}
					summaryStats={summaryStats}
				/>
			);
			expect(screen.getByTestId('totals-row').textContent).toContain('99');
		});

		it('renders a "Busiest session" column between Encounters and Birds', () => {
			const yearlyTotals = [buildYearlyStat()];
			render(
				<SummaryTotalsSection
					yearlyTotals={yearlyTotals}
					viewedGroup={viewedGroup}
				/>
			);
			const encountersIndex = getColumnIndex('Encounters');
			const busiestSessionIndex = getColumnIndex('Busiest session');
			const birdsIndex = getColumnIndex('Birds');
			expect(busiestSessionIndex).toBe(encountersIndex + 1);
			expect(busiestSessionIndex).toBe(birdsIndex - 1);
		});
	});

	describe('all-time "Month totals" tab', () => {
		// The all-time page shape: yearlyTotals present (Year totals tab) plus the
		// combine-years month tab enabled.
		const allTimeProps = {
			yearlyTotals: [buildYearlyStat()],
			showAllTimeMonthTotals: true,
			viewedGroup
		};

		describe('Usual', () => {
			it('renders the Month totals tab when showAllTimeMonthTotals is set, alongside Year totals and Species totals', () => {
				render(<SummaryTotalsSection {...allTimeProps} />);
				const tabs = getAllByRole(screen.getByRole('tablist'), 'button');
				expect(tabs.map((tab) => tab.textContent)).toEqual([
					'Year totals',
					'Month totals',
					'Session totals',
					'Species totals'
				]);
			});

			it('renders month rows labelled by name only (no year) when the tab is active', async () => {
				render(<SummaryTotalsSection {...allTimeProps} />);
				fireEvent.click(screen.getByRole('button', { name: 'Month totals' }));
				await waitFor(() =>
					// Hide default: only January and August (the nonzero folded
					// buckets from monthlyPeriodStats) show.
					expect(document.querySelectorAll('tbody tr').length).toBe(2)
				);
				['January', 'August'].forEach((monthName) => {
					expect(screen.getByText(monthName)).toBeTruthy();
				});
				// Combine-years labels are month name only — no year, no link.
				expect(screen.queryByText('January 2020')).toBeNull();
				expect(screen.queryByRole('link', { name: 'January' })).toBeNull();
			});

			it('renders a "Busiest session" column between Encounters and Birds', async () => {
				render(<SummaryTotalsSection {...allTimeProps} />);
				fireEvent.click(screen.getByRole('button', { name: 'Month totals' }));
				await waitFor(() =>
					expect(document.querySelectorAll('tbody tr').length).toBe(2)
				);
				const encountersIndex = getColumnIndex('Encounters');
				const busiestSessionIndex = getColumnIndex('Busiest session');
				const birdsIndex = getColumnIndex('Birds');
				expect(busiestSessionIndex).toBe(encountersIndex + 1);
				expect(busiestSessionIndex).toBe(birdsIndex - 1);
			});
		});

		describe('Structure', () => {
			it('does not render the Month totals tab when showAllTimeMonthTotals is undefined', () => {
				render(
					<SummaryTotalsSection
						yearlyTotals={[buildYearlyStat()]}
						viewedGroup={viewedGroup}
					/>
				);
				expect(
					screen.queryByRole('button', { name: 'Month totals' })
				).toBeNull();
			});

			it('keeps Year totals as the default/active tab even when Month totals is present', () => {
				render(<SummaryTotalsSection {...allTimeProps} />);
				expect(
					screen
						.getByRole('button', { name: 'Year totals' })
						.getAttribute('aria-current')
				).toBe('true');
				expect(
					screen
						.getByRole('button', { name: 'Month totals' })
						.getAttribute('aria-current')
				).toBeNull();
			});
		});

		describe('Edge', () => {
			it("shows '-' in the Individuals column for every row on this tab", async () => {
				render(
					<SummaryTotalsSection {...allTimeProps} summaryStats={summaryStats} />
				);
				fireEvent.click(screen.getByRole('button', { name: 'Month totals' }));
				await waitFor(() =>
					// Hide default: only January and August (the nonzero folded
					// buckets) show.
					expect(document.querySelectorAll('tbody tr').length).toBe(2)
				);
				const table = screen.getByRole('table');
				table.querySelectorAll('tbody tr').forEach((_, rowIndex) => {
					expect(getCellTextByHeading(table, 'Birds', rowIndex)).toBe('-');
				});
			});

			it("disables the Aggregate-by toggle (locked to Encounter) only on this tab — the Year totals tab's toggle stays interactive", async () => {
				render(<SummaryTotalsSection {...allTimeProps} />);
				fireEvent.click(screen.getByRole('button', { name: 'Month totals' }));
				await waitFor(() =>
					expect(document.querySelectorAll('tbody tr').length).toBe(2)
				);
				const fixedEncounter = screen.getByRole('radio', {
					name: 'Encounter'
				}) as HTMLInputElement;
				expect(fixedEncounter.checked).toBe(true);
				expect(fixedEncounter.disabled).toBe(true);

				fireEvent.click(screen.getByRole('button', { name: 'Year totals' }));
				const freeEncounter = screen.getByRole('radio', {
					name: 'Encounter'
				}) as HTMLInputElement;
				expect(freeEncounter.disabled).toBe(false);
			});
		});

		describe('Combine years toggle', () => {
			describe('Usual', () => {
				it('defaults to ON ("Combined"), with AggregateByToggle disabled', async () => {
					render(<SummaryTotalsSection {...allTimeProps} />);
					fireEvent.click(screen.getByRole('button', { name: 'Month totals' }));
					await waitFor(() =>
						// Hide default: only January and August (the nonzero folded
						// buckets) show.
						expect(document.querySelectorAll('tbody tr').length).toBe(2)
					);
					expect(
						(
							screen.getByRole('radio', {
								name: 'Combined'
							}) as HTMLInputElement
						).checked
					).toBe(true);
					expect(
						(
							screen.getByRole('radio', {
								name: 'Encounter'
							}) as HTMLInputElement
						).disabled
					).toBe(true);
				});

				it('switching to "By year" shows one row per (year, month) combination with AggregateByToggle enabled', async () => {
					render(<SummaryTotalsSection {...allTimeProps} />);
					fireEvent.click(screen.getByRole('button', { name: 'Month totals' }));
					await waitFor(() =>
						expect(document.querySelectorAll('tbody tr').length).toBe(2)
					);

					fireEvent.click(screen.getByRole('radio', { name: 'By year' }));

					expect(document.querySelectorAll('tbody tr').length).toBe(3);
					expect(
						screen
							.getByRole('link', { name: 'January 2020' })
							.getAttribute('href')
					).toBe('/group/alpha/summary/2020/1');
					expect(
						screen
							.getByRole('link', { name: 'January 2021' })
							.getAttribute('href')
					).toBe('/group/alpha/summary/2021/1');
					expect(
						screen
							.getByRole('link', { name: 'August 2020' })
							.getAttribute('href')
					).toBe('/group/alpha/summary/2020/8');
					expect(
						(
							screen.getByRole('radio', {
								name: 'Encounter'
							}) as HTMLInputElement
						).disabled
					).toBe(false);
				});

				it('switching back to "Combined" restores the folded rows and disables AggregateByToggle again', async () => {
					render(<SummaryTotalsSection {...allTimeProps} />);
					fireEvent.click(screen.getByRole('button', { name: 'Month totals' }));
					await waitFor(() =>
						expect(document.querySelectorAll('tbody tr').length).toBe(2)
					);

					fireEvent.click(screen.getByRole('radio', { name: 'By year' }));
					expect(document.querySelectorAll('tbody tr').length).toBe(3);

					fireEvent.click(screen.getByRole('radio', { name: 'Combined' }));
					expect(document.querySelectorAll('tbody tr').length).toBe(2);
					expect(
						(
							screen.getByRole('radio', {
								name: 'Encounter'
							}) as HTMLInputElement
						).disabled
					).toBe(true);
				});
			});

			describe('Structure', () => {
				it('in the "By year" state, toggling AggregateByToggle between Bird and Encounter changes the rendered counts', async () => {
					fetchPeriodStatsMock.mockResolvedValue([
						buildYearlyStat({
							time_period: '2020-01-01',
							pullus_bird_count: 2,
							...({ pullus_enc_count: 5 } as Partial<CoreStatsResult>)
						})
					]);
					render(<SummaryTotalsSection {...allTimeProps} />);
					fireEvent.click(screen.getByRole('button', { name: 'Month totals' }));
					await waitFor(() =>
						expect(document.querySelectorAll('tbody tr').length).toBe(1)
					);
					fireEvent.click(screen.getByRole('radio', { name: 'By year' }));
					expect(document.querySelectorAll('tbody tr').length).toBe(1);

					expect(getCellTextByHeading('Pulli', 0)).toBe('2');

					fireEvent.click(screen.getByRole('radio', { name: 'Encounter' }));
					expect(getCellTextByHeading('Pulli', 0)).toBe('5');
				});
			});

			describe('Edge', () => {
				it('does not trigger any additional data fetch when toggling Combine years', async () => {
					render(<SummaryTotalsSection {...allTimeProps} />);
					fireEvent.click(screen.getByRole('button', { name: 'Month totals' }));
					await waitFor(() =>
						expect(document.querySelectorAll('tbody tr').length).toBe(2)
					);
					expect(fetchPeriodStatsMock).toHaveBeenCalledTimes(1);

					fireEvent.click(screen.getByRole('radio', { name: 'By year' }));
					fireEvent.click(screen.getByRole('radio', { name: 'Combined' }));
					fireEvent.click(screen.getByRole('radio', { name: 'By year' }));

					expect(fetchPeriodStatsMock).toHaveBeenCalledTimes(1);
				});

				it('renders a single row per month (not zero-filled to 12) in the "By year" state when history spans only one year', async () => {
					fetchPeriodStatsMock.mockResolvedValue([
						buildYearlyStat({ time_period: '2020-01-01' }),
						buildYearlyStat({ time_period: '2020-08-01' })
					]);
					render(<SummaryTotalsSection {...allTimeProps} />);
					fireEvent.click(screen.getByRole('button', { name: 'Month totals' }));
					await waitFor(() =>
						expect(document.querySelectorAll('tbody tr').length).toBe(2)
					);

					fireEvent.click(screen.getByRole('radio', { name: 'By year' }));

					expect(document.querySelectorAll('tbody tr').length).toBe(2);
				});
			});
		});
	});

	describe('when viewedGroup is undefined', () => {
		it('falls back to "Species totals" as the sole default tab, suppressing the session tab and not attempting a fetch', async () => {
			render(
				<SummaryTotalsSection
					sessionTotals={[buildDayStat()]}
					viewedGroup={undefined}
				/>
			);
			const tabs = getAllByRole(screen.getByRole('tablist'), 'button');
			expect(tabs.map((tab) => tab.textContent)).toEqual(['Species totals']);
			expect(
				screen.queryByRole('button', { name: 'Session totals' })
			).toBeNull();
			expect(
				screen.queryByRole('link', { name: '16th August 2026' })
			).toBeNull();
			// no group id to scope the fetch to, so the tab shows its empty state
			await waitFor(() => expect(screen.getByText('No species recorded.')));
			expect(fetchSpeciesDataMock).not.toHaveBeenCalled();
		});
	});

	describe('lazy Species totals fetch', () => {
		it('shows a loading indicator immediately after the Species tab is selected, before the fetch resolves', async () => {
			let resolveFetch: (value: CoreStatsResult[]) => void = () => {};
			fetchSpeciesDataMock.mockReturnValue(
				new Promise<CoreStatsResult[]>((resolve) => {
					resolveFetch = resolve;
				})
			);
			render(
				<SummaryTotalsSection
					yearlyTotals={[buildYearlyStat()]}
					viewedGroup={viewedGroup}
				/>
			);
			fireEvent.click(screen.getByRole('button', { name: 'Species totals' }));
			await waitFor(() =>
				expect(document.querySelector('.loading-spinner')).toBeTruthy()
			);
			expect(screen.queryByTestId('species-totals-table')).toBeNull();

			resolveFetch(speciesStats);
			await waitFor(() =>
				expect(document.querySelector('.loading-spinner')).toBeNull()
			);
		});

		it('renders the fetched rows once the promise resolves', async () => {
			fetchSpeciesDataMock.mockResolvedValue([
				{ ...speciesStats[0], species_name: 'Robin' }
			]);
			render(
				<SummaryTotalsSection
					yearlyTotals={[buildYearlyStat()]}
					viewedGroup={viewedGroup}
				/>
			);
			fireEvent.click(screen.getByRole('button', { name: 'Species totals' }));
			await waitFor(() =>
				expect(screen.getByRole('link', { name: 'Robin' })).toBeTruthy()
			);
		});

		it.each([
			['yearlyTotals', { yearlyTotals: [buildYearlyStat()] }],
			['monthTotals', { monthTotals }],
			['sessionTotals', { sessionTotals: [buildDayStat()] }]
		])(
			'fetches species data exactly once when selected on the %s page shape',
			async (_label, pageProps) => {
				render(
					<SummaryTotalsSection {...pageProps} viewedGroup={viewedGroup} />
				);
				fireEvent.click(screen.getByRole('button', { name: 'Species totals' }));
				await waitFor(() =>
					expect(fetchSpeciesDataMock).toHaveBeenCalledTimes(1)
				);
			}
		);

		it('does not refetch when switching to Species, away, and back again', async () => {
			render(
				<SummaryTotalsSection
					yearlyTotals={[buildYearlyStat()]}
					viewedGroup={viewedGroup}
				/>
			);
			fireEvent.click(screen.getByRole('button', { name: 'Species totals' }));
			await waitFor(() =>
				expect(fetchSpeciesDataMock).toHaveBeenCalledTimes(1)
			);
			fireEvent.click(screen.getByRole('button', { name: 'Year totals' }));
			fireEvent.click(screen.getByRole('button', { name: 'Species totals' }));
			await waitFor(() =>
				expect(document.querySelectorAll('tbody tr').length).toBe(
					speciesStats.length
				)
			);
			expect(fetchSpeciesDataMock).toHaveBeenCalledTimes(1);
		});

		it('renders the table empty state rather than throwing when the fetch rejects', async () => {
			const consoleError = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});
			fetchSpeciesDataMock.mockRejectedValue(new Error('boom'));
			render(
				<SummaryTotalsSection
					yearlyTotals={[buildYearlyStat()]}
					viewedGroup={viewedGroup}
				/>
			);
			fireEvent.click(screen.getByRole('button', { name: 'Species totals' }));
			await waitFor(() =>
				expect(screen.getByText('No species recorded.')).toBeTruthy()
			);
			expect(consoleError).toHaveBeenCalledWith(
				'Failed to fetch species totals',
				expect.objectContaining({ viewedGroupId: 1 })
			);
			consoleError.mockRestore();
		});
	});

	describe('empty months toggle - year month totals tab', () => {
		// Two populated months (March, July); the other ten are zero-filled.
		const populatedMonthTotals = buildMonthTotalsRows(2026, [
			buildYearlyStat({ time_period: '2026-03-01', session_count: 5 }),
			buildYearlyStat({ time_period: '2026-07-01', session_count: 2 })
		]);

		it('renders only months with data by default (Hide)', () => {
			render(
				<SummaryTotalsSection
					monthTotals={populatedMonthTotals}
					viewedGroup={viewedGroup}
				/>
			);
			expect(document.querySelectorAll('tbody tr').length).toBe(2);
			expect(
				(screen.getByRole('radio', { name: 'Hide' }) as HTMLInputElement)
					.checked
			).toBe(true);
			expect(screen.getByText('March 2026')).toBeTruthy();
			expect(screen.getByText('July 2026')).toBeTruthy();
		});

		it('shows all 12 months when toggled to Show', () => {
			render(
				<SummaryTotalsSection
					monthTotals={populatedMonthTotals}
					viewedGroup={viewedGroup}
				/>
			);
			fireEvent.click(screen.getByRole('radio', { name: 'Show' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(12);
		});

		it('has no visible effect for a year with no empty months', () => {
			const allMonths = buildMonthTotalsRows(
				2026,
				Array.from({ length: 12 }, (_unused, index) =>
					buildYearlyStat({
						time_period: `2026-${String(index + 1).padStart(2, '0')}-01`,
						session_count: 3
					})
				)
			);
			render(
				<SummaryTotalsSection
					monthTotals={allMonths}
					viewedGroup={viewedGroup}
				/>
			);
			// Hide default has nothing to filter, since no month is empty.
			expect(document.querySelectorAll('tbody tr').length).toBe(12);
			fireEvent.click(screen.getByRole('radio', { name: 'Show' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(12);
		});

		it('shows exactly one month for a year that is empty except one', () => {
			const oneMonth = buildMonthTotalsRows(2026, [
				buildYearlyStat({ time_period: '2026-08-01', session_count: 4 })
			]);
			render(
				<SummaryTotalsSection
					monthTotals={oneMonth}
					viewedGroup={viewedGroup}
				/>
			);
			expect(document.querySelectorAll('tbody tr').length).toBe(1);
			expect(screen.getByText('August 2026')).toBeTruthy();
		});

		it('resets to Hide after switching to another tab and back', async () => {
			render(
				<SummaryTotalsSection
					monthTotals={populatedMonthTotals}
					viewedGroup={viewedGroup}
				/>
			);
			fireEvent.click(screen.getByRole('radio', { name: 'Show' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(12);

			fireEvent.click(screen.getByRole('button', { name: 'Species totals' }));
			await waitFor(() =>
				expect(document.querySelectorAll('tbody tr').length).toBe(
					speciesStats.length
				)
			);
			fireEvent.click(screen.getByRole('button', { name: 'Month totals' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(2);
			expect(
				(screen.getByRole('radio', { name: 'Hide' }) as HTMLInputElement)
					.checked
			).toBe(true);
		});
	});

	describe('empty months toggle - all-time month totals tab', () => {
		const allTimeProps = {
			yearlyTotals: [buildYearlyStat()],
			showAllTimeMonthTotals: true,
			viewedGroup
		};

		it('renders only months with data by default (Hide)', async () => {
			render(<SummaryTotalsSection {...allTimeProps} />);
			fireEvent.click(screen.getByRole('button', { name: 'Month totals' }));
			await waitFor(() =>
				// monthlyPeriodStats folds to two non-empty months: January and
				// August.
				expect(document.querySelectorAll('tbody tr').length).toBe(2)
			);
			expect(
				(screen.getByRole('radio', { name: 'Hide' }) as HTMLInputElement)
					.checked
			).toBe(true);
			expect(screen.getByText('January')).toBeTruthy();
			expect(screen.getByText('August')).toBeTruthy();
		});

		it('shows zero-session months in the combined view when toggled to Show', async () => {
			render(<SummaryTotalsSection {...allTimeProps} />);
			fireEvent.click(screen.getByRole('button', { name: 'Month totals' }));
			await waitFor(() =>
				expect(document.querySelectorAll('tbody tr').length).toBe(2)
			);
			fireEvent.click(screen.getByRole('radio', { name: 'Show' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(12);
		});

		it('shows zero-session months in the by-year view when toggled to Show', async () => {
			fetchPeriodStatsMock.mockResolvedValue([
				buildYearlyStat({ time_period: '2020-01-01', session_count: 4 }),
				buildYearlyStat({ time_period: '2020-08-01', session_count: 0 })
			]);
			render(<SummaryTotalsSection {...allTimeProps} />);
			fireEvent.click(screen.getByRole('button', { name: 'Month totals' }));
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

		it('has no visible effect when no calendar month is empty across any year', async () => {
			fetchPeriodStatsMock.mockResolvedValue(
				Array.from({ length: 12 }, (_unused, index) =>
					buildYearlyStat({
						time_period: `2020-${String(index + 1).padStart(2, '0')}-01`,
						session_count: 3
					})
				)
			);
			render(<SummaryTotalsSection {...allTimeProps} />);
			fireEvent.click(screen.getByRole('button', { name: 'Month totals' }));
			await waitFor(() =>
				// Hide default has nothing to filter, since no month is empty.
				expect(document.querySelectorAll('tbody tr').length).toBe(12)
			);
			fireEvent.click(screen.getByRole('radio', { name: 'Show' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(12);
		});

		it('resets to Hide after switching to another tab and back', async () => {
			render(<SummaryTotalsSection {...allTimeProps} />);
			fireEvent.click(screen.getByRole('button', { name: 'Month totals' }));
			await waitFor(() =>
				expect(document.querySelectorAll('tbody tr').length).toBe(2)
			);
			fireEvent.click(screen.getByRole('radio', { name: 'Show' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(12);

			fireEvent.click(screen.getByRole('button', { name: 'Year totals' }));
			fireEvent.click(screen.getByRole('button', { name: 'Month totals' }));
			await waitFor(() =>
				expect(document.querySelectorAll('tbody tr').length).toBe(2)
			);
			expect(
				(screen.getByRole('radio', { name: 'Hide' }) as HTMLInputElement)
					.checked
			).toBe(true);
		});
	});
});
