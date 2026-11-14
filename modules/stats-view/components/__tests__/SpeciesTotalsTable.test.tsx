import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SpeciesTotalsTable } from '../SpeciesTotalsTable';
import { ALPHA_CORE_STATS_BY_SPECIES } from '@/app/__tests__/helpers/core-stats-fixtures';
import {
	getCellByHeading,
	getCellTextByHeading
} from '@/app/__tests__/helpers/table';
import type { StatsCacheBySpeciesResult } from '@/modules/stats/browser';

const speciesStats = ALPHA_CORE_STATS_BY_SPECIES;

// The real header <th>s live in the `<thead>` row without a `data-testid` —
// `above-header-row` (the "Aggregate by" toggle row) and `totals-row` are
// the other two possible `<thead>` rows, both explicitly testid'd, so this
// excludes them rather than relying on the header row's fixed position.
function getColumnHeaders(): HTMLTableCellElement[] {
	const headerRow = Array.from(document.querySelectorAll('thead tr')).find(
		(row) => !row.hasAttribute('data-testid')
	);
	return Array.from(
		headerRow?.querySelectorAll('th') ?? []
	) as HTMLTableCellElement[];
}

function makeStat(
	overrides: Partial<StatsCacheBySpeciesResult> & { species_name: string }
): StatsCacheBySpeciesResult {
	return {
		session_count: 0,
		encounter_count: 0,
		bird_count: 0,
		new_bird_count: 0,
		pullus_bird_count: 0,
		juv_bird_count: 0,
		postjuv_bird_count: 0,
		adult_bird_count: 0,
		unknown_age_bird_count: 0,
		...overrides
	} as StatsCacheBySpeciesResult;
}

