import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	waitFor
} from '@testing-library/react';
import { SppStatsTable } from '../SppStatsTable';
import { ALPHA_CORE_STATS_BY_SPECIES } from '@/app/__tests__/helpers/core-stats-fixtures';
import { getCellTextByHeading } from '@/app/__tests__/helpers/table';
import type { PageData } from '@/app/(routes)/species/page';
import type { StatsCacheBySpeciesResult } from '@/modules/stats/browser';

vi.mock('@/app/actions/spp-data', () => ({
	fetchSpeciesData: vi.fn()
}));

// `fetchSpeciesData` hands this table whole `SimpleStatsCacheBySpecies` rows,
// counts and wing/weight columns together on one row (#1415) — so the
// by-species snapshot fixture *is* the shape under test, with no merge against
// a separate biometrics fixture in between. It used to be built by
// `mergeSpeciesBiometrics` over `ALPHA_BIOMETRICS_BY_SPECIES`, back when
// production fetched the two halves separately and rejoined them by
// `species_name`.
const speciesStats = ALPHA_CORE_STATS_BY_SPECIES;

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
			expect(rows.length).toBe(ALPHA_CORE_STATS_BY_SPECIES.length);
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

	describe('arbitrary-window date controls (the free-text date inputs)', () => {
		it.each(['own', 'shared'] as const)(
			"renders both date inputs for a '%s' access level",
			(accessLevel) => {
				render(
					<SppStatsTable
						data={{ ...pageData, accessLevel }}
						viewedGroup={{ id: 1, slug: 'alpha' }}
					/>
				);
				expect(screen.queryByLabelText('From date')).not.toBeNull();
				expect(screen.queryByLabelText('To date')).not.toBeNull();
			}
		);

		it.each(['public', 'blocked'] as const)(
			"hides both date inputs for a '%s' access level",
			(accessLevel) => {
				render(
					<SppStatsTable
						data={{ ...pageData, accessLevel }}
						viewedGroup={{ id: 1, slug: 'alpha' }}
					/>
				);
				expect(screen.queryByLabelText('From date')).toBeNull();
				expect(screen.queryByLabelText('To date')).toBeNull();
			}
		);

		it('still renders the year selector when the date inputs are hidden', () => {
			render(
				<SppStatsTable
					data={{ ...pageData, accessLevel: 'public' }}
					viewedGroup={{ id: 1, slug: 'alpha' }}
				/>
			);
			expect(screen.queryByLabelText('select')).not.toBeNull();
		});
	});

	describe('rendering a species with no biometric data', () => {
		// `null` rather than `undefined` since #1415: a species with no
		// biometric-eligible encounters carries a real `null` in all 8 columns
		// (an empty `MAX`/`AVG`/`MIN`/`PERCENTILE_CONT`), where the old
		// `mergeSpeciesBiometrics` left them absent. Both render as a blank cell
		// through `MultiSpeciesTableBody`'s generic `<td>{species[property]}</td>`.
		it('renders a blank cell for a null metric', () => {
			const [firstSpecies, ...restSpecies] = speciesStats;
			const speciesWithoutBiometrics: StatsCacheBySpeciesResult = {
				...firstSpecies,
				max_weight: null,
				avg_weight: null,
				min_weight: null,
				median_weight: null,
				max_wing: null,
				avg_wing: null,
				min_wing: null,
				median_wing: null
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
