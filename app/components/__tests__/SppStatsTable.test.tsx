import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	waitFor
} from '@testing-library/react';
import { SppStatsTable } from '../SppStatsTable';
import speciesDataSnapshot from '@/test-fixtures/snapshots/fetchSpeciesData.alpha.json';
import type { AggregateStatsResult } from '@/app/models/db';
import type { PageData } from '@/app/(routes)/species/page';

vi.mock('@/app/actions/spp-data', () => ({
	fetchSpeciesData: vi.fn()
}));

const pageData: PageData = {
	speciesStats: speciesDataSnapshot as unknown as AggregateStatsResult[],
	years: [2021, 2022, 2023]
};

describe('SppStatsTable', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	describe('initial render', () => {
		it('renders species data rows from initial data', () => {
			render(<SppStatsTable data={pageData} viewedGroupId={1} />);
			const rows = document.querySelectorAll('tbody tr');
			expect(rows.length).toBe(speciesDataSnapshot.length);
		});
	});

	describe('year filter', () => {
		it('CES only checkbox is disabled when no year selected', () => {
			render(<SppStatsTable data={pageData} viewedGroupId={1} />);
			const cesCheckbox = screen.getByRole('checkbox') as HTMLInputElement;
			expect(cesCheckbox.disabled).toBe(true);
		});

		it('CES only checkbox is enabled after year is selected', async () => {
			const { fetchSpeciesData } = await import('@/app/actions/spp-data');
			vi.mocked(fetchSpeciesData).mockResolvedValue(
				speciesDataSnapshot as unknown as AggregateStatsResult[]
			);
			render(<SppStatsTable data={pageData} viewedGroupId={1} />);
			const yearSelect = screen.getByLabelText('select') as HTMLSelectElement;
			fireEvent.change(yearSelect, { target: { value: '2022' } });
			const cesCheckbox = screen.getByRole('checkbox') as HTMLInputElement;
			expect(cesCheckbox.disabled).toBe(false);
		});

		it('triggers fetchSpeciesData with correct date range when year changes', async () => {
			const { fetchSpeciesData } = await import('@/app/actions/spp-data');
			vi.mocked(fetchSpeciesData).mockResolvedValue(
				speciesDataSnapshot as unknown as AggregateStatsResult[]
			);
			render(<SppStatsTable data={pageData} viewedGroupId={1} />);
			const yearSelect = screen.getByLabelText('select') as HTMLSelectElement;
			fireEvent.change(yearSelect, { target: { value: '2022' } });
			await waitFor(() => {
				expect(vi.mocked(fetchSpeciesData)).toHaveBeenCalledWith(
					1,
					'2022-01-01',
					'2022-12-31'
				);
			});
		});
	});
});