describe('SpeciesTotalsTable', () => {
	afterEach(() => {
		cleanup();
	});

	describe('column headings', () => {
		it('renders twelve column headers in the expected order', () => {
			render(<SpeciesTotalsTable speciesStats={speciesStats} />);
			const headers = getColumnHeaders();
			expect(headers.map((header) => header.textContent)).toEqual([
				'Species',
				'Sessions',
				'Encounters',
				'Busiest session',
				'Birds',
				'New',
				'Retrap',
				'Pulli',
				'Juv',
				'Postjuv',
				'Adult',
				'Not aged'
			]);
		});
	});

	describe('rows', () => {
		it('renders one row per species with all twelve columns in the correct order', () => {
			render(<SpeciesTotalsTable speciesStats={speciesStats} />);
			const rows = document.querySelectorAll('tbody tr');
			expect(rows.length).toBe(speciesStats.length);

			const firstStat = speciesStats[0];
			const firstRowCells = rows[0].querySelectorAll('td');
			expect(
				Array.from(firstRowCells).map((cell) => cell.textContent?.trim())
			).toEqual([
				firstStat.species_name,
				String(firstStat.session_count),
				String(firstStat.encounter_count),
				String(firstStat.max_per_session),
				String(firstStat.bird_count),
				String(firstStat.new_bird_count),
				String(firstStat.bird_count - firstStat.new_bird_count),
				String(firstStat.pullus_bird_count),
				String(firstStat.juv_bird_count),
				String(firstStat.postjuv_bird_count),
				String(firstStat.adult_bird_count),
				String(firstStat.unknown_age_bird_count)
			]);
		});

		it('links each species name to /species/{speciesName}', () => {
			render(<SpeciesTotalsTable speciesStats={speciesStats} />);
			const firstStat = speciesStats[0];
			const link = screen.getByRole('link', { name: firstStat.species_name });
			expect(link.getAttribute('href')).toBe(
				`/species/${firstStat.species_name}`
			);
		});
	});

	describe('species name link — period scoping (#625)', () => {
		const stats = [makeStat({ species_name: 'Robin' })];

		it('links to /species/{speciesName} when no period prop is supplied (regression guard)', () => {
			render(<SpeciesTotalsTable speciesStats={stats} />);
			const link = screen.getByRole('link', { name: 'Robin' });
			expect(link.getAttribute('href')).toBe('/species/Robin');
		});

		it('links to /species/{speciesName}/{year} when period has a year only', () => {
			render(
				<SpeciesTotalsTable speciesStats={stats} period={{ year: 2024 }} />
			);
			const link = screen.getByRole('link', { name: 'Robin' });
			expect(link.getAttribute('href')).toBe('/species/Robin/2024');
		});

		it('links to /species/{speciesName}/{year}/{month} when period has a year and month', () => {
			render(
				<SpeciesTotalsTable
					speciesStats={stats}
					period={{ year: 2024, month: 3 }}
				/>
			);
			const link = screen.getByRole('link', { name: 'Robin' });
			expect(link.getAttribute('href')).toBe('/species/Robin/2024/3');
		});

		it('links to /species/{speciesName}/{monthAbbreviation} when period is a squashed month (#1005)', () => {
			render(
				<SpeciesTotalsTable
					speciesStats={stats}
					period={{ squashedMonth: 1 }}
				/>
			);
			const link = screen.getByRole('link', { name: 'Robin' });
			expect(link.getAttribute('href')).toBe('/species/Robin/jan');
		});

		it('produces a valid link at every period depth for a species name requiring URL-encoding', () => {
			const spacedStats = [makeStat({ species_name: 'Blue Tit' })];

			const { rerender } = render(
				<SpeciesTotalsTable speciesStats={spacedStats} />
			);
			expect(
				screen.getByRole('link', { name: 'Blue Tit' }).getAttribute('href')
			).toBe('/species/Blue Tit');

			rerender(
				<SpeciesTotalsTable
					speciesStats={spacedStats}
					period={{ year: 2024 }}
				/>
			);
			expect(
				screen.getByRole('link', { name: 'Blue Tit' }).getAttribute('href')
			).toBe('/species/Blue Tit/2024');

			rerender(
				<SpeciesTotalsTable
					speciesStats={spacedStats}
					period={{ year: 2024, month: 3 }}
				/>
			);
			expect(
				screen.getByRole('link', { name: 'Blue Tit' }).getAttribute('href')
			).toBe('/species/Blue Tit/2024/3');
		});
	});

	describe('sorting', () => {
		const stats = [
			makeStat({ species_name: 'Robin', encounter_count: 5 }),
			makeStat({ species_name: 'Wren', encounter_count: 12 }),
			makeStat({ species_name: 'Blue Tit', encounter_count: 3 })
		];

		it('sorts descending on the first click of a header', () => {
			render(<SpeciesTotalsTable speciesStats={stats} />);
			fireEvent.click(screen.getByText('Encounters'));
			const rows = document.querySelectorAll('tbody tr');
			expect(rows[0].textContent).toContain('Wren');
			expect(rows[1].textContent).toContain('Robin');
			expect(rows[2].textContent).toContain('Blue Tit');
		});

		it('reverses to ascending on a second click of the same header', () => {
			render(<SpeciesTotalsTable speciesStats={stats} />);
			fireEvent.click(screen.getByText('Encounters'));
			fireEvent.click(screen.getByText('Encounters'));
			const rows = document.querySelectorAll('tbody tr');
			expect(rows[0].textContent).toContain('Blue Tit');
			expect(rows[1].textContent).toContain('Robin');
			expect(rows[2].textContent).toContain('Wren');
		});

		it('switches the active sort column when a different header is clicked', () => {
			const statsWithBirdCounts = [
				makeStat({ species_name: 'Robin', encounter_count: 5, bird_count: 1 }),
				makeStat({ species_name: 'Wren', encounter_count: 12, bird_count: 9 }),
				makeStat({
					species_name: 'Blue Tit',
					encounter_count: 3,
					bird_count: 4
				})
			];
			render(<SpeciesTotalsTable speciesStats={statsWithBirdCounts} />);
			fireEvent.click(screen.getByText('Encounters'));
			fireEvent.click(screen.getByText('Birds'));
			const rows = document.querySelectorAll('tbody tr');
			// descending by Birds: Wren (9), Blue Tit (4), Robin (1)
			expect(rows[0].textContent).toContain('Wren');
			expect(rows[1].textContent).toContain('Blue Tit');
			expect(rows[2].textContent).toContain('Robin');
		});

		it('sorts the Species column alphabetically ascending on the first click', () => {
			render(<SpeciesTotalsTable speciesStats={stats} />);
			fireEvent.click(screen.getByText('Species'));
			const rows = document.querySelectorAll('tbody tr');
			expect(rows[0].textContent).toContain('Blue Tit');
			expect(rows[1].textContent).toContain('Robin');
			expect(rows[2].textContent).toContain('Wren');
		});
	});

	describe('Sessions column', () => {
		it('renders session_count as the Sessions column value for each row', () => {
			const stats = [
				makeStat({ species_name: 'Robin', session_count: 3 }),
				makeStat({ species_name: 'Wren', session_count: 7 })
			];
			render(<SpeciesTotalsTable speciesStats={stats} />);
			const rows = document.querySelectorAll('tbody tr');
			expect(rows[0].textContent).toContain('3');
			expect(rows[1].textContent).toContain('7');
		});

		it('sorts descending on the first click of the Sessions header', () => {
			const stats = [
				makeStat({ species_name: 'Robin', session_count: 3 }),
				makeStat({ species_name: 'Wren', session_count: 7 }),
				makeStat({ species_name: 'Blue Tit', session_count: 1 })
			];
			render(<SpeciesTotalsTable speciesStats={stats} />);
			fireEvent.click(screen.getByText('Sessions'));
			const rows = document.querySelectorAll('tbody tr');
			expect(rows[0].textContent).toContain('Wren');
			expect(rows[1].textContent).toContain('Robin');
			expect(rows[2].textContent).toContain('Blue Tit');
		});

		it('renders 0 when session_count is 0', () => {
			const stats = [makeStat({ species_name: 'Robin', session_count: 0 })];
			render(<SpeciesTotalsTable speciesStats={stats} />);
			expect(getCellTextByHeading('Sessions', 0)).toBe('0');
		});
	});

	describe('column styling', () => {
		it('applies a distinct background colour to each of the New/Retraps/Pullus/Juvs/Postjuv/Adults/Unknown age columns, on header and cells alike', () => {
			const stats = [makeStat({ species_name: 'Robin', pullus_bird_count: 1 })];
			render(<SpeciesTotalsTable speciesStats={stats} />);
			const headers = getColumnHeaders();

			const columnStyle = (label: string) => ({
				header: headers.find((header) => header.textContent === label),
				cell: getCellByHeading(label, 0)
			});

			const expectations: [string, string][] = [
				['New', 'bg-green-50'],
				['Retrap', 'bg-amber-50'],
				['Pulli', 'bg-cyan-50'],
				['Juv', 'bg-sky-50'],
				['Postjuv', 'bg-blue-50'],
				['Adult', 'bg-purple-50'],
				['Not aged', 'bg-taupe-50']
			];
			expectations.forEach(([label, className]) => {
				const { header, cell } = columnStyle(label);
				expect(header?.className).toContain(className);
				expect(cell.className).toContain(className);
			});
		});
	});

	describe('empty state', () => {
		it('renders the empty-state message and no table when speciesStats is empty', () => {
			render(<SpeciesTotalsTable speciesStats={[]} />);
			expect(screen.getByText('No species recorded.')).not.toBeNull();
			expect(document.querySelector('table')).toBeNull();
		});
	});

	describe('totals row', () => {
		const stats = [
			makeStat({
				species_name: 'Robin',
				session_count: 3,
				encounter_count: 5,
				max_per_session: 3,
				bird_count: 4,
				new_bird_count: 3,
				pullus_bird_count: 1,
				juv_bird_count: 1,
				postjuv_bird_count: 0,
				adult_bird_count: 2,
				unknown_age_bird_count: 0
			}),
			makeStat({
				species_name: 'Wren',
				session_count: 2,
				encounter_count: 7,
				max_per_session: 4,
				bird_count: 6,
				new_bird_count: 4,
				pullus_bird_count: 0,
				juv_bird_count: 2,
				postjuv_bird_count: 1,
				adult_bird_count: 3,
				unknown_age_bird_count: 0
			})
		];
		const totalsStats = makeStat({
			species_name: 'All species',
			session_count: 4,
			encounter_count: 12,
			max_per_session: 4,
			bird_count: 10,
			new_bird_count: 7,
			pullus_bird_count: 1,
			juv_bird_count: 3,
			postjuv_bird_count: 1,
			adult_bird_count: 5,
			unknown_age_bird_count: 0
		});

		it('renders a "Total" row with values from totalsStats when supplied', () => {
			render(
				<SpeciesTotalsTable speciesStats={stats} totalsStats={totalsStats} />
			);
			const totalsRow = screen.getByTestId('totals-row');
			const cells = totalsRow.querySelectorAll('td');
			expect(Array.from(cells).map((cell) => cell.textContent?.trim())).toEqual(
				[
					'Total',
					String(totalsStats.session_count),
					String(totalsStats.encounter_count),
					String(totalsStats.max_per_session),
					String(totalsStats.bird_count),
					String(totalsStats.new_bird_count),
					String(totalsStats.bird_count - totalsStats.new_bird_count),
					String(totalsStats.pullus_bird_count),
					String(totalsStats.juv_bird_count),
					String(totalsStats.postjuv_bird_count),
					String(totalsStats.adult_bird_count),
					String(totalsStats.unknown_age_bird_count)
				]
			);
		});

		it("renders the totals row's species-name cell as plain text, not a species link", () => {
			render(
				<SpeciesTotalsTable speciesStats={stats} totalsStats={totalsStats} />
			);
			const totalsRow = screen.getByTestId('totals-row');
			expect(totalsRow.querySelector('a')).toBeNull();
			expect(totalsRow.querySelector('td')?.textContent).toBe('Total');
		});

		it('renders no totals row when totalsStats is omitted', () => {
			render(<SpeciesTotalsTable speciesStats={stats} />);
			expect(screen.queryByTestId('totals-row')).toBeNull();
		});

		it('renders no totals row when speciesStats is empty, even if totalsStats is supplied', () => {
			render(
				<SpeciesTotalsTable speciesStats={[]} totalsStats={totalsStats} />
			);
			expect(screen.queryByTestId('totals-row')).toBeNull();
			expect(screen.getByText('No species recorded.')).not.toBeNull();
		});
	});

	describe('Pullus column visibility', () => {
		it('omits the Pullus column when no species in the dataset has a nonzero pullus count', () => {
			const stats = [
				makeStat({ species_name: 'Robin', pullus_bird_count: 0 }),
				makeStat({ species_name: 'Wren', pullus_bird_count: 0 })
			];
			render(<SpeciesTotalsTable speciesStats={stats} />);
			expect(
				getColumnHeaders().map((header) => header.textContent)
			).not.toContain('Pullus');
		});

		it('shows the Pullus column when at least one species has a nonzero pullus count, even when another species has none', () => {
			const stats = [
				makeStat({ species_name: 'Robin', pullus_bird_count: 0 }),
				makeStat({ species_name: 'Wren', pullus_bird_count: 2 })
			];
			render(<SpeciesTotalsTable speciesStats={stats} />);
			expect(getColumnHeaders().map((header) => header.textContent)).toContain(
				'Pulli'
			);
		});
	});

	describe('age-block borders', () => {
		it('draws a thicker left border on Pullus when it is shown', () => {
			const stats = [makeStat({ species_name: 'Robin', pullus_bird_count: 1 })];
			render(<SpeciesTotalsTable speciesStats={stats} />);
			const headers = getColumnHeaders();
			const pullusHeader = headers.find(
				(header) => header.textContent === 'Pulli'
			);
			const juvsHeader = headers.find((header) => header.textContent === 'Juv');
			expect(pullusHeader?.className).toContain('border-l-4');
			expect(juvsHeader?.className).not.toContain('border-l-4');
		});

		it('shifts the thicker left border onto Juvs when Pullus is hidden', () => {
			const stats = [makeStat({ species_name: 'Robin', pullus_bird_count: 0 })];
			render(<SpeciesTotalsTable speciesStats={stats} />);
			const headers = getColumnHeaders();
			const juvsHeader = headers.find((header) => header.textContent === 'Juv');
			expect(juvsHeader?.className).toContain('border-l-4');
		});

		it('draws a thicker right border on the Unknown age column', () => {
			const stats = [makeStat({ species_name: 'Robin' })];
			render(<SpeciesTotalsTable speciesStats={stats} />);
			const headers = getColumnHeaders();
			const unknownAgeHeader = headers.find(
				(header) => header.textContent === 'Not aged'
			);
			expect(unknownAgeHeader?.className).toContain('border-r-4');
		});
	});

	describe('Aggregate by toggle', () => {
		// One bird, one 'N' (new) encounter and one later retrap: bird mode
		// counts it once as Pulli (its age at the 'N' encounter); encounter
		// mode splits its two encounters across Pulli and Adult, so the
		// standard-block columns differ by aggregation mode while the raw
		// bird/encounter counts (session/encounter/individuals) don't.
		const stats = [
			makeStat({
				species_name: 'Robin',
				session_count: 3,
				encounter_count: 5,
				bird_count: 4,
				new_bird_count: 3,
				pullus_bird_count: 1,
				juv_bird_count: 0,
				postjuv_bird_count: 0,
				adult_bird_count: 0,
				unknown_age_bird_count: 0,
				...({
					pullus_enc_count: 1,
					juv_enc_count: 0,
					postjuv_enc_count: 0,
					adult_enc_count: 1,
					unknown_age_enc_count: 0
				} as Partial<StatsCacheBySpeciesResult>)
			})
		];

		it('defaults to bird-based counts and re-renders the standard-block columns from encounter-based data when "Encounter" is clicked', () => {
			render(<SpeciesTotalsTable speciesStats={stats} />);

			expect(getCellTextByHeading('New', 0)).toBe('3');
			expect(getCellTextByHeading('Retrap', 0)).toBe('1'); // bird_count - new
			expect(getCellTextByHeading('Pulli', 0)).toBe('1');
			expect(getCellTextByHeading('Adult', 0)).toBe('0');

			fireEvent.click(screen.getByRole('radio', { name: 'Encounter' }));

			expect(getCellTextByHeading('New', 0)).toBe('3'); // unaffected by toggle
			expect(getCellTextByHeading('Retrap', 0)).toBe('2'); // encounter_count - new
			expect(getCellTextByHeading('Pulli', 0)).toBe('1'); // from pullus_enc_count
			expect(getCellTextByHeading('Adult', 0)).toBe('1'); // from adult_enc_count
		});

		it('leaves the Species/Sessions/Encounters/Birds columns unaffected by the toggle', () => {
			render(<SpeciesTotalsTable speciesStats={stats} />);
			const unaffectedHeadings = [
				'Species',
				'Sessions',
				'Encounters',
				'Birds'
			];
			const before = unaffectedHeadings.map((heading) =>
				getCellTextByHeading(heading, 0)
			);

			fireEvent.click(screen.getByRole('radio', { name: 'Encounter' }));

			const after = unaffectedHeadings.map((heading) =>
				getCellTextByHeading(heading, 0)
			);
			expect(after).toEqual(before);
		});

		it('recomputes Pullus column visibility when toggling to a variant with a different zero-vs-nonzero pullus count', () => {
			const zeroInBirdModeStats = [
				makeStat({
					species_name: 'Robin',
					pullus_bird_count: 0,
					...({ pullus_enc_count: 2 } as Partial<StatsCacheBySpeciesResult>)
				})
			];
			render(<SpeciesTotalsTable speciesStats={zeroInBirdModeStats} />);
			expect(
				getColumnHeaders().map((header) => header.textContent)
			).not.toContain('Pulli');

			fireEvent.click(screen.getByRole('radio', { name: 'Encounter' }));

			expect(getColumnHeaders().map((header) => header.textContent)).toContain(
				'Pulli'
			);
		});
	});

	describe('Counts/Biometrics toggle', () => {
		const BIOMETRIC_HEADINGS = [
			'Max weight (g)',
			'Avg weight (g)',
			'Median weight (g)',
			'Min weight (g)',
			'Max wing (mm)',
			'Avg wing (mm)',
			'Median wing (mm)',
			'Min wing (mm)'
		];
		const AGE_BUCKET_HEADINGS = [
			'New',
			'Retrap',
			'Pulli',
			'Juv',
			'Postjuv',
			'Adult',
			'Not aged'
		];

		const stats = [
			makeStat({
				species_name: 'Robin',
				pullus_bird_count: 1,
				max_weight: 21.37,
				avg_weight: 18.2,
				min_weight: 15.1,
				median_weight: 17.9,
				max_wing: 71,
				avg_wing: 69.4,
				min_wing: 67,
				median_wing: 69
			}),
			makeStat({
				species_name: 'Wren',
				max_weight: null,
				avg_weight: null,
				min_weight: null,
				median_weight: null,
				max_wing: null,
				avg_wing: null,
				min_wing: null,
				median_wing: null
			})
		];

		function switchToBiometricsMode() {
			fireEvent.click(screen.getByRole('radio', { name: 'Biometrics' }));
		}

		it('defaults to counts mode and renders the existing age-bucket column headers', () => {
			render(<SpeciesTotalsTable speciesStats={stats} />);
			const headings = getColumnHeaders().map((header) => header.textContent);
			AGE_BUCKET_HEADINGS.forEach((heading) =>
				expect(headings).toContain(heading)
			);
			BIOMETRIC_HEADINGS.forEach((heading) =>
				expect(headings).not.toContain(heading)
			);
		});

		it('renders the 8 biometric column headers in place of the age-bucket block when switched to biometrics mode', () => {
			render(<SpeciesTotalsTable speciesStats={stats} />);
			switchToBiometricsMode();
			const headings = getColumnHeaders().map((header) => header.textContent);
			BIOMETRIC_HEADINGS.forEach((heading) =>
				expect(headings).toContain(heading)
			);
			AGE_BUCKET_HEADINGS.forEach((heading) =>
				expect(headings).not.toContain(heading)
			);
		});

		it('renders the biometrics-mode columns in full, with each measurement ordered Max, Avg, Median, Min', () => {
			render(<SpeciesTotalsTable speciesStats={stats} />);
			switchToBiometricsMode();
			expect(getColumnHeaders().map((header) => header.textContent)).toEqual([
				'Species',
				'Sessions',
				'Encounters',
				...BIOMETRIC_HEADINGS
			]);
		});

		it('tints the weight columns purple and the wing columns green, graduated from Max down to Min', () => {
			render(<SpeciesTotalsTable speciesStats={stats} />);
			switchToBiometricsMode();
			const headers = getColumnHeaders();
			const headerClassName = (label: string) =>
				headers.find((header) => header.textContent === label)?.className;

			expect(headerClassName('Max weight (g)')).toContain('bg-purple-300');
			expect(headerClassName('Min weight (g)')).toContain('bg-purple-50');
			expect(headerClassName('Max wing (mm)')).toContain('bg-green-300');
			expect(headerClassName('Min wing (mm)')).toContain('bg-green-50');
			// The tint reaches the data cells too, not just the header.
			expect(getCellByHeading('Max weight (g)', 0).className).toContain(
				'bg-purple-300'
			);
		});

		it("renders each row's biometric values from the underlying StatsCacheBySpeciesResult fields in biometrics mode", () => {
			render(<SpeciesTotalsTable speciesStats={stats} />);
			switchToBiometricsMode();
			expect(getCellTextByHeading('Max weight (g)', 0)).toBe('21.4');
			expect(getCellTextByHeading('Avg weight (g)', 0)).toBe('18.2');
			expect(getCellTextByHeading('Min weight (g)', 0)).toBe('15.1');
			expect(getCellTextByHeading('Median weight (g)', 0)).toBe('17.9');
			expect(getCellTextByHeading('Max wing (mm)', 0)).toBe('71');
			expect(getCellTextByHeading('Avg wing (mm)', 0)).toBe('69.4');
			expect(getCellTextByHeading('Min wing (mm)', 0)).toBe('67');
			expect(getCellTextByHeading('Median wing (mm)', 0)).toBe('69');
		});

		it('renders an em dash for a null biometric value in biometrics mode', () => {
			render(<SpeciesTotalsTable speciesStats={stats} />);
			switchToBiometricsMode();
			expect(getCellTextByHeading('Max weight (g)', 1)).toBe('—');
		});

		it('leaves the Species/Sessions/Encounters columns and their values unaffected by switching modes', () => {
			render(<SpeciesTotalsTable speciesStats={stats} />);
			const unaffectedHeadings = ['Species', 'Sessions', 'Encounters'];
			const before = unaffectedHeadings.map((heading) =>
				getCellTextByHeading(heading, 0)
			);

			switchToBiometricsMode();

			const after = unaffectedHeadings.map((heading) =>
				getCellTextByHeading(heading, 0)
			);
			expect(after).toEqual(before);
		});

		it('hides the Busiest session and Birds columns in biometrics mode, since neither is a biometric', () => {
			render(<SpeciesTotalsTable speciesStats={stats} />);
			switchToBiometricsMode();
			const headings = getColumnHeaders().map((header) => header.textContent);
			expect(headings).not.toContain('Busiest session');
			expect(headings).not.toContain('Birds');
		});

		it('restores the Busiest session and Birds columns when toggled back to counts mode', () => {
			render(<SpeciesTotalsTable speciesStats={stats} />);
			switchToBiometricsMode();
			fireEvent.click(screen.getByRole('radio', { name: 'Counts' }));
			const headings = getColumnHeaders().map((header) => header.textContent);
			expect(headings).toContain('Busiest session');
			expect(headings).toContain('Birds');
		});

		it('switches back to the age-bucket block when toggled back to counts mode', () => {
			render(<SpeciesTotalsTable speciesStats={stats} />);
			switchToBiometricsMode();
			fireEvent.click(screen.getByRole('radio', { name: 'Counts' }));
			const headings = getColumnHeaders().map((header) => header.textContent);
			AGE_BUCKET_HEADINGS.forEach((heading) =>
				expect(headings).toContain(heading)
			);
			BIOMETRIC_HEADINGS.forEach((heading) =>
				expect(headings).not.toContain(heading)
			);
		});
	});

	describe('interaction between Counts/Biometrics and Aggregate by toggles', () => {
		const stats = [makeStat({ species_name: 'Robin' })];

		it('disables the Aggregate by toggle while biometrics mode is active', () => {
			render(<SpeciesTotalsTable speciesStats={stats} />);
			fireEvent.click(screen.getByRole('radio', { name: 'Biometrics' }));
			expect(
				screen.getByRole('radio', { name: 'Bird' })
			).toHaveProperty('disabled', true);
			expect(
				screen.getByRole('radio', { name: 'Encounter' })
			).toHaveProperty('disabled', true);
		});

		it('re-enables the Aggregate by toggle when switched back to counts mode', () => {
			render(<SpeciesTotalsTable speciesStats={stats} />);
			fireEvent.click(screen.getByRole('radio', { name: 'Biometrics' }));
			fireEvent.click(screen.getByRole('radio', { name: 'Counts' }));
			expect(
				screen.getByRole('radio', { name: 'Bird' })
			).toHaveProperty('disabled', false);
			expect(
				screen.getByRole('radio', { name: 'Encounter' })
			).toHaveProperty('disabled', false);
		});

		it("preserves the Aggregate by toggle's selected value across a round-trip through biometrics mode", () => {
			render(<SpeciesTotalsTable speciesStats={stats} />);
			fireEvent.click(screen.getByRole('radio', { name: 'Encounter' }));

			fireEvent.click(screen.getByRole('radio', { name: 'Biometrics' }));
			fireEvent.click(screen.getByRole('radio', { name: 'Counts' }));

			expect(
				screen.getByRole('radio', { name: 'Encounter' })
			).toHaveProperty('checked', true);
		});
	});
});
