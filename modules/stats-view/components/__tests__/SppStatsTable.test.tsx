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

const BIOMETRIC_COLUMN_HEADINGS = [
	'Max weight',
	'Avg weight',
	'Min weight',
	'Median weight',
	'Max wing',
	'Avg wing',
	'Min wing',
	'Median wing'
] as const;

const SPECIES_WITHOUT_BIOMETRICS = 'Unmeasured Species';

/**
 * Three hand-built rows for the null-biometrics and biometric-sort cases: one
 * species with all 8 wing/weight columns `null` (a cell whose encounters were
 * all biometric-ineligible) and two with values either side of each other, so
 * a sort has something unambiguous to order the null against.
 */
function buildSpeciesRow(
	overrides: Partial<StatsCacheBySpeciesResult> & { species_name: string }
): StatsCacheBySpeciesResult {
	const [template] = speciesStats;
	return { ...template, ...overrides };
}

const pageDataWithMissingBiometrics: PageData = {
	speciesStats: [
		buildSpeciesRow({
			species_name: SPECIES_WITHOUT_BIOMETRICS,
			bird_count: 7,
			encounter_count: 9,
			max_weight: null,
			avg_weight: null,
			min_weight: null,
			median_weight: null,
			max_wing: null,
			avg_wing: null,
			min_wing: null,
			median_wing: null
		}),
		buildSpeciesRow({ species_name: 'Lightest Species', max_weight: 9 }),
		buildSpeciesRow({ species_name: 'Heaviest Species', max_weight: 31 })
	],
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
		it('renders a blank cell for each null biometric metric', () => {
			render(
				<SppStatsTable
					data={pageDataWithMissingBiometrics}
					viewedGroup={{ id: 1, slug: 'alpha' }}
				/>
			);

			for (const heading of BIOMETRIC_COLUMN_HEADINGS) {
				expect(getCellTextByHeading(heading, SPECIES_WITHOUT_BIOMETRICS)).toBe(
					''
				);
			}
		});

		it("still renders the species' counts columns", () => {
			render(
				<SppStatsTable
					data={pageDataWithMissingBiometrics}
					viewedGroup={{ id: 1, slug: 'alpha' }}
				/>
			);

			expect(getCellTextByHeading('Birds', SPECIES_WITHOUT_BIOMETRICS)).toBe(
				'7'
			);
			expect(
				getCellTextByHeading('Encounters', SPECIES_WITHOUT_BIOMETRICS)
			).toBe('9');
		});
	});

	// `SortableTable`'s comparator falls through to `(a as number) > (b as
	// number)` for anything non-string, so what a missing metric compares as is
	// a property of the value, not of the table: `null` coerces to `0` and
	// orders consistently either way round, where the `undefined` the deleted
	// `mergeSpeciesBiometrics` left behind coerced to `NaN` and compared
	// `false` in *both* directions — a non-transitive comparator whose output
	// depended on the input order. Pinned here because the shape change from
	// `Partial` to nullable is what makes the ordering well-defined (#1418).
	describe('sorting by a biometric column', () => {
		function renderAndSortByMaxWeight() {
			render(
				<SppStatsTable
					data={pageDataWithMissingBiometrics}
					viewedGroup={{ id: 1, slug: 'alpha' }}
				/>
			);
			fireEvent.click(screen.getByText('Max weight'));
			return [...document.querySelectorAll('tbody tr')].map(
				(row) => row.querySelector('td')?.textContent?.trim()
			);
		}

		it('orders a species with a null metric consistently against those with a value', () => {
			const orderedDescending = renderAndSortByMaxWeight();

			// Descending on the first click, so the null sorts last rather than
			// landing somewhere arbitrary in the middle.
			expect(orderedDescending.at(-1)).toBe(SPECIES_WITHOUT_BIOMETRICS);

			fireEvent.click(screen.getByText('Max weight'));
			const orderedAscending = [...document.querySelectorAll('tbody tr')].map(
				(row) => row.querySelector('td')?.textContent?.trim()
			);

			expect(orderedAscending.at(0)).toBe(SPECIES_WITHOUT_BIOMETRICS);
		});

		it('sorts species with values in the expected order', () => {
			const orderedDescending = renderAndSortByMaxWeight();

			expect(orderedDescending.slice(0, 2)).toEqual([
				'Heaviest Species',
				'Lightest Species'
			]);
		});
	});
});
