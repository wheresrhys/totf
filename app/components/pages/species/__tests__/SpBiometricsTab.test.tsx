import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	waitFor
} from '@testing-library/react';
import { SpBiometricsTab } from '../SpBiometricsTab';
import spPageSnapshot from '@/test-fixtures/snapshots/fetchSpPageData.alpha.robin.json';
import type { CoreStatsWithBiometrics } from '@/app/models/db';
import type { FullFatPageData } from '@/app/(routes)/species/[speciesName]/PageContent';
import type { SexedGraphableBird } from '../WeightAndWingChart';

// chartkick registers Chart.js as a side effect; nothing renders a real canvas
// here because the presentational chart components are mocked below.
vi.mock('chartkick/chart.js', () => ({}));

vi.mock('@/app/actions/sp-data', () => ({
	getSpeciesStatsHistory: vi.fn(),
	fetchGraphableEncounterData: vi.fn()
}));

vi.mock('../StatsHistoryChart', () => ({
	getSizes: () => [{ name: 'sizes', data: [] }]
}));

vi.mock('@/app/components/YearComparisonTrendChart', () => ({
	YearComparisonTrendChart: ({
		series,
		effortHistory,
		compareYearsUrl,
		yearlyAggregators
	}: {
		series: unknown[];
		effortHistory?: { name: string; data: unknown[] } | null;
		compareYearsUrl?: string;
		yearlyAggregators?: Record<string, string>;
	}) => (
		<div
			data-testid="trend-chart"
			data-series-count={series.length}
			data-effort-history={effortHistory ? JSON.stringify(effortHistory) : ''}
			data-compare-years-url={compareYearsUrl ?? ''}
			data-aggregators={JSON.stringify(yearlyAggregators)}
		/>
	)
}));

vi.mock('../WeightAndWingChart', () => ({
	WingWeightScatterChart: () => <div data-testid="scatter-chart" />
}));

const { speciesStats } = spPageSnapshot as unknown as FullFatPageData;

const props = {
	speciesStats,
	speciesName: 'Robin',
	speciesId: 42,
	viewedGroupId: 1
};

async function loadActions() {
	return import('@/app/actions/sp-data');
}

