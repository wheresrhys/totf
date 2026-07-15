import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { SpYearComparisonTab } from '../SpYearComparisonTab';
import yearComparisonSnapshot from '@/test-fixtures/snapshots/getSpeciesYearComparison.alpha.robin.json';
import type { AggregateStatsResult } from '@/app/models/db';

vi.mock('@/app/actions/sp-data', () => ({
	getSpeciesYearComparison: vi.fn()
}));

describe('SpYearComparisonTab', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(async () => {
		const { getSpeciesYearComparison } = await import('@/app/actions/sp-data');
		vi.mocked(getSpeciesYearComparison).mockResolvedValue(
			yearComparisonSnapshot as unknown as AggregateStatsResult[]
		);
	});

	it('shows a loading spinner while data is fetching', async () => {
		const { getSpeciesYearComparison } = await import('@/app/actions/sp-data');
		let resolveData!: (v: AggregateStatsResult[]) => void;
		vi.mocked(getSpeciesYearComparison).mockReturnValue(
			new Promise((resolve) => {
				resolveData = resolve;
			})
		);
		render(<SpYearComparisonTab speciesName="Robin" viewedGroupId={1} />);
		expect(document.querySelector('.loading')).toBeDefined();
		resolveData(yearComparisonSnapshot as unknown as AggregateStatsResult[]);
	});

	it('renders a row per year once loaded', async () => {
		render(<SpYearComparisonTab speciesName="Robin" viewedGroupId={1} />);
		await waitFor(() => {
			expect(screen.getByRole('table')).toBeDefined();
		});
		const rows = document.querySelectorAll('tbody tr');
		expect(rows.length).toBe(yearComparisonSnapshot.length);
	});

	it('shows the year in the first column', async () => {
		render(<SpYearComparisonTab speciesName="Robin" viewedGroupId={1} />);
		await waitFor(() => {
			expect(screen.getByRole('table')).toBeDefined();
		});
		const firstCells = document.querySelectorAll('tbody tr td:first-child');
		expect(firstCells[0].textContent).toBe('2023');
		expect(firstCells[1].textContent).toBe('2024');
	});

	it('shows no-data message when no years returned', async () => {
		const { getSpeciesYearComparison } = await import('@/app/actions/sp-data');
		vi.mocked(getSpeciesYearComparison).mockResolvedValue([]);
		render(<SpYearComparisonTab speciesName="Robin" viewedGroupId={1} />);
		await waitFor(() => {
			expect(screen.getByText('No year data found')).toBeDefined();
		});
	});
});
