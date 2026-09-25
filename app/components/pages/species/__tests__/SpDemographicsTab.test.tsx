import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	waitFor
} from '@testing-library/react';
import {
	SpDemographicsTab,
	RETURNING_VS_NEW_COLORS,
	RETURNING_AGES_COLORS,
	RETURNING_AGES_HUES,
	YOUNG_COUNTS_COLORS,
	YOUNG_COUNTS_HUES,
	NEW_YOUNG_COUNTS_COLORS,
	ARRIVALS_COLORS_BY_NAME
} from '../SpDemographicsTab';
import type {
	CoreStatsWithBiometrics,
	DemographicsStatsResult,
	ArrivalsStatsResult
} from '@/app/models/db';

// chartkick registers Chart.js as a side effect; nothing renders a real canvas
// here because the presentational chart components are mocked below.
vi.mock('chartkick/chart.js', () => ({}));

vi.mock('@/app/actions/sp-data', () => ({
	getSpeciesStatsHistory: vi.fn(),
	getSpeciesDemographicsStats: vi.fn(),
	getSpeciesArrivalsStats: vi.fn(),
	getGroupEffortHistory: vi.fn()
}));

vi.mock('../StatsHistoryChart', () => ({
	getCounts: () => [{ name: 'birds', data: [] }],
	getReturningVsNew: () => [
		{ name: 'New adults', data: [] },
		{ name: 'Returning adults', data: [] },
		{ name: 'Young', data: [] }
	],
	getReturningAges: () => [
		{ name: '1 year', data: [] },
		{ name: '2 years', data: [] },
		{ name: '3+ years', data: [] },
		{ name: 'Unknown age (new)', data: [] }
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
	],
	getArrivals: vi.fn(() => [
		{ name: 'New adults', data: [] },
		{ name: 'Returning adults', data: [] },
		{ name: 'Pulli', data: [] },
		{ name: 'Juv', data: [] },
		{ name: 'Postjuv', data: [] }
	])
}));

