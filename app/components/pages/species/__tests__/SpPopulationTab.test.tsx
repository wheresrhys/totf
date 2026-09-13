import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	waitFor
} from '@testing-library/react';
import {
	SpPopulationTab,
	RETURNING_VS_NEW_COLORS,
	AGE_SPLIT_COLORS,
	AGE_SPLIT_HUES,
	YOUNG_COUNTS_COLORS,
	YOUNG_COUNTS_HUES,
	NEW_YOUNG_COUNTS_COLORS
} from '../SpPopulationTab';
import type {
	AggregateStatsWithBiometrics,
	PopulationStatsResult
} from '@/app/models/db';

// chartkick registers Chart.js as a side effect; nothing renders a real canvas
// here because the presentational chart components are mocked below.
vi.mock('chartkick/chart.js', () => ({}));

vi.mock('@/app/actions/sp-data', () => ({
	getSpeciesStatsHistory: vi.fn(),
	getSpeciesPopulationStats: vi.fn(),
	getGroupEffortHistory: vi.fn()
}));

vi.mock('../StatsHistoryChart', () => ({
	getCounts: () => [{ name: 'birds', data: [] }],
	getReturningVsNew: () => [
		{ name: 'New adults', data: [] },
		{ name: 'Returning adults', data: [] },
		{ name: 'Young', data: [] }
	],
	getAgeSplit: () => [
		{ name: 'New adults', data: [] },
		{ name: 'First summer', data: [] },
		{ name: 'Oldies', data: [] },
		{ name: 'New young', data: [] }
	],
	getYoungCounts: () => [
		{
			name: 'Juv',
			data: [
				['2024-01-01', 5],
				['2024-02-01', 3]
			]
		},
		{
			name: 'Postjuv',
			data: [
				['2024-01-01', 2],
				['2024-02-01', 4]
			]
		}
	],
	getNewYoungCounts: () => [
		{
			name: 'New juv',
			data: [
				['2024-01-01', 1],
				['2024-02-01', 2]
			]
		},
		{
			name: 'New postjuv',
			data: [
				['2024-01-01', 3],
				['2024-02-01', 1]
			]
		}
	]
}));

vi.mock('@/app/components/YearComparisonTrendChart', () => ({
	YearComparisonTrendChart: ({
		series,
		colors,
		effortHistory,
		compareYearsUrl,
		includeTotalSeries,
		fetchYearSeries
	}: {
		series: { name: string; data: [string, number | null][] }[];
		colors?: string[];
		effortHistory?: unknown;
		compareYearsUrl?: string;
		includeTotalSeries?: boolean;
		fetchYearSeries?: () => Promise<
			{ name: string; data: [string, number | null][] }[]
		>;
	}) => {
		// Mirrors YearComparisonTrendChart's own includeTotalSeries summing
		// (unit-tested against buildTotalSeries directly in
		// YearComparisonTrendChart.test.tsx) just enough for this tab-level test
		// to assert real per-tile series data sums correctly end to end, without
		// re-rendering the real chart/toggle machinery.
		const total = includeTotalSeries
			? series[0].data.map(([date], index) => {
					const sum = series.reduce(
						(runningTotal, metric) =>
							runningTotal + (metric.data[index][1] ?? 0),
						0
					);
					return [date, sum] as [string, number];
				})
			: null;
		return (
			<div
				data-testid="trend-chart"
				data-series-count={series.length}
				data-colors={JSON.stringify(colors ?? null)}
				data-has-effort={effortHistory ? 'yes' : 'no'}
				data-compare-years-url={compareYearsUrl ?? ''}
				data-include-total-series={includeTotalSeries ? 'yes' : 'no'}
				data-total={JSON.stringify(total)}
			>
				{/* Stands in for the real chart's "Interval: Year" radio: clicking it
				    invokes whatever fetcher the tab wired in, so a tab-level test can
				    assert the RPC call the Year interval triggers without rendering the
				    real toggle machinery (covered in YearComparisonTrendChart.test.tsx).
				    Records the resolved series names on the element so the test can also
				    check the right transform was applied to the year-grouped rows. */}
				{fetchYearSeries ? (
					<button
						data-testid="fetch-year-series"
						onClick={(event) => {
							const button = event.currentTarget;
							void fetchYearSeries().then((yearSeries) => {
								button.setAttribute(
									'data-year-series',
									JSON.stringify(yearSeries.map((metric) => metric.name))
								);
							});
						}}
					>
						Year interval
					</button>
				) : null}
			</div>
		);
	}
}));

