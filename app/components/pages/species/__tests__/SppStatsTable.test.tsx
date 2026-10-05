import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SppStatsTable } from '../SppStatsTable';
import speciesDataSnapshot from '@/test-fixtures/snapshots/core_stats/alpha.by-species.json';
import biometricsSnapshot from '@/test-fixtures/snapshots/biometrics_stats/alpha.by-species.json';
import { getCellTextByHeading } from '@/app/__tests__/helpers/table';
import {
	mergeSpeciesBiometrics,
	type SpeciesStatsRow
} from '@/app/lib/species-stats';
import type { CoreStatsResult, BiometricsStatsResult } from '@/app/models/db';
import type { PageData } from '@/app/(routes)/species/page';

// fetchSpeciesData hands this table the merge of a core_stats by-species result
// and its biometrics_stats sibling, so build the fixture data the same way
// rather than reading the biometric columns off the core_stats fixture —
// core_stats stopped carrying its own copies at #827 and biometrics_stats is
// now their only source (#883).
const speciesStats = mergeSpeciesBiometrics(
	// This fixture is grouped by species only, so time_period is genuinely
	// null — CoreStatsResult's NonNullable mapped type (app/models/db.ts)
	// assumes every column is always present, so a direct assertion doesn't
	// compile (#895).
	// eslint-disable-next-line no-restricted-syntax -- see comment above
	speciesDataSnapshot as unknown as CoreStatsResult[],
	biometricsSnapshot as BiometricsStatsResult[]
);

const pageData: PageData = {
	speciesStats,
	years: [2021, 2022, 2023],
	selection: {}
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

	describe('species list page filtering', () => {
		describe('TemporalFilterControls integration', () => {
			it('the "CES only" checkbox no longer appears', () => {
				render(
					<SppStatsTable
						data={pageData}
						viewedGroup={{ id: 1, slug: 'alpha' }}
					/>
				);
				expect(screen.queryByRole('checkbox')).toBeNull();
				expect(screen.queryByText('CES only')).toBeNull();
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
				years: [2021, 2022, 2023],
				selection: {}
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
