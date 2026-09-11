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

// chartkick registers Chart.js as a side effect; nothing renders a real canvas
// here because the presentational chart components are mocked below.
vi.mock('chartkick/chart.js', () => ({}));

vi.mock('@/app/actions/sp-data', () => ({
	getSpeciesStatsHistory: vi.fn()
}));

vi.mock('../StatsHistoryChart', () => ({
	getCounts: () => [{ name: 'counts', data: [] }],
	getYoungsters: () => [{ name: 'young', data: [] }]
}));

vi.mock('@/app/components/YearComparisonTrendChart', () => ({
	YearComparisonTrendChart: ({
		series,
		yearlyAggregators
	}: {
		series: unknown[];
		yearlyAggregators?: Record<string, string>;
	}) => (
		<div
			data-testid="trend-chart"
			data-series-count={series.length}
			data-aggregators={JSON.stringify(yearlyAggregators)}
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

describe('SpGraphsTab', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	beforeEach(async () => {
		const { getSpeciesStatsHistory } = await loadActions();
		vi.mocked(getSpeciesStatsHistory).mockResolvedValue(
			[] as AggregateStatsResult[]
		);
	});

	describe('Structure: remaining tiles only', () => {
		it('renders only the Totals and Young tiles — no Biometrics trends or Wing vs weight tiles', () => {
			render(<SpGraphsTab {...props} />);
			expect(screen.getByRole('button', { name: /Totals/ })).toBeDefined();
			expect(screen.getByRole('button', { name: /Young/ })).toBeDefined();
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
			const { getSpeciesStatsHistory } = await loadActions();
			render(<SpGraphsTab {...props} />);
			expect(
				screen.getByText('Bird and encounter counts over time')
			).toBeDefined();
			expect(screen.queryByTestId('trend-chart')).toBeNull();
			expect(getSpeciesStatsHistory).not.toHaveBeenCalled();
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

	describe('Structure: yearly aggregators per tile', () => {
		it('passes all-sum aggregators for the Totals tile’s count metrics', async () => {
			render(<SpGraphsTab {...props} />);
			fireEvent.click(screen.getByRole('button', { name: /Totals/ }));
			const chart = await screen.findByTestId('trend-chart');
			expect(JSON.parse(chart.dataset.aggregators!)).toEqual({
				encounters: 'sum',
				birds: 'sum'
			});
		});

		it('passes all-sum aggregators for the Young tile’s count metrics', async () => {
			render(<SpGraphsTab {...props} />);
			fireEvent.click(screen.getByRole('button', { name: /Young/ }));
			const chart = await screen.findByTestId('trend-chart');
			expect(JSON.parse(chart.dataset.aggregators!)).toEqual({
				juv: 'sum',
				postjuv: 'sum',
				"New young's": 'sum'
			});
		});
	});

	describe('Edge: date-range scope forwarded to fetchers', () => {
		it('passes fromDate/toDate through to the stats-history query', async () => {
			const { getSpeciesStatsHistory } = await loadActions();
			render(
				<SpGraphsTab {...props} fromDate="2024-01-01" toDate="2024-12-31" />
			);
			fireEvent.click(screen.getByRole('button', { name: /Young/ }));
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