const props = {
	speciesName: 'Robin',
	viewedGroupId: 1
};

async function loadActions() {
	return import('@/app/actions/sp-data');
}

describe('SpPopulationTab', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	beforeEach(async () => {
		const {
			getSpeciesStatsHistory,
			getSpeciesPopulationStats,
			getGroupEffortHistory
		} = await loadActions();
		vi.mocked(getSpeciesStatsHistory).mockResolvedValue(
			[] as AggregateStatsWithBiometrics[]
		);
		vi.mocked(getSpeciesPopulationStats).mockResolvedValue(
			[] as PopulationStatsResult[]
		);
		vi.mocked(getGroupEffortHistory).mockResolvedValue([['2024-01-01', 10]]);
	});

	describe('Structure: the five population tiles', () => {
		it('renders Counts, Returning vs new, Age split, Young counts and New young counts tiles — no Biometrics/Wing-vs-weight tiles', () => {
			render(<SpPopulationTab {...props} />);
			expect(screen.getByRole('button', { name: /Counts/ })).toBeDefined();
			expect(
				screen.getByRole('button', { name: /Returning vs new/ })
			).toBeDefined();
			expect(screen.getByRole('button', { name: /Age split/ })).toBeDefined();
			expect(
				screen.getByRole('button', { name: /Young counts/ })
			).toBeDefined();
			expect(
				screen.getByRole('button', { name: /New young counts/ })
			).toBeDefined();
			expect(
				screen.queryByRole('button', { name: /Biometrics trends/ })
			).toBeNull();
			expect(
				screen.queryByRole('button', { name: /Wing vs weight/ })
			).toBeNull();
		});
	});

	describe('Usual: initial collapsed grid', () => {
		it('renders a text tile per chart and fetches nothing until a tile is expanded', async () => {
			const { getSpeciesStatsHistory, getSpeciesPopulationStats } =
				await loadActions();
			render(<SpPopulationTab {...props} />);
			expect(
				screen.getByText('Bird and encounter counts over time')
			).toBeDefined();
			expect(screen.queryByTestId('trend-chart')).toBeNull();
			expect(getSpeciesStatsHistory).not.toHaveBeenCalled();
			expect(getSpeciesPopulationStats).not.toHaveBeenCalled();
		});
	});

	describe('Structure: expanding the Counts tile (aggregate_stats)', () => {
		it('fetches aggregate stats once and renders the chart with a close button', async () => {
			const { getSpeciesStatsHistory, getSpeciesPopulationStats } =
				await loadActions();
			render(<SpPopulationTab {...props} />);
			fireEvent.click(screen.getByRole('button', { name: /Counts/ }));
			await screen.findByTestId('trend-chart');
			expect(getSpeciesStatsHistory).toHaveBeenCalledTimes(1);
			expect(getSpeciesStatsHistory).toHaveBeenCalledWith(
				'Robin',
				1,
				undefined,
				undefined
			);
			// The Counts tile does not touch population_stats.
			expect(getSpeciesPopulationStats).not.toHaveBeenCalled();
			expect(
				screen.getByRole('button', { name: 'Close Counts' })
			).toBeDefined();
		});
	});

	describe('Structure: expanding the Returning vs new tile (aggregate_stats + population_stats)', () => {
		it('renders the "Returning vs new" tile heading and description', () => {
			render(<SpPopulationTab {...props} />);
			expect(
				screen.getByRole('button', { name: /Returning vs new/ })
			).toBeDefined();
			expect(
				screen.getByText('New adults, returning adults and young over time')
			).toBeDefined();
		});

		it('expanding the tile triggers both the stats-history and population-stats fetches', async () => {
			const { getSpeciesStatsHistory, getSpeciesPopulationStats } =
				await loadActions();
			render(<SpPopulationTab {...props} />);
			fireEvent.click(screen.getByRole('button', { name: /Returning vs new/ }));
			await screen.findByTestId('trend-chart');
			expect(getSpeciesStatsHistory).toHaveBeenCalledTimes(1);
			expect(getSpeciesPopulationStats).toHaveBeenCalledTimes(1);
		});

		it('shows a spinner until both fetches have resolved, not just one', async () => {
			const { getSpeciesStatsHistory, getSpeciesPopulationStats } =
				await loadActions();
			let resolveStatsHistory!: (value: AggregateStatsWithBiometrics[]) => void;
			vi.mocked(getSpeciesStatsHistory).mockReturnValue(
				new Promise((resolve) => {
					resolveStatsHistory = resolve;
				})
			);
			const { container } = render(<SpPopulationTab {...props} />);
			fireEvent.click(screen.getByRole('button', { name: /Returning vs new/ }));
			// population_stats resolves immediately (default mock); stats_history is
			// still pending — the tile must still show its spinner, not the chart,
			// even though one of the two fetches it needs has already resolved.
			await waitFor(() =>
				expect(getSpeciesPopulationStats).toHaveBeenCalledTimes(1)
			);
			expect(screen.queryByTestId('trend-chart')).toBeNull();
			expect(container.querySelector('.loading-spinner')).not.toBeNull();
			resolveStatsHistory([]);
			await screen.findByTestId('trend-chart');
		});
	});

	describe('Structure: expanding an age/young tile (population_stats)', () => {
		it('fetches population stats once when the Age split tile is expanded', async () => {
			const { getSpeciesPopulationStats, getSpeciesStatsHistory } =
				await loadActions();
			render(<SpPopulationTab {...props} />);
			fireEvent.click(screen.getByRole('button', { name: /Age split/ }));
			await screen.findByTestId('trend-chart');
			expect(getSpeciesPopulationStats).toHaveBeenCalledTimes(1);
			expect(getSpeciesPopulationStats).toHaveBeenCalledWith(
				'Robin',
				1,
				undefined,
				undefined
			);
			// The population tiles do not touch aggregate_stats.
			expect(getSpeciesStatsHistory).not.toHaveBeenCalled();
		});

		it('fetches population stats once when the Young counts tile is expanded', async () => {
			const { getSpeciesPopulationStats, getSpeciesStatsHistory } =
				await loadActions();
			render(<SpPopulationTab {...props} />);
			fireEvent.click(screen.getByRole('button', { name: /Young counts/ }));
			await screen.findByTestId('trend-chart');
			expect(getSpeciesPopulationStats).toHaveBeenCalledTimes(1);
			expect(getSpeciesPopulationStats).toHaveBeenCalledWith(
				'Robin',
				1,
				undefined,
				undefined
			);
			// The population tiles do not touch aggregate_stats.
			expect(getSpeciesStatsHistory).not.toHaveBeenCalled();
		});

		it('fetches population stats once when the New young counts tile is expanded', async () => {
			const { getSpeciesPopulationStats, getSpeciesStatsHistory } =
				await loadActions();
			render(<SpPopulationTab {...props} />);
			fireEvent.click(screen.getByRole('button', { name: /New young counts/ }));
			await screen.findByTestId('trend-chart');
			expect(getSpeciesPopulationStats).toHaveBeenCalledTimes(1);
			expect(getSpeciesPopulationStats).toHaveBeenCalledWith(
				'Robin',
				1,
				undefined,
				undefined
			);
			// The population tiles do not touch aggregate_stats.
			expect(getSpeciesStatsHistory).not.toHaveBeenCalled();
		});
	});

	describe('Structure: the Year interval refetches year-grouped data (#852)', () => {
		// Expands `tileName`, waits for its chart, then fires the mock chart's
		// stand-in for the "Interval: Year" radio — which calls whatever
		// `fetchYearSeries` the tab wired into that tile.
		async function expandAndSwitchToYear(tileName: RegExp) {
			fireEvent.click(screen.getByRole('button', { name: tileName }));
			// findAll, not find: earlier tiles may already be expanded when several
			// are switched to Year in one test.
			await screen.findAllByTestId('trend-chart');
			fireEvent.click(screen.getAllByTestId('fetch-year-series').at(-1)!);
		}

		it('Counts: refetches aggregate stats with interval "year" rather than summing the monthly rows', async () => {
			const { getSpeciesStatsHistory } = await loadActions();
			render(<SpPopulationTab {...props} />);
			await expandAndSwitchToYear(/Counts/);

			await waitFor(() =>
				expect(getSpeciesStatsHistory).toHaveBeenCalledTimes(2)
			);
			expect(getSpeciesStatsHistory).toHaveBeenNthCalledWith(
				1,
				'Robin',
				1,
				undefined,
				undefined
			);
			expect(getSpeciesStatsHistory).toHaveBeenNthCalledWith(
				2,
				'Robin',
				1,
				undefined,
				undefined,
				'year'
			);
			expect(
				screen.getAllByTestId('fetch-year-series').at(-1)!.dataset.yearSeries
			).toBe(JSON.stringify(['birds']));
		});

		it('Age split: refetches population stats with interval "year"', async () => {
			const { getSpeciesPopulationStats } = await loadActions();
			render(<SpPopulationTab {...props} />);
			await expandAndSwitchToYear(/Age split/);

			await waitFor(() =>
				expect(getSpeciesPopulationStats).toHaveBeenCalledTimes(2)
			);
			expect(getSpeciesPopulationStats).toHaveBeenLastCalledWith(
				'Robin',
				1,
				undefined,
				undefined,
				'year'
			);
		});

		it('Young counts: refetches population stats with interval "year"', async () => {
			const { getSpeciesPopulationStats } = await loadActions();
			render(<SpPopulationTab {...props} />);
			await expandAndSwitchToYear(/^Young counts/);

			await waitFor(() =>
				expect(getSpeciesPopulationStats).toHaveBeenCalledTimes(2)
			);
			expect(getSpeciesPopulationStats).toHaveBeenLastCalledWith(
				'Robin',
				1,
				undefined,
				undefined,
				'year'
			);
		});

		it('New young counts: refetches population stats with interval "year"', async () => {
			const { getSpeciesPopulationStats } = await loadActions();
			render(<SpPopulationTab {...props} />);
			await expandAndSwitchToYear(/New young counts/);

			await waitFor(() =>
				expect(getSpeciesPopulationStats).toHaveBeenCalledTimes(2)
			);
			expect(getSpeciesPopulationStats).toHaveBeenLastCalledWith(
				'Robin',
				1,
				undefined,
				undefined,
				'year'
			);
		});

		it('Returning vs new: refetches both RPCs with interval "year"', async () => {
			const { getSpeciesStatsHistory, getSpeciesPopulationStats } =
				await loadActions();
			render(<SpPopulationTab {...props} />);
			await expandAndSwitchToYear(/Returning vs new/);

			await waitFor(() =>
				expect(getSpeciesPopulationStats).toHaveBeenCalledTimes(2)
			);
			expect(getSpeciesStatsHistory).toHaveBeenLastCalledWith(
				'Robin',
				1,
				undefined,
				undefined,
				'year'
			);
			expect(getSpeciesPopulationStats).toHaveBeenLastCalledWith(
				'Robin',
				1,
				undefined,
				undefined,
				'year'
			);
		});

		it('forwards the page date range to the year-grouped fetch', async () => {
			const { getSpeciesPopulationStats } = await loadActions();
			render(
				<SpPopulationTab {...props} fromDate="2024-01-01" toDate="2024-12-31" />
			);
			await expandAndSwitchToYear(/Age split/);

			await waitFor(() =>
				expect(getSpeciesPopulationStats).toHaveBeenLastCalledWith(
					'Robin',
					1,
					'2024-01-01',
					'2024-12-31',
					'year'
				)
			);
		});

		describe('Edge: the year fetch is shared across tiles', () => {
			it('issues one year-grouped population_stats call however many tiles switch to Year', async () => {
				const { getSpeciesPopulationStats } = await loadActions();
				render(<SpPopulationTab {...props} />);
				await expandAndSwitchToYear(/Age split/);
				await expandAndSwitchToYear(/^Young counts/);
				await expandAndSwitchToYear(/New young counts/);

				await waitFor(() =>
					expect(screen.getAllByTestId('trend-chart').length).toBe(3)
				);
				// Three monthly fetches would have been deduped by the existing
				// `populationRequested` guard; the year fetches must dedupe too — one
				// monthly call plus exactly one year call.
				const yearCalls = vi
					.mocked(getSpeciesPopulationStats)
					.mock.calls.filter((call) => call[4] === 'year');
				expect(yearCalls).toHaveLength(1);
			});
		});
	});

	describe('Structure: collapsing a tile', () => {
		it('hides the chart again when the close button is clicked', async () => {
			render(<SpPopulationTab {...props} />);
			fireEvent.click(screen.getByRole('button', { name: /Counts/ }));
			await screen.findByTestId('trend-chart');
			fireEvent.click(screen.getByRole('button', { name: 'Close Counts' }));
			await waitFor(() =>
				expect(screen.queryByTestId('trend-chart')).toBeNull()
			);
			expect(screen.getByRole('button', { name: /Counts/ })).toBeDefined();
		});
	});

	describe('Edge: memoised population_stats fetch shared across tiles', () => {
		it('fetches population stats only once when Age split, Young counts and New young counts are all expanded', async () => {
			const { getSpeciesPopulationStats } = await loadActions();
			render(<SpPopulationTab {...props} />);
			fireEvent.click(screen.getByRole('button', { name: /Age split/ }));
			await screen.findByTestId('trend-chart');
			fireEvent.click(screen.getByRole('button', { name: /Young counts/ }));
			await waitFor(() =>
				expect(screen.getAllByTestId('trend-chart').length).toBe(2)
			);
			fireEvent.click(screen.getByRole('button', { name: /New young counts/ }));
			await waitFor(() =>
				expect(screen.getAllByTestId('trend-chart').length).toBe(3)
			);
			expect(getSpeciesPopulationStats).toHaveBeenCalledTimes(1);
		});

		it('does not refetch when a tile is collapsed and re-expanded', async () => {
			const { getSpeciesPopulationStats } = await loadActions();
			render(<SpPopulationTab {...props} />);
			fireEvent.click(screen.getByRole('button', { name: /Age split/ }));
			await screen.findByTestId('trend-chart');
			fireEvent.click(screen.getByRole('button', { name: 'Close Age split' }));
			await waitFor(() =>
				expect(screen.queryByTestId('trend-chart')).toBeNull()
			);
			fireEvent.click(screen.getByRole('button', { name: /Age split/ }));
			await screen.findByTestId('trend-chart');
			expect(getSpeciesPopulationStats).toHaveBeenCalledTimes(1);
		});
	});

	describe('Edge: date-range scope forwarded to both fetchers', () => {
		it('passes fromDate/toDate through to the aggregate- and population-stats queries', async () => {
			const { getSpeciesStatsHistory, getSpeciesPopulationStats } =
				await loadActions();
			render(
				<SpPopulationTab {...props} fromDate="2024-01-01" toDate="2024-12-31" />
			);
			fireEvent.click(screen.getByRole('button', { name: /Counts/ }));
			await screen.findByTestId('trend-chart');
			fireEvent.click(screen.getByRole('button', { name: /Young counts/ }));
			await waitFor(() =>
				expect(screen.getAllByTestId('trend-chart').length).toBe(2)
			);
			expect(getSpeciesStatsHistory).toHaveBeenCalledWith(
				'Robin',
				1,
				'2024-01-01',
				'2024-12-31'
			);
			expect(getSpeciesPopulationStats).toHaveBeenCalledWith(
				'Robin',
				1,
				'2024-01-01',
				'2024-12-31'
			);
		});
	});

	describe('Structure: series/colours per tile', () => {
		it('passes no colors override on the Counts tile (default palette)', async () => {
			render(<SpPopulationTab {...props} />);
			fireEvent.click(screen.getByRole('button', { name: /Counts/ }));
			const chart = await screen.findByTestId('trend-chart');
			expect(chart.dataset.colors).toBe('null');
		});

		it('passes the Returning vs new colours on the Returning vs new tile', async () => {
			render(<SpPopulationTab {...props} />);
			fireEvent.click(screen.getByRole('button', { name: /Returning vs new/ }));
			const chart = await screen.findByTestId('trend-chart');
			expect(JSON.parse(chart.dataset.colors!)).toEqual(
				RETURNING_VS_NEW_COLORS
			);
			expect(chart.dataset.seriesCount).toBe('3');
		});

		it('passes the paired Age split colours on the Age split tile', async () => {
			render(<SpPopulationTab {...props} />);
			fireEvent.click(screen.getByRole('button', { name: /Age split/ }));
			const chart = await screen.findByTestId('trend-chart');
			expect(JSON.parse(chart.dataset.colors!)).toEqual(AGE_SPLIT_COLORS);
			expect(chart.dataset.seriesCount).toBe('4');
		});

		it('passes the Young counts colours on the Young counts tile', async () => {
			render(<SpPopulationTab {...props} />);
			fireEvent.click(screen.getByRole('button', { name: /Young counts/ }));
			const chart = await screen.findByTestId('trend-chart');
			expect(JSON.parse(chart.dataset.colors!)).toEqual(YOUNG_COUNTS_COLORS);
			expect(chart.dataset.seriesCount).toBe('2');
		});

		it('renders a Total series summing Juv and Postjuv', async () => {
			render(<SpPopulationTab {...props} />);
			fireEvent.click(screen.getByRole('button', { name: /Young counts/ }));
			const chart = await screen.findByTestId('trend-chart');
			expect(JSON.parse(chart.dataset.total!)).toEqual([
				['2024-01-01', 7],
				['2024-02-01', 7]
			]);
		});

		it('passes the New young counts colours on the New young counts tile', async () => {
			render(<SpPopulationTab {...props} />);
			fireEvent.click(screen.getByRole('button', { name: /New young counts/ }));
			const chart = await screen.findByTestId('trend-chart');
			expect(JSON.parse(chart.dataset.colors!)).toEqual(
				NEW_YOUNG_COUNTS_COLORS
			);
			expect(chart.dataset.seriesCount).toBe('2');
		});

		it('renders a Total series summing New juv and New postjuv', async () => {
			render(<SpPopulationTab {...props} />);
			fireEvent.click(screen.getByRole('button', { name: /New young counts/ }));
			const chart = await screen.findByTestId('trend-chart');
			expect(JSON.parse(chart.dataset.total!)).toEqual([
				['2024-01-01', 4],
				['2024-02-01', 3]
			]);
		});

		it('passes includeTotalSeries to the Young counts and New young counts tiles only, not Counts or Age split', async () => {
			render(<SpPopulationTab {...props} />);
			for (const name of [
				/Counts/,
				/Age split/,
				/Young counts/,
				/New young counts/
			]) {
				fireEvent.click(screen.getByRole('button', { name }));
			}
			await waitFor(() =>
				expect(screen.getAllByTestId('trend-chart').length).toBe(4)
			);
			const [counts, ageSplit, youngCounts, newYoungCounts] =
				screen.getAllByTestId('trend-chart');
			expect(counts.dataset.includeTotalSeries).toBe('no');
			expect(ageSplit.dataset.includeTotalSeries).toBe('no');
			expect(youngCounts.dataset.includeTotalSeries).toBe('yes');
			expect(newYoungCounts.dataset.includeTotalSeries).toBe('yes');
		});
	});

	describe('Structure: compareYearsUrl per tile', () => {
		it('passes /species/{name}?tabId=population to every tile when the page is period-scoped', async () => {
			render(
				<SpPopulationTab {...props} fromDate="2024-01-01" toDate="2024-12-31" />
			);
			for (const name of [
				/Counts/,
				/Age split/,
				/Young counts/,
				/New young counts/
			]) {
				fireEvent.click(screen.getByRole('button', { name }));
			}
			await waitFor(() =>
				expect(screen.getAllByTestId('trend-chart').length).toBe(4)
			);
			for (const chart of screen.getAllByTestId('trend-chart')) {
				expect(chart.dataset.compareYearsUrl).toBe(
					'/species/Robin?tabId=population'
				);
			}
		});

		it('omits compareYearsUrl on the all-time render (no fromDate/toDate)', async () => {
			render(<SpPopulationTab {...props} />);
			fireEvent.click(screen.getByRole('button', { name: /Counts/ }));
			const chart = await screen.findByTestId('trend-chart');
			expect(chart.dataset.compareYearsUrl).toBe('');
		});
	});

	describe('Structure: effort history fetched once and passed to every tile', () => {
		it('fetches group effort history once regardless of how many tiles expand, passing it to all four charts', async () => {
			const { getGroupEffortHistory } = await loadActions();
			render(<SpPopulationTab {...props} />);
			for (const name of [
				/Counts/,
				/Age split/,
				/Young counts/,
				/New young counts/
			]) {
				fireEvent.click(screen.getByRole('button', { name }));
			}
			await waitFor(() =>
				expect(screen.getAllByTestId('trend-chart').length).toBe(4)
			);
			await waitFor(() => {
				for (const chart of screen.getAllByTestId('trend-chart')) {
					expect(chart.dataset.hasEffort).toBe('yes');
				}
			});
			expect(getGroupEffortHistory).toHaveBeenCalledTimes(1);
		});
	});

	describe('Edge: colour pairing is by hue family, not arbitrary per-index', () => {
		it('pairs Age split colours into two disjoint hue families (new vs returning)', () => {
			const newFamily = Object.values(AGE_SPLIT_HUES.new);
			const returningFamily = Object.values(AGE_SPLIT_HUES.returning);
			// series order: New adults, First summer, Oldies, New young
			expect(newFamily).toContain(AGE_SPLIT_COLORS[0]); // New adults
			expect(newFamily).toContain(AGE_SPLIT_COLORS[3]); // New young
			expect(returningFamily).toContain(AGE_SPLIT_COLORS[1]); // First summer
			expect(returningFamily).toContain(AGE_SPLIT_COLORS[2]); // Oldies
			// The two families share no colour.
			expect(newFamily.some((colour) => returningFamily.includes(colour))).toBe(
				false
			);
		});

		it('pairs Young counts / New young counts colours as disjoint dark/light draws from the same two hue families', () => {
			const juvFamily = Object.values(YOUNG_COUNTS_HUES.juv);
			const postjuvFamily = Object.values(YOUNG_COUNTS_HUES.postjuv);
			// Young counts: Juv, Postjuv (dark shades).
			expect(juvFamily).toContain(YOUNG_COUNTS_COLORS[0]); // Juv
			expect(postjuvFamily).toContain(YOUNG_COUNTS_COLORS[1]); // Postjuv
			// New young counts: New juv, New postjuv (light shades of the same families).
			expect(juvFamily).toContain(NEW_YOUNG_COUNTS_COLORS[0]); // New juv
			expect(postjuvFamily).toContain(NEW_YOUNG_COUNTS_COLORS[1]); // New postjuv
			// The two tiles' colour sets are entirely disjoint from each other.
			expect(
				YOUNG_COUNTS_COLORS.some((colour) =>
					NEW_YOUNG_COUNTS_COLORS.includes(colour)
				)
			).toBe(false);
			// The juv and postjuv families themselves share no colour.
			expect(juvFamily.some((colour) => postjuvFamily.includes(colour))).toBe(
				false
			);
		});
	});
});
