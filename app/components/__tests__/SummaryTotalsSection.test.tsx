import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	waitFor
} from '@testing-library/react';
import { SummaryTotalsSection } from '../SummaryTotalsSection';
import { buildMonthTotalsRows } from '@/app/models/month-totals';
import speciesDataSnapshot from '@/test-fixtures/snapshots/fetchSpeciesData.alpha.json';
import type { AggregateStatsResult } from '@/app/models/db';
import type { ViewedGroup } from '@/lib/group-slug';

const fetchSpeciesDataMock = vi.fn();
vi.mock('@/app/actions/spp-data', () => ({
	fetchSpeciesData: (...args: unknown[]) => fetchSpeciesDataMock(...args)
}));

const speciesStats = speciesDataSnapshot as unknown as AggregateStatsResult[];
const monthTotals = buildMonthTotalsRows(2026, []);

const viewedGroup: ViewedGroup = { id: 1, slug: 'alpha' };

const summaryStats = {
	...speciesStats[0],
	session_count: 9,
	encounter_count: 99
} as AggregateStatsResult;

function buildDayStat(
	overrides: Partial<AggregateStatsResult> = {}
): AggregateStatsResult {
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
		new_young_bird_count: 3,
		...overrides
	} as AggregateStatsResult;
}

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
		new_young_bird_count: 7,
		...overrides
	} as AggregateStatsResult;
}

describe('SummaryTotalsSection', () => {
	beforeEach(() => {
		fetchSpeciesDataMock.mockResolvedValue(speciesStats);
	});
	afterEach(() => {
		cleanup();
		fetchSpeciesDataMock.mockReset();
	});

	describe('without any period-tab data (day summary page)', () => {
		it('renders a single "Species totals" tab, active by default, and lazily loads its table content', async () => {
			render(
				<SummaryTotalsSection
					viewedGroup={viewedGroup}
					fromDate="2026-08-01"
					toDate="2026-08-31"
				/>
			);
			const tab = screen.getByRole('button', { name: 'Species totals' });
			expect(tab.getAttribute('aria-current')).toBe('true');
			expect(screen.queryByRole('button', { name: 'Month totals' })).toBeNull();
			expect(screen.queryByRole('button', { name: 'Year totals' })).toBeNull();
			expect(
				screen.queryByRole('button', { name: 'Session totals' })
			).toBeNull();
			await waitFor(() =>
				expect(document.querySelectorAll('tbody tr').length).toBe(
					speciesStats.length
				)
			);
		});

		it("renders the table's empty state when the fetch returns no species, without crashing", async () => {
			fetchSpeciesDataMock.mockResolvedValue([]);
			render(<SummaryTotalsSection viewedGroup={viewedGroup} />);
			expect(
				screen.getByRole('button', { name: 'Species totals' })
			).toBeTruthy();
			await waitFor(() =>
				expect(document.querySelectorAll('tbody tr').length).toBe(0)
			);
		});

		it('forwards summaryStats to the Species totals table as its totals row', async () => {
			render(
				<SummaryTotalsSection
					viewedGroup={viewedGroup}
					summaryStats={summaryStats}
				/>
			);
			await waitFor(() =>
				expect(screen.getByTestId('totals-row').textContent).toContain('99')
			);
		});
	});

	describe('with monthTotals (year page)', () => {
		it('renders the "Month totals" tab first, active by default', () => {
			render(
				<SummaryTotalsSection
					monthTotals={monthTotals}
					viewedGroup={viewedGroup}
				/>
			);
			const tabs = screen.getAllByRole('button');
			expect(tabs.map((tab) => tab.textContent)).toEqual([
				'Month totals',
				'Species totals'
			]);
			expect(tabs[0].getAttribute('aria-current')).toBe('true');
		});

		it('renders 12 month rows, each linking to /summary/{year}/{month}', () => {
			render(
				<SummaryTotalsSection
					monthTotals={monthTotals}
					viewedGroup={viewedGroup}
				/>
			);
			expect(document.querySelectorAll('tbody tr').length).toBe(12);
			const januaryLink = screen.getByRole('link', { name: 'January 2026' });
			expect(januaryLink.getAttribute('href')).toBe('/summary/2026/1');
			const decemberLink = screen.getByRole('link', { name: 'December 2026' });
			expect(decemberLink.getAttribute('href')).toBe('/summary/2026/12');
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
			render(
				<SummaryTotalsSection
					monthTotals={monthTotals}
					viewedGroup={viewedGroup}
					summaryStats={summaryStats}
				/>
			);
			expect(screen.getByTestId('totals-row').textContent).toContain('99');
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
			const tabs = screen.getAllByRole('button');
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

		it('renders one row per session day, in the order supplied, each linking to the session-temp route with the date formatted "16th August 2026"', () => {
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
				.filter((link) =>
					link.getAttribute('href')?.includes('/session-temp/')
				);
			expect(links.map((link) => link.textContent?.trim())).toEqual([
				'2nd August 2026',
				'16th August 2026'
			]);
			expect(links.map((link) => link.getAttribute('href'))).toEqual([
				'/group/alpha/session-temp/2026-08-02',
				'/group/alpha/session-temp/2026-08-16'
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
			).toBe('/group/alpha/session-temp/2026-08-16');
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
			const tabs = screen.getAllByRole('button');
			expect(tabs.map((tab) => tab.textContent)).toEqual([
				'Year totals',
				'Species totals'
			]);
			expect(tabs[0].getAttribute('aria-current')).toBe('true');
			expect(screen.getByTestId('period-totals-table')).toBeTruthy();
		});

		it('renders the first column as a plain year number linking to /summary/{year}', () => {
			const yearlyTotals = [buildYearlyStat({ time_period: '2026-01-01' })];
			render(
				<SummaryTotalsSection
					yearlyTotals={yearlyTotals}
					viewedGroup={viewedGroup}
				/>
			);
			const link = screen.getByRole('link', { name: '2026' });
			expect(link.getAttribute('href')).toBe('/summary/2026');
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
	});

	describe('when viewedGroup is undefined', () => {
		it('falls back to "Species totals" as the sole default tab, suppressing the session tab and not attempting a fetch', async () => {
			render(
				<SummaryTotalsSection
					sessionTotals={[buildDayStat()]}
					viewedGroup={undefined}
				/>
			);
			const tabs = screen.getAllByRole('button');
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
			let resolveFetch: (value: AggregateStatsResult[]) => void = () => {};
			fetchSpeciesDataMock.mockReturnValue(
				new Promise<AggregateStatsResult[]>((resolve) => {
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
});