vi.mock('@/app/components/YearComparisonTrendChart', () => ({
	YearComparisonTrendChart: ({
		series,
		colors,
		effortHistory,
		compareYearsUrl,
		includeTotalSeries,
		fetchYearSeries,
		allowYearAccumulation,
		percentStackable
	}: {
		series: { name: string; data: [string, number | null][] }[];
		colors?: string[];
		effortHistory?: unknown;
		compareYearsUrl?: string;
		includeTotalSeries?: boolean;
		fetchYearSeries?: () => Promise<
			{ name: string; data: [string, number | null][] }[]
		>;
		allowYearAccumulation?: boolean;
		percentStackable?: boolean;
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
				data-allow-year-accumulation={allowYearAccumulation ? 'yes' : 'no'}
				data-percent-stackable={percentStackable ? 'yes' : 'no'}
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

function renderDemographicsTab(
	overrides: Partial<{ fromDate: string; toDate: string }> = {}
) {
	return render(<SpDemographicsTab {...props} {...overrides} />);
}

function clickTile(name: RegExp) {
	fireEvent.click(screen.getByRole('button', { name }));
}

// findAll, not find: earlier tiles may already be expanded when several are
// expanded in one test — returns the tile just expanded (the last chart).
async function expandTile(name: RegExp) {
	clickTile(name);
	const charts = await screen.findAllByTestId('trend-chart');
	return charts.at(-1)!;
}

describe('SpDemographicsTab', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	beforeEach(async () => {
		const {
			getSpeciesStatsHistory,
			getSpeciesDemographicsStats,
			getSpeciesArrivalsStats,
			getGroupEffortHistory
		} = await loadActions();
		vi.mocked(getSpeciesStatsHistory).mockResolvedValue(
			[] as CoreStatsWithBiometrics[]
		);
		vi.mocked(getSpeciesDemographicsStats).mockResolvedValue(
			[] as DemographicsStatsResult[]
		);
		vi.mocked(getSpeciesArrivalsStats).mockResolvedValue(
			[] as ArrivalsStatsResult[]
		);
		vi.mocked(getGroupEffortHistory).mockResolvedValue([['2024-01-01', 10]]);
	});

	describe('Structure: the demographics tiles', () => {
		it('renders Counts, Returning vs new, Returning ages, Young counts, New young counts and Arrivals tiles — no Biometrics/Wing-vs-weight tiles, no Age split', () => {
			renderDemographicsTab();
			expect(screen.getByRole('button', { name: /Counts/ })).toBeDefined();
			expect(
				screen.getByRole('button', { name: /Returning vs new/ })
			).toBeDefined();
			expect(
				screen.getByRole('button', { name: /Returning ages/ })
			).toBeDefined();
			expect(
				screen.getByRole('button', { name: /Young counts/ })
			).toBeDefined();
			expect(
				screen.getByRole('button', { name: /New young counts/ })
			).toBeDefined();
			expect(screen.getByRole('button', { name: /Arrivals/ })).toBeDefined();
			expect(
				screen.queryByRole('button', { name: /Biometrics trends/ })
			).toBeNull();
			expect(
				screen.queryByRole('button', { name: /Wing vs weight/ })
			).toBeNull();
		});

		it('no longer renders an "Age split" tile', () => {
			renderDemographicsTab();
			expect(screen.queryByRole('button', { name: /Age split/ })).toBeNull();
		});

		it('renders exactly the tiles: Counts, Returning vs new, Returning ages, Young counts, New young counts, Arrivals', () => {
			renderDemographicsTab();
			const headings = [
				'Counts',
				'Returning vs new',
				'Returning ages',
				'Young counts',
				'New young counts',
				'Arrivals'
			];
			for (const heading of headings) {
				expect(
					screen.getByRole('button', { name: new RegExp(`^${heading}`) })
				).toBeDefined();
			}
			expect(screen.getAllByRole('button').length).toBe(headings.length);
		});
	});

	describe('Usual: initial collapsed grid', () => {
		it('renders a text tile per chart and fetches nothing until a tile is expanded', async () => {
			const { getSpeciesStatsHistory, getSpeciesDemographicsStats } =
				await loadActions();
			renderDemographicsTab();
			expect(
				screen.getByText('Bird and encounter counts over time')
			).toBeDefined();
			expect(screen.queryByTestId('trend-chart')).toBeNull();
			expect(getSpeciesStatsHistory).not.toHaveBeenCalled();
			expect(getSpeciesDemographicsStats).not.toHaveBeenCalled();
		});
	});

	describe('Structure: expanding the Counts tile (core_stats)', () => {
		it('fetches aggregate stats once and renders the chart with a close button', async () => {
			const { getSpeciesStatsHistory, getSpeciesDemographicsStats } =
				await loadActions();
			renderDemographicsTab();
			await expandTile(/Counts/);
			expect(getSpeciesStatsHistory).toHaveBeenCalledTimes(1);
			expect(getSpeciesStatsHistory).toHaveBeenCalledWith(
				'Robin',
				1,
				undefined,
				undefined
			);
			// The Counts tile does not touch demographics_stats.
			expect(getSpeciesDemographicsStats).not.toHaveBeenCalled();
			expect(
				screen.getByRole('button', { name: 'Close Counts' })
			).toBeDefined();
		});
	});

	describe('Structure: expanding the Returning vs new tile (core_stats + demographics_stats)', () => {
		it('renders the "Returning vs new" tile heading and description', () => {
			renderDemographicsTab();
			expect(
				screen.getByRole('button', { name: /Returning vs new/ })
			).toBeDefined();
			expect(
				screen.getByText('New adults, returning adults and young over time')
			).toBeDefined();
		});

		it('expanding the tile triggers both the stats-history and demographics-stats fetches', async () => {
			const { getSpeciesStatsHistory, getSpeciesDemographicsStats } =
				await loadActions();
			renderDemographicsTab();
			await expandTile(/Returning vs new/);
			expect(getSpeciesStatsHistory).toHaveBeenCalledTimes(1);
			expect(getSpeciesDemographicsStats).toHaveBeenCalledTimes(1);
		});

		it('shows a spinner until both fetches have resolved, not just one', async () => {
			const { getSpeciesStatsHistory, getSpeciesDemographicsStats } =
				await loadActions();
			let resolveStatsHistory!: (value: CoreStatsWithBiometrics[]) => void;
			vi.mocked(getSpeciesStatsHistory).mockReturnValue(
				new Promise((resolve) => {
					resolveStatsHistory = resolve;
				})
			);
			const { container } = renderDemographicsTab();
			fireEvent.click(screen.getByRole('button', { name: /Returning vs new/ }));
			// demographics_stats resolves immediately (default mock); stats_history is
			// still pending — the tile must still show its spinner, not the chart,
			// even though one of the two fetches it needs has already resolved.
			await waitFor(() =>
				expect(getSpeciesDemographicsStats).toHaveBeenCalledTimes(1)
			);
			expect(screen.queryByTestId('trend-chart')).toBeNull();
			expect(container.querySelector('.loading-spinner')).not.toBeNull();
			resolveStatsHistory([]);
			await screen.findByTestId('trend-chart');
		});
	});

	describe('Structure: expanding an age/young tile (demographics_stats)', () => {
		it('fetches demographics stats once when the Young counts tile is expanded', async () => {
			const { getSpeciesDemographicsStats, getSpeciesStatsHistory } =
				await loadActions();
			renderDemographicsTab();
			await expandTile(/Young counts/);
			expect(getSpeciesDemographicsStats).toHaveBeenCalledTimes(1);
			expect(getSpeciesDemographicsStats).toHaveBeenCalledWith(
				'Robin',
				1,
				undefined,
				undefined
			);
			// The demographics tiles do not touch core_stats.
			expect(getSpeciesStatsHistory).not.toHaveBeenCalled();
		});

		it('fetches demographics stats once when the New young counts tile is expanded', async () => {
			const { getSpeciesDemographicsStats, getSpeciesStatsHistory } =
				await loadActions();
			renderDemographicsTab();
			await expandTile(/New young counts/);
			expect(getSpeciesDemographicsStats).toHaveBeenCalledTimes(1);
			expect(getSpeciesDemographicsStats).toHaveBeenCalledWith(
				'Robin',
				1,
				undefined,
				undefined
			);
			// The demographics tiles do not touch core_stats.
			expect(getSpeciesStatsHistory).not.toHaveBeenCalled();
		});
	});

	describe('Usual: the Returning ages tile', () => {
		it('renders the "Returning ages" tile heading and description', () => {
			renderDemographicsTab();
			expect(
				screen.getByRole('button', { name: /Returning ages/ })
			).toBeDefined();
			expect(
				screen.getByText(
					'Returning adults over time, split by how old they were proven to be'
				)
			).toBeDefined();
		});
	});

	describe('Structure: expanding the Returning ages tile (demographics_stats)', () => {
		it('expanding the tile triggers the demographics-stats fetch and renders the chart with 4 series', async () => {
			const { getSpeciesDemographicsStats, getSpeciesStatsHistory } =
				await loadActions();
			renderDemographicsTab();
			const chart = await expandTile(/Returning ages/);
			expect(getSpeciesDemographicsStats).toHaveBeenCalledTimes(1);
			expect(getSpeciesDemographicsStats).toHaveBeenCalledWith(
				'Robin',
				1,
				undefined,
				undefined
			);
			// Reuses the existing demographics_stats fetch — no new RPC of its own.
			expect(getSpeciesStatsHistory).not.toHaveBeenCalled();
			expect(chart.dataset.seriesCount).toBe('4');
			expect(JSON.parse(chart.dataset.colors!)).toEqual(RETURNING_AGES_COLORS);
		});
	});

	describe('Edge: the Returning ages tile before load', () => {
		it('shows a spinner before demographics stats have loaded', async () => {
			const { getSpeciesDemographicsStats } = await loadActions();
			vi.mocked(getSpeciesDemographicsStats).mockReturnValue(
				new Promise(() => {})
			);
			const { container } = renderDemographicsTab();
			fireEvent.click(screen.getByRole('button', { name: /Returning ages/ }));
			await waitFor(() =>
				expect(getSpeciesDemographicsStats).toHaveBeenCalledTimes(1)
			);
			expect(screen.queryByTestId('trend-chart')).toBeNull();
			expect(container.querySelector('.loading-spinner')).not.toBeNull();
		});
	});

	describe('Usual: the Arrivals tile', () => {
		it('renders the "Arrivals" tile heading and description, using "pulli" (not "pullus") in the description text', () => {
			renderDemographicsTab();
			expect(screen.getByRole('button', { name: /Arrivals/ })).toBeDefined();
			expect(
				screen.getByText(
					'New adults, returning adults, pulli, juv and postjuv arriving each year'
				)
			).toBeDefined();
		});
	});

	describe('Structure: expanding the Arrivals tile (arrivals_stats)', () => {
		it('expanding the tile triggers the arrivals-stats fetch and renders the chart with 5 series', async () => {
			const { getSpeciesArrivalsStats } = await loadActions();
			renderDemographicsTab();
			const chart = await expandTile(/Arrivals/);
			expect(getSpeciesArrivalsStats).toHaveBeenCalledTimes(1);
			expect(getSpeciesArrivalsStats).toHaveBeenCalledWith(
				'Robin',
				1,
				undefined,
				undefined
			);
			expect(chart.dataset.seriesCount).toBe('5');
		});

		it('passes allowYearAccumulation to YearComparisonTrendChart', async () => {
			renderDemographicsTab();
			const chart = await expandTile(/Arrivals/);
			expect(chart.dataset.allowYearAccumulation).toBe('yes');
		});

		it('passes a colour per series, looked up by name, matching the 5-series default mock', async () => {
			renderDemographicsTab();
			const chart = await expandTile(/Arrivals/);
			expect(JSON.parse(chart.dataset.colors!)).toEqual([
				ARRIVALS_COLORS_BY_NAME['New adults'],
				ARRIVALS_COLORS_BY_NAME['Returning adults'],
				ARRIVALS_COLORS_BY_NAME.Pulli,
				ARRIVALS_COLORS_BY_NAME.Juv,
				ARRIVALS_COLORS_BY_NAME.Postjuv
			]);
		});

		it('drops the Pulli colour (rather than misaligning the rest) when getArrivals omits the Pulli series', async () => {
			const { getArrivals } = await import('../StatsHistoryChart');
			vi.mocked(getArrivals).mockReturnValueOnce([
				{ name: 'New adults', data: [] },
				{ name: 'Returning adults', data: [] },
				{ name: 'Juv', data: [] },
				{ name: 'Postjuv', data: [] }
			]);
			renderDemographicsTab();
			const chart = await expandTile(/Arrivals/);
			expect(chart.dataset.seriesCount).toBe('4');
			expect(JSON.parse(chart.dataset.colors!)).toEqual([
				ARRIVALS_COLORS_BY_NAME['New adults'],
				ARRIVALS_COLORS_BY_NAME['Returning adults'],
				ARRIVALS_COLORS_BY_NAME.Juv,
				ARRIVALS_COLORS_BY_NAME.Postjuv
			]);
		});
	});

	describe('Edge: the Arrivals tile before load', () => {
		it('shows a spinner before arrivals stats have loaded', async () => {
			const { getSpeciesArrivalsStats } = await loadActions();
			vi.mocked(getSpeciesArrivalsStats).mockReturnValue(new Promise(() => {}));
			const { container } = renderDemographicsTab();
			fireEvent.click(screen.getByRole('button', { name: /Arrivals/ }));
			await waitFor(() =>
				expect(getSpeciesArrivalsStats).toHaveBeenCalledTimes(1)
			);
			expect(screen.queryByTestId('trend-chart')).toBeNull();
			expect(container.querySelector('.loading-spinner')).not.toBeNull();
		});
	});

	describe('Structure: the Year interval refetches year-grouped data (#852)', () => {
		// Expands `tileName`, waits for its chart, then fires the mock chart's
		// stand-in for the "Interval: Year" radio — which calls whatever
		// `fetchYearSeries` the tab wired into that tile.
		async function expandAndSwitchToYear(tileName: RegExp) {
			await expandTile(tileName);
			fireEvent.click(screen.getAllByTestId('fetch-year-series').at(-1)!);
		}

		it('Counts: refetches aggregate stats with interval "year" rather than summing the monthly rows', async () => {
			const { getSpeciesStatsHistory } = await loadActions();
			renderDemographicsTab();
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

		it('Young counts: refetches demographics stats with interval "year"', async () => {
			const { getSpeciesDemographicsStats } = await loadActions();
			renderDemographicsTab();
			await expandAndSwitchToYear(/^Young counts/);

			await waitFor(() =>
				expect(getSpeciesDemographicsStats).toHaveBeenCalledTimes(2)
			);
			expect(getSpeciesDemographicsStats).toHaveBeenLastCalledWith(
				'Robin',
				1,
				undefined,
				undefined,
				'year'
			);
		});

		it('New young counts: refetches demographics stats with interval "year"', async () => {
			const { getSpeciesDemographicsStats } = await loadActions();
			renderDemographicsTab();
			await expandAndSwitchToYear(/New young counts/);

			await waitFor(() =>
				expect(getSpeciesDemographicsStats).toHaveBeenCalledTimes(2)
			);
			expect(getSpeciesDemographicsStats).toHaveBeenLastCalledWith(
				'Robin',
				1,
				undefined,
				undefined,
				'year'
			);
		});

		it('Returning ages: refetches demographics stats with interval "year"', async () => {
			const { getSpeciesDemographicsStats } = await loadActions();
			renderDemographicsTab();
			await expandAndSwitchToYear(/Returning ages/);

			await waitFor(() =>
				expect(getSpeciesDemographicsStats).toHaveBeenCalledTimes(2)
			);
			expect(getSpeciesDemographicsStats).toHaveBeenLastCalledWith(
				'Robin',
				1,
				undefined,
				undefined,
				'year'
			);
		});

		it('Returning vs new: refetches both RPCs with interval "year"', async () => {
			const { getSpeciesStatsHistory, getSpeciesDemographicsStats } =
				await loadActions();
			renderDemographicsTab();
			await expandAndSwitchToYear(/Returning vs new/);

			await waitFor(() =>
				expect(getSpeciesDemographicsStats).toHaveBeenCalledTimes(2)
			);
			expect(getSpeciesStatsHistory).toHaveBeenLastCalledWith(
				'Robin',
				1,
				undefined,
				undefined,
				'year'
			);
			expect(getSpeciesDemographicsStats).toHaveBeenLastCalledWith(
				'Robin',
				1,
				undefined,
				undefined,
				'year'
			);
		});

		it('forwards the page date range to the year-grouped fetch', async () => {
			const { getSpeciesDemographicsStats } = await loadActions();
			renderDemographicsTab({ fromDate: '2024-01-01', toDate: '2024-12-31' });
			await expandAndSwitchToYear(/^Young counts/);

			await waitFor(() =>
				expect(getSpeciesDemographicsStats).toHaveBeenLastCalledWith(
					'Robin',
					1,
					'2024-01-01',
					'2024-12-31',
					'year'
				)
			);
		});

		describe('Edge: the year fetch is shared across tiles', () => {
			it('issues one year-grouped demographics_stats call however many tiles switch to Year', async () => {
				const { getSpeciesDemographicsStats } = await loadActions();
				renderDemographicsTab();
				await expandAndSwitchToYear(/Returning ages/);
				await expandAndSwitchToYear(/^Young counts/);
				await expandAndSwitchToYear(/New young counts/);

				await waitFor(() =>
					expect(screen.getAllByTestId('trend-chart').length).toBe(3)
				);
				// Three monthly fetches would have been deduped by the existing
				// `demographicsRequested` guard; the year fetches must dedupe too — one
				// monthly call plus exactly one year call.
				const yearCalls = vi
					.mocked(getSpeciesDemographicsStats)
					.mock.calls.filter((call) => call[4] === 'year');
				expect(yearCalls).toHaveLength(1);
			});
		});
	});

	describe('Structure: collapsing a tile', () => {
		it('hides the chart again when the close button is clicked', async () => {
			renderDemographicsTab();
			await expandTile(/Counts/);
			fireEvent.click(screen.getByRole('button', { name: 'Close Counts' }));
			await waitFor(() =>
				expect(screen.queryByTestId('trend-chart')).toBeNull()
			);
			expect(screen.getByRole('button', { name: /Counts/ })).toBeDefined();
		});
	});

	describe('Edge: memoised demographics_stats fetch shared across tiles', () => {
		it('fetches demographics stats only once when Returning ages, Young counts and New young counts are all expanded', async () => {
			const { getSpeciesDemographicsStats } = await loadActions();
			renderDemographicsTab();
			await expandTile(/Returning ages/);
			fireEvent.click(screen.getByRole('button', { name: /Young counts/ }));
			await waitFor(() =>
				expect(screen.getAllByTestId('trend-chart').length).toBe(2)
			);
			fireEvent.click(screen.getByRole('button', { name: /New young counts/ }));
			await waitFor(() =>
				expect(screen.getAllByTestId('trend-chart').length).toBe(3)
			);
			expect(getSpeciesDemographicsStats).toHaveBeenCalledTimes(1);
		});

		it('does not refetch when a tile is collapsed and re-expanded', async () => {
			const { getSpeciesDemographicsStats } = await loadActions();
			renderDemographicsTab();
			await expandTile(/Returning ages/);
			fireEvent.click(
				screen.getByRole('button', { name: 'Close Returning ages' })
			);
			await waitFor(() =>
				expect(screen.queryByTestId('trend-chart')).toBeNull()
			);
			await expandTile(/Returning ages/);
			expect(getSpeciesDemographicsStats).toHaveBeenCalledTimes(1);
		});
	});

	describe('Edge: date-range scope forwarded to both fetchers', () => {
		it('passes fromDate/toDate through to the aggregate- and demographics-stats queries', async () => {
			const { getSpeciesStatsHistory, getSpeciesDemographicsStats } =
				await loadActions();
			renderDemographicsTab({ fromDate: '2024-01-01', toDate: '2024-12-31' });
			await expandTile(/Counts/);
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
			expect(getSpeciesDemographicsStats).toHaveBeenCalledWith(
				'Robin',
				1,
				'2024-01-01',
				'2024-12-31'
			);
		});
	});

	describe('Structure: series/colours per tile', () => {
		it('passes no colors override on the Counts tile (default palette)', async () => {
			renderDemographicsTab();
			const chart = await expandTile(/Counts/);
			expect(chart.dataset.colors).toBe('null');
		});

		it('passes the Returning vs new colours on the Returning vs new tile', async () => {
			renderDemographicsTab();
			const chart = await expandTile(/Returning vs new/);
			expect(JSON.parse(chart.dataset.colors!)).toEqual(
				RETURNING_VS_NEW_COLORS
			);
			expect(chart.dataset.seriesCount).toBe('3');
		});

		it('passes the Young counts colours on the Young counts tile', async () => {
			renderDemographicsTab();
			const chart = await expandTile(/Young counts/);
			expect(JSON.parse(chart.dataset.colors!)).toEqual(YOUNG_COUNTS_COLORS);
			expect(chart.dataset.seriesCount).toBe('2');
		});

		it('renders a Total series summing Juv and Postjuv', async () => {
			renderDemographicsTab();
			const chart = await expandTile(/Young counts/);
			expect(JSON.parse(chart.dataset.total!)).toEqual([
				['2024-01-01', 7],
				['2024-02-01', 7]
			]);
		});

		it('passes the New young counts colours on the New young counts tile', async () => {
			renderDemographicsTab();
			const chart = await expandTile(/New young counts/);
			expect(JSON.parse(chart.dataset.colors!)).toEqual(
				NEW_YOUNG_COUNTS_COLORS
			);
			expect(chart.dataset.seriesCount).toBe('2');
		});

		it('renders a Total series summing New juv and New postjuv', async () => {
			renderDemographicsTab();
			const chart = await expandTile(/New young counts/);
			expect(JSON.parse(chart.dataset.total!)).toEqual([
				['2024-01-01', 4],
				['2024-02-01', 3]
			]);
		});

		it('passes includeTotalSeries to the Young counts and New young counts tiles only, not Counts or Returning ages', async () => {
			renderDemographicsTab();
			for (const name of [
				/Counts/,
				/Returning ages/,
				/^Young counts/,
				/New young counts/
			]) {
				fireEvent.click(screen.getByRole('button', { name }));
			}
			await waitFor(() =>
				expect(screen.getAllByTestId('trend-chart').length).toBe(4)
			);
			const [counts, returningAges, youngCounts, newYoungCounts] =
				screen.getAllByTestId('trend-chart');
			expect(counts.dataset.includeTotalSeries).toBe('no');
			expect(returningAges.dataset.includeTotalSeries).toBe('no');
			expect(youngCounts.dataset.includeTotalSeries).toBe('yes');
			expect(newYoungCounts.dataset.includeTotalSeries).toBe('yes');
		});
	});

	describe('Structure: percentStackable per tile', () => {
		it('passes percentStackable to the Counts, Returning vs new, Returning ages, and both young-trends chart tiles', async () => {
			renderDemographicsTab();
			for (const name of [
				/Counts/,
				/Returning vs new/,
				/Returning ages/,
				/^Young counts/,
				/New young counts/
			]) {
				fireEvent.click(screen.getByRole('button', { name }));
			}
			await waitFor(() =>
				expect(screen.getAllByTestId('trend-chart').length).toBe(5)
			);
			for (const chart of screen.getAllByTestId('trend-chart')) {
				expect(chart.dataset.percentStackable).toBe('yes');
			}
		});

		it('does not pass percentStackable to the Arrivals tile', async () => {
			renderDemographicsTab();
			const chart = await expandTile(/Arrivals/);
			expect(chart.dataset.percentStackable).toBe('no');
		});
	});

	describe('Structure: compareYearsUrl per tile', () => {
		it('passes /species/{name}?tabId=demographics to every tile when the page is period-scoped', async () => {
			renderDemographicsTab({ fromDate: '2024-01-01', toDate: '2024-12-31' });
			for (const name of [
				/Counts/,
				/Returning ages/,
				/^Young counts/,
				/New young counts/
			]) {
				fireEvent.click(screen.getByRole('button', { name }));
			}
			await waitFor(() =>
				expect(screen.getAllByTestId('trend-chart').length).toBe(4)
			);
			for (const chart of screen.getAllByTestId('trend-chart')) {
				expect(chart.dataset.compareYearsUrl).toBe(
					'/species/Robin?tabId=demographics'
				);
			}
		});

		it('omits compareYearsUrl on the all-time render (no fromDate/toDate)', async () => {
			renderDemographicsTab();
			const chart = await expandTile(/Counts/);
			expect(chart.dataset.compareYearsUrl).toBe('');
		});
	});

	describe('Structure: effort history fetched once and passed to every tile', () => {
		it('fetches group effort history once regardless of how many tiles expand, passing it to all four charts', async () => {
			const { getGroupEffortHistory } = await loadActions();
			renderDemographicsTab();
			for (const name of [
				/Counts/,
				/Returning ages/,
				/^Young counts/,
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
		it('ramps the three Returning ages age steps through one hue and gives Unknown age (new) a hue outside it', () => {
			const returningFamily = Object.values(RETURNING_AGES_HUES.returning);
			// series order: 1 year, 2 years, 3+ years, Unknown age (new)
			expect(returningFamily).toEqual(RETURNING_AGES_COLORS.slice(0, 3));
			// The ordered ramp is three distinct steps, not a repeated colour.
			expect(new Set(returningFamily).size).toBe(3);
			// "Unknown age (new)" is categorically different, so it must sit outside
			// the ramp rather than reading as a fourth, older step.
			expect(returningFamily).not.toContain(RETURNING_AGES_HUES.unknown);
			expect(RETURNING_AGES_COLORS[3]).toBe(RETURNING_AGES_HUES.unknown);
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