describe('SpBiometricsTab', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	beforeEach(async () => {
		const { getSpeciesStatsHistory, fetchGraphableEncounterData } =
			await loadActions();
		vi.mocked(getSpeciesStatsHistory).mockResolvedValue(
			[] as CoreStatsWithBiometrics[]
		);
		vi.mocked(fetchGraphableEncounterData).mockResolvedValue(
			[] as SexedGraphableBird[]
		);
	});

	describe('Usual: sentences render from speciesStats', () => {
		it('shows the Weight sentence with min-max range, avg and median', () => {
			render(<SpBiometricsTab {...props} />);
			expect(
				screen.getByText(/Weight:.*16\.5-21g.*avg: 18\.3g.*median: 18g/i)
			).toBeDefined();
		});

		it('shows the Wing sentence with min-max range, avg and median', () => {
			render(<SpBiometricsTab {...props} />);
			expect(
				screen.getByText(/Wing:.*72-80mm.*avg: 74\.2mm.*median: 74mm/i)
			).toBeDefined();
		});
	});

	describe('Usual: initial collapsed grid', () => {
		it('renders a text tile per chart and fetches nothing until a tile is expanded', async () => {
			const { getSpeciesStatsHistory, fetchGraphableEncounterData } =
				await loadActions();
			render(<SpBiometricsTab {...props} />);
			expect(
				screen.getByRole('button', { name: /Biometrics trends/ })
			).toBeDefined();
			expect(
				screen.getByRole('button', { name: /Wing vs weight/ })
			).toBeDefined();
			expect(screen.queryByTestId('trend-chart')).toBeNull();
			expect(screen.queryByTestId('scatter-chart')).toBeNull();
			expect(getSpeciesStatsHistory).not.toHaveBeenCalled();
			expect(fetchGraphableEncounterData).not.toHaveBeenCalled();
		});
	});

	describe('Structure: expanding the biometrics trend tile', () => {
		it('fetches stats history once and renders the trend chart with a close button', async () => {
			const { getSpeciesStatsHistory } = await loadActions();
			render(<SpBiometricsTab {...props} />);
			fireEvent.click(
				screen.getByRole('button', { name: /Biometrics trends/ })
			);
			await screen.findByTestId('trend-chart');
			expect(getSpeciesStatsHistory).toHaveBeenCalledTimes(1);
			expect(getSpeciesStatsHistory).toHaveBeenCalledWith(
				'Robin',
				1,
				undefined,
				undefined
			);
			expect(
				screen.getByRole('button', { name: 'Close Biometrics trends' })
			).toBeDefined();
		});

		// This is already an avg-based chart (min/max/median wing and weight), not
		// a count, so effort-normalizing it doesn't make sense — no effortHistory
		// is fetched or passed through, which keeps the Normalize toggle (gated on
		// `effortHistory` being passed) from ever appearing on this tile.
		it('never passes effortHistory through to the trend chart, so no Normalize toggle can appear', async () => {
			render(<SpBiometricsTab {...props} />);
			fireEvent.click(
				screen.getByRole('button', { name: /Biometrics trends/ })
			);
			const chart = await screen.findByTestId('trend-chart');
			expect(chart.dataset.effortHistory).toBe('');
		});
	});

	describe('Structure: compareYearsUrl', () => {
		it('is set to the Population tab (tabId=population) when the page is period-scoped', async () => {
			render(
				<SpBiometricsTab {...props} fromDate="2024-01-01" toDate="2024-12-31" />
			);
			fireEvent.click(
				screen.getByRole('button', { name: /Biometrics trends/ })
			);
			const chart = await screen.findByTestId('trend-chart');
			expect(chart.dataset.compareYearsUrl).toBe(
				'/species/Robin?tabId=population'
			);
		});

		it('is undefined on the all-time render (no fromDate/toDate)', async () => {
			render(<SpBiometricsTab {...props} />);
			fireEvent.click(
				screen.getByRole('button', { name: /Biometrics trends/ })
			);
			const chart = await screen.findByTestId('trend-chart');
			expect(chart.dataset.compareYearsUrl).toBe('');
		});
	});

	describe('Structure: yearly aggregators for the biometrics tile', () => {
		it('passes max/mean/min aggregators per weight and wing metric', async () => {
			render(<SpBiometricsTab {...props} />);
			fireEvent.click(
				screen.getByRole('button', { name: /Biometrics trends/ })
			);
			const chart = await screen.findByTestId('trend-chart');
			expect(JSON.parse(chart.dataset.aggregators!)).toEqual({
				'max weight': 'max',
				'median weight': 'mean',
				'min weight': 'min',
				'max wing': 'max',
				'median wing': 'mean',
				'min wing': 'min'
			});
		});
	});

	describe('Structure: expanding the scatter tile', () => {
		it('fetches graphable encounter data (not stats history) and renders the scatter chart', async () => {
			const { getSpeciesStatsHistory, fetchGraphableEncounterData } =
				await loadActions();
			render(<SpBiometricsTab {...props} />);
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
			render(<SpBiometricsTab {...props} />);
			fireEvent.click(
				screen.getByRole('button', { name: /Biometrics trends/ })
			);
			await screen.findByTestId('trend-chart');
			fireEvent.click(
				screen.getByRole('button', { name: 'Close Biometrics trends' })
			);
			await waitFor(() =>
				expect(screen.queryByTestId('trend-chart')).toBeNull()
			);
			expect(
				screen.getByRole('button', { name: /Biometrics trends/ })
			).toBeDefined();
		});
	});

	describe('Edge: independent fetch state from SpPopulationTab', () => {
		it('does not refetch when a tile is collapsed and re-expanded', async () => {
			const { getSpeciesStatsHistory } = await loadActions();
			render(<SpBiometricsTab {...props} />);
			fireEvent.click(
				screen.getByRole('button', { name: /Biometrics trends/ })
			);
			await screen.findByTestId('trend-chart');
			fireEvent.click(
				screen.getByRole('button', { name: 'Close Biometrics trends' })
			);
			await waitFor(() =>
				expect(screen.queryByTestId('trend-chart')).toBeNull()
			);
			fireEvent.click(
				screen.getByRole('button', { name: /Biometrics trends/ })
			);
			await screen.findByTestId('trend-chart');
			expect(getSpeciesStatsHistory).toHaveBeenCalledTimes(1);
		});
	});

	describe('Edge: date-range scope forwarded to fetchers', () => {
		it('passes fromDate/toDate through to the stats-history query', async () => {
			const { getSpeciesStatsHistory } = await loadActions();
			render(
				<SpBiometricsTab {...props} fromDate="2024-01-01" toDate="2024-12-31" />
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
