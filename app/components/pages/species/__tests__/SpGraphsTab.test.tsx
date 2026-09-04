import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	waitFor
} from '@testing-library/react';
import { SpGraphsTab } from '../SpGraphsTab';
import type { AggregateStatsResult } from '@/app/models/db';
import type { SexedGraphableBird } from '../WeightAndWingChart';

// chartkick registers Chart.js as a side effect; nothing renders a real canvas
// here because the presentational chart components are mocked below.
vi.mock('chartkick/chart.js', () => ({}));

vi.mock('@/app/actions/sp-data', () => ({
	getSpeciesStatsHistory: vi.fn(),
	fetchGraphableEncounterData: vi.fn()
}));

vi.mock('../StatsHistoryChart', () => ({
	getCounts: () => [{ name: 'counts', data: [] }],
	getYoungsters: () => [{ name: 'young', data: [] }],
	getSizes: () => [{ name: 'sizes', data: [] }]
}));

vi.mock('@/app/components/YearComparisonTrendChart', () => ({
	YearComparisonTrendChart: ({ series }: { series: unknown[] }) => (
		<div data-testid="trend-chart" data-series-count={series.length} />
	)
}));

vi.mock('../WeightAndWingChart', () => ({
	WingWeightScatterChart: () => <div data-testid="scatter-chart" />
}));

const props = {
	speciesName: 'Robin',
	speciesId: 42,
	viewedGroupId: 1
};

async function loadActions() {
	return import('@/app/actions/sp-data');
}

describe('SpGraphsTab', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	beforeEach(async () => {
		const { getSpeciesStatsHistory, fetchGraphableEncounterData } =
			await loadActions();
		vi.mocked(getSpeciesStatsHistory).mockResolvedValue(
			[] as AggregateStatsResult[]
		);
		vi.mocked(fetchGraphableEncounterData).mockResolvedValue(
			[] as SexedGraphableBird[]
		);
	});

	describe('Usual: initial collapsed grid', () => {
		it('renders a text tile per chart and fetches nothing until a tile is expanded', async () => {
			const { getSpeciesStatsHistory, fetchGraphableEncounterData } =
				await loadActions();
			render(<SpGraphsTab {...props} />);
			expect(screen.getByRole('button', { name: /Totals/ })).toBeDefined();
			expect(screen.getByRole('button', { name: /Young/ })).toBeDefined();
			expect(
				screen.getByRole('button', { name: /Biometrics trends/ })
			).toBeDefined();
			expect(
				screen.getByRole('button', { name: /Wing vs weight/ })
			).toBeDefined();
			expect(
				screen.getByText('Bird and encounter counts over time')
			).toBeDefined();
			expect(screen.queryByTestId('trend-chart')).toBeNull();
			expect(screen.queryByTestId('scatter-chart')).toBeNull();
			expect(getSpeciesStatsHistory).not.toHaveBeenCalled();
			expect(fetchGraphableEncounterData).not.toHaveBeenCalled();
		});
	});

	describe('Structure: expanding a trend tile', () => {
		it('fetches stats history once and renders the trend chart with a close button', async () => {
			const { getSpeciesStatsHistory } = await loadActions();
			render(<SpGraphsTab {...props} />);
			fireEvent.click(screen.getByRole('button', { name: /Totals/ }));
			await screen.findByTestId('trend-chart');
			expect(getSpeciesStatsHistory).toHaveBeenCalledTimes(1);
			expect(getSpeciesStatsHistory).toHaveBeenCalledWith(
				'Robin',
				1,
				undefined,
				undefined
			);
			expect(
				screen.getByRole('button', { name: 'Close Totals' })
			).toBeDefined();
		});
	});

	describe('Structure: expanding the scatter tile', () => {
		it('fetches graphable encounter data (not stats history) and renders the scatter chart', async () => {
			const { getSpeciesStatsHistory, fetchGraphableEncounterData } =
				await loadActions();
			render(<SpGraphsTab {...props} />);
			fireEvent.click(screen.getByRole('button', { name: /Wing vs weight/ }));
			await screen.findByTestId('scatter-chart');
			expect(fetchGraphableEncounterData).toHaveBeenCalledTimes(1);
			expect(fetchGraphableEncounterData).toHaveBeenCalledWith(
				42,
				1,
				undefined,
				undefined
			);
			expect(getSpeciesStatsHistory).not.toHaveBeenCalled();
		});
	});

	describe('Structure: collapsing a tile', () => {
		it('hides the chart again when the close button is clicked', async () => {
			render(<SpGraphsTab {...props} />);
			fireEvent.click(screen.getByRole('button', { name: /Totals/ }));
			await screen.findByTestId('trend-chart');
			fireEvent.click(screen.getByRole('button', { name: 'Close Totals' }));
			await waitFor(() =>
				expect(screen.queryByTestId('trend-chart')).toBeNull()
			);
			expect(screen.getByRole('button', { name: /Totals/ })).toBeDefined();
		});
	});

	describe('Edge: memoised stats-history fetch shared across trend tiles', () => {
		it('fetches stats history only once when two trend tiles are expanded', async () => {
			const { getSpeciesStatsHistory } = await loadActions();
			render(<SpGraphsTab {...props} />);
			fireEvent.click(screen.getByRole('button', { name: /Totals/ }));
			await screen.findByTestId('trend-chart');
			fireEvent.click(screen.getByRole('button', { name: /Young/ }));
			await waitFor(() =>
				expect(screen.getAllByTestId('trend-chart').length).toBe(2)
			);
			expect(getSpeciesStatsHistory).toHaveBeenCalledTimes(1);
		});

		it('does not refetch when a tile is collapsed and re-expanded', async () => {
			const { getSpeciesStatsHistory } = await loadActions();
			render(<SpGraphsTab {...props} />);
			fireEvent.click(screen.getByRole('button', { name: /Totals/ }));
			await screen.findByTestId('trend-chart');
			fireEvent.click(screen.getByRole('button', { name: 'Close Totals' }));
			await waitFor(() =>
				expect(screen.queryByTestId('trend-chart')).toBeNull()
			);
			fireEvent.click(screen.getByRole('button', { name: /Totals/ }));
			await screen.findByTestId('trend-chart');
			expect(getSpeciesStatsHistory).toHaveBeenCalledTimes(1);
		});
	});

	describe('Edge: date-range scope forwarded to fetchers', () => {
		it('passes fromDate/toDate through to the stats-history query', async () => {
			const { getSpeciesStatsHistory } = await loadActions();
			render(
				<SpGraphsTab {...props} fromDate="2024-01-01" toDate="2024-12-31" />
			);
			fireEvent.click(
				screen.getByRole('button', { name: /Biometrics trends/ })
			);
			await screen.findByTestId('trend-chart');
			expect(getSpeciesStatsHistory).toHaveBeenCalledWith(
				'Robin',
				1,
				'2024-01-01',
				'2024-12-31'
			);
		});
	});
});
