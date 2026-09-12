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
import { getCellTextByHeading } from '@/app/__tests__/helpers/table';
import type { SpeciesStatsRow } from '@/app/lib/species-stats';
import type { PageData } from '@/app/(routes)/species/page';

vi.mock('@/app/actions/spp-data', () => ({
	fetchSpeciesData: vi.fn()
}));

const speciesStats = speciesDataSnapshot as unknown as SpeciesStatsRow[];

const pageData: PageData = {
	speciesStats,
	years: [2021, 2022, 2023]
};

describe('SppStatsTable', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	describe('initial render', () => {
		it('renders species data rows from initial data', () => {
			render(
				<SppStatsTable data={pageData} viewedGroup={{ id: 1, slug: 'alpha' }} />
			);
			const rows = document.querySelectorAll('tbody tr');
			expect(rows.length).toBe(speciesDataSnapshot.length);
		});
	});

	describe('year filter', () => {
		it('CES only checkbox is disabled when no year selected', () => {
			render(
				<SppStatsTable data={pageData} viewedGroup={{ id: 1, slug: 'alpha' }} />
			);
			const cesCheckbox = screen.getByRole('checkbox') as HTMLInputElement;
			expect(cesCheckbox.disabled).toBe(true);
		});

		it('CES only checkbox is enabled after year is selected', async () => {
			const { fetchSpeciesData } = await import('@/app/actions/spp-data');
			vi.mocked(fetchSpeciesData).mockResolvedValue(speciesStats);
			render(
				<SppStatsTable data={pageData} viewedGroup={{ id: 1, slug: 'alpha' }} />
			);
			const yearSelect = screen.getByLabelText('select') as HTMLSelectElement;
			fireEvent.change(yearSelect, { target: { value: '2022' } });
			const cesCheckbox = screen.getByRole('checkbox') as HTMLInputElement;
			expect(cesCheckbox.disabled).toBe(false);
		});

		it('triggers fetchSpeciesData with correct date range when year changes', async () => {
			const { fetchSpeciesData } = await import('@/app/actions/spp-data');
			vi.mocked(fetchSpeciesData).mockResolvedValue(speciesStats);
			render(
				<SppStatsTable data={pageData} viewedGroup={{ id: 1, slug: 'alpha' }} />
			);
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

	describe('biometrics data', () => {
		it('renders a blank cell for a biometric column when that species has no biometrics_stats row', () => {
			const [firstSpecies, ...restSpecies] = speciesStats;
			const speciesWithoutBiometrics: SpeciesStatsRow = {
				...firstSpecies,
				max_weight: undefined,
				avg_weight: undefined,
				min_weight: undefined,
				median_weight: undefined,
				max_wing: undefined,
				avg_wing: undefined,
				min_wing: undefined,
				median_wing: undefined
			};
			const pageDataWithMissingBiometrics: PageData = {
				speciesStats: [speciesWithoutBiometrics, ...restSpecies],
				years: [2021, 2022, 2023]
			};

			render(
				<SppStatsTable
					data={pageDataWithMissingBiometrics}
					viewedGroup={{ id: 1, slug: 'alpha' }}
				/>
			);

			expect(
				getCellTextByHeading('Max weight', firstSpecies.species_name)
			).toBe('');
		});
	});
});
