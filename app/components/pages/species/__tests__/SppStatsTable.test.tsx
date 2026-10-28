import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	waitFor
} from '@testing-library/react';
import { SppStatsTable } from '../SppStatsTable';
import speciesDataSnapshot from '@/test-fixtures/snapshots/core_stats/alpha.by-species.json';
import { ALPHA_BIOMETRICS_BY_SPECIES } from '@/app/__tests__/helpers/biometrics-stats-fixtures';
import { getCellTextByHeading } from '@/app/__tests__/helpers/table';
import {
	mergeSpeciesBiometrics,
	type SpeciesStatsRow
} from '@/app/lib/species-stats';
import type { CoreStatsResult } from '@/app/models/db';
import type { PageData } from '@/app/(routes)/species/page';

vi.mock('@/app/actions/spp-data', () => ({
	fetchSpeciesData: vi.fn()
}));

// fetchSpeciesData hands this table the merge of a core_stats by-species result
// and its wing/weight sibling, so build the fixture data the same way rather
// than reading the biometric columns off the core_stats fixture — core_stats
// stopped carrying its own copies at #827 (#883).
const speciesStats = mergeSpeciesBiometrics(
	// This fixture is grouped by species only, so time_period is genuinely
	// null — CoreStatsResult's NonNullable mapped type (app/models/db.ts)
	// assumes every column is always present, so a direct assertion doesn't
	// compile (#895).
	// eslint-disable-next-line no-restricted-syntax -- see comment above
	speciesDataSnapshot as unknown as CoreStatsResult[],
	ALPHA_BIOMETRICS_BY_SPECIES
);

const pageData: PageData = {
	speciesStats,
	years: [2021, 2022, 2023],
	accessLevel: 'own'
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

	describe('species-name links', () => {
		const [{ species_name: speciesName }] = speciesStats;

		it('scopes the link to the group whose table it was rendered for', () => {
			render(
				<SppStatsTable data={pageData} viewedGroup={{ id: 2, slug: 'beta' }} />
			);

			expect(
				screen.getByRole('link', { name: speciesName }).getAttribute('href')
			).toBe(`/group/beta/species/${speciesName}`);
		});

		it('falls back to the ungrouped link for a group with no slug', () => {
			render(
				<SppStatsTable data={pageData} viewedGroup={{ id: 1, slug: null }} />
			);

			expect(
				screen.getByRole('link', { name: speciesName }).getAttribute('href')
			).toBe(`/species/${speciesName}`);
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
					{ id: 1, slug: 'alpha' },
					'2022-01-01',
					'2022-12-31'
				);
			});
		});
	});

	describe('arbitrary-window date controls (CES only checkbox + date inputs)', () => {
		it.each(['own', 'shared'] as const)(
			"renders the CES only checkbox and both date inputs for a '%s' access level",
			(accessLevel) => {
				render(
					<SppStatsTable
						data={{ ...pageData, accessLevel }}
						viewedGroup={{ id: 1, slug: 'alpha' }}
					/>
				);
				expect(screen.queryByLabelText('CES only')).not.toBeNull();
				expect(screen.queryByLabelText('From date')).not.toBeNull();
				expect(screen.queryByLabelText('To date')).not.toBeNull();
			}
		);

		it.each(['public', 'blocked'] as const)(
			"hides the CES only checkbox and both date inputs for a '%s' access level",
			(accessLevel) => {
				render(
					<SppStatsTable
						data={{ ...pageData, accessLevel }}
						viewedGroup={{ id: 1, slug: 'alpha' }}
					/>
				);
				expect(screen.queryByLabelText('CES only')).toBeNull();
				expect(screen.queryByLabelText('From date')).toBeNull();
				expect(screen.queryByLabelText('To date')).toBeNull();
			}
		);

		it('still renders the year selector when CES only and date inputs are hidden', () => {
			render(
				<SppStatsTable
					data={{ ...pageData, accessLevel: 'public' }}
					viewedGroup={{ id: 1, slug: 'alpha' }}
				/>
			);
			expect(screen.queryByLabelText('select')).not.toBeNull();
		});
	});

	describe('biometrics data', () => {
		it('renders a blank cell for a biometric column when that species has no biometrics row', () => {
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
				years: [2021, 2022, 2023],
				accessLevel: 'own'
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
