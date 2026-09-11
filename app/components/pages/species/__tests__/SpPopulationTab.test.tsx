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
	AGE_SPLIT_COLORS,
	AGE_SPLIT_HUES,
	YOUNG_TRENDS_COLORS,
	YOUNG_TRENDS_HUES
} from '../SpPopulationTab';
import type {
	AggregateStatsResult,
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
	getAgeSplit: () => [
		{ name: 'New adults', data: [] },
		{ name: 'First summer', data: [] },
		{ name: 'Oldies', data: [] },
		{ name: 'New young', data: [] }
	],
	getYoungTrends: () => [
		{ name: 'Juv', data: [] },
		{ name: 'New juv', data: [] },
		{ name: 'Postjuv', data: [] },
		{ name: 'New postjuv', data: [] },
		{ name: 'Young', data: [] },
		{ name: 'New young', data: [] }
	]
}));

vi.mock('@/app/components/YearComparisonTrendChart', () => ({
	YearComparisonTrendChart: ({
		series,
		colors,
		effortHistory,
		compareYearsUrl
	}: {
		series: unknown[];
		colors?: string[];
		effortHistory?: unknown;
		compareYearsUrl?: string;
	}) => (
		<div
			data-testid="trend-chart"
			data-series-count={series.length}
			data-colors={JSON.stringify(colors ?? null)}
			data-has-effort={effortHistory ? 'yes' : 'no'}
			data-compare-years-url={compareYearsUrl ?? ''}
		/>
	)
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
			[] as AggregateStatsResult[]
		);
		vi.mocked(getSpeciesPopulationStats).mockResolvedValue(
			[] as PopulationStatsResult[]
		);
		vi.mocked(getGroupEffortHistory).mockResolvedValue([['2024-01-01', 10]]);
	});

	describe('Structure: the three population tiles', () => {
		it('renders Counts, Age split and Young trends tiles — no Biometrics/Wing-vs-weight tiles', () => {
			render(<SpPopulationTab {...props} />);
			expect(screen.getByRole('button', { name: /Counts/ })).toBeDefined();
			expect(screen.getByRole('button', { name: /Age split/ })).toBeDefined();
			expect(
				screen.getByRole('button', { name: /Young trends/ })
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
		it('fetches population stats only once when both Age split and Young trends are expanded', async () => {
			const { getSpeciesPopulationStats } = await loadActions();
			render(<SpPopulationTab {...props} />);
			fireEvent.click(screen.getByRole('button', { name: /Age split/ }));
			await screen.findByTestId('trend-chart');
			fireEvent.click(screen.getByRole('button', { name: /Young trends/ }));
			await waitFor(() =>
				expect(screen.getAllByTestId('trend-chart').length).toBe(2)
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
			fireEvent.click(screen.getByRole('button', { name: /Young trends/ }));
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

		it('passes the paired Age split colours on the Age split tile', async () => {
			render(<SpPopulationTab {...props} />);
			fireEvent.click(screen.getByRole('button', { name: /Age split/ }));
			const chart = await screen.findByTestId('trend-chart');
			expect(JSON.parse(chart.dataset.colors!)).toEqual(AGE_SPLIT_COLORS);
			expect(chart.dataset.seriesCount).toBe('4');
		});

		it('passes the paired Young trends colours on the Young trends tile', async () => {
			render(<SpPopulationTab {...props} />);
			fireEvent.click(screen.getByRole('button', { name: /Young trends/ }));
			const chart = await screen.findByTestId('trend-chart');
			expect(JSON.parse(chart.dataset.colors!)).toEqual(YOUNG_TRENDS_COLORS);
			expect(chart.dataset.seriesCount).toBe('6');
		});
	});

	describe('Structure: compareYearsUrl per tile', () => {
		it('passes /species/{name}?tabId=population to every tile when the page is period-scoped', async () => {
			render(
				<SpPopulationTab {...props} fromDate="2024-01-01" toDate="2024-12-31" />
			);
			for (const name of [/Counts/, /Age split/, /Young trends/]) {
				fireEvent.click(screen.getByRole('button', { name }));
			}
			await waitFor(() =>
				expect(screen.getAllByTestId('trend-chart').length).toBe(3)
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
		it('fetches group effort history once regardless of how many tiles expand, passing it to all three charts', async () => {
			const { getGroupEffortHistory } = await loadActions();
			render(<SpPopulationTab {...props} />);
			for (const name of [/Counts/, /Age split/, /Young trends/]) {
				fireEvent.click(screen.getByRole('button', { name }));
			}
			await waitFor(() =>
				expect(screen.getAllByTestId('trend-chart').length).toBe(3)
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

		it('pairs Young trends colours into three disjoint hue families', () => {
			const families = [
				Object.values(YOUNG_TRENDS_HUES.juv),
				Object.values(YOUNG_TRENDS_HUES.postjuv),
				Object.values(YOUNG_TRENDS_HUES.young)
			];
			// Each adjacent (raw, new) pair shares one family: (0,1),(2,3),(4,5).
			for (const [familyIndex, family] of families.entries()) {
				expect(family).toContain(YOUNG_TRENDS_COLORS[familyIndex * 2]);
				expect(family).toContain(YOUNG_TRENDS_COLORS[familyIndex * 2 + 1]);
			}
			// All six colours are distinct (no family overlap).
			expect(new Set(YOUNG_TRENDS_COLORS).size).toBe(6);
		});
	});
});
