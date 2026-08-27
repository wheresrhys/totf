import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SpeciesTotalsTable } from '../SpeciesTotalsTable';
import speciesDataSnapshot from '@/test-fixtures/snapshots/fetchSpeciesData.alpha.json';
import type { AggregateStatsResult } from '@/app/models/db';

const speciesStats = speciesDataSnapshot as unknown as AggregateStatsResult[];

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
	overrides: Partial<AggregateStatsResult> & { species_name: string }
): AggregateStatsResult {
	return {
		session_count: 0,
		encounter_count: 0,
		bird_count: 0,
		new_bird_count: 0,
		pullus_count: 0,
		juv_count: 0,
		postjuv_count: 0,
		adult_count: 0,
		unknown_age_count: 0,
		new_young_count: 0,
		...overrides
	} as unknown as AggregateStatsResult;
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
				'Individuals',
				'New',
				'Retrap',
				'Pulli',
				'Juv',
				'Postjuv',
				'Adult',
				'Not aged',
				'New young'
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
				String(firstStat.bird_count),
				String(firstStat.new_bird_count),
				String(firstStat.bird_count - firstStat.new_bird_count),
				String(firstStat.pullus_count),
				String(firstStat.juv_count),
				String(firstStat.postjuv_count),
				String(firstStat.adult_count),
				String(firstStat.unknown_age_count),
				String(firstStat.new_young_count)
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
			const statsWithIndividuals = [
				makeStat({ species_name: 'Robin', encounter_count: 5, bird_count: 1 }),
				makeStat({ species_name: 'Wren', encounter_count: 12, bird_count: 9 }),
				makeStat({
					species_name: 'Blue Tit',
					encounter_count: 3,
					bird_count: 4
				})
			];
			render(<SpeciesTotalsTable speciesStats={statsWithIndividuals} />);
			fireEvent.click(screen.getByText('Encounters'));
			fireEvent.click(screen.getByText('Individuals'));
			const rows = document.querySelectorAll('tbody tr');
			// descending by Individuals: Wren (9), Blue Tit (4), Robin (1)
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
			const rows = document.querySelectorAll('tbody tr');
			const cells = rows[0].querySelectorAll('td');
			// cells[0] is the species-name link cell; Sessions is the next column.
			expect(cells[1].textContent?.trim()).toBe('0');
		});
	});

	describe('column styling', () => {
		it('applies a distinct background colour to each of the New/Retraps/Pullus/Juvs/Postjuv/Adults/Unknown age columns, on header and cells alike', () => {
			const stats = [makeStat({ species_name: 'Robin', pullus_count: 1 })];
			render(<SpeciesTotalsTable speciesStats={stats} />);
			const headers = getColumnHeaders();
			const cells = screen.getAllByRole('cell');

			const columnStyle = (label: string) => {
				const index = headers.findIndex(
					(header) => header.textContent === label
				);
				return { header: headers[index], cell: cells[index] };
			};

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
				expect(header.className).toContain(className);
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
				bird_count: 4,
				new_bird_count: 3,
				pullus_count: 1,
				juv_count: 1,
				postjuv_count: 0,
				adult_count: 2,
				unknown_age_count: 0,
				new_young_count: 1
			}),
			makeStat({
				species_name: 'Wren',
				session_count: 2,
				encounter_count: 7,
				bird_count: 6,
				new_bird_count: 4,
				pullus_count: 0,
				juv_count: 2,
				postjuv_count: 1,
				adult_count: 3,
				unknown_age_count: 0,
				new_young_count: 2
			})
		];
		const totalsStats = makeStat({
			species_name: 'All species',
			session_count: 4,
			encounter_count: 12,
			bird_count: 10,
			new_bird_count: 7,
			pullus_count: 1,
			juv_count: 3,
			postjuv_count: 1,
			adult_count: 5,
			unknown_age_count: 0,
			new_young_count: 3
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
					String(totalsStats.bird_count),
					String(totalsStats.new_bird_count),
					String(totalsStats.bird_count - totalsStats.new_bird_count),
					String(totalsStats.pullus_count),
					String(totalsStats.juv_count),
					String(totalsStats.postjuv_count),
					String(totalsStats.adult_count),
					String(totalsStats.unknown_age_count),
					String(totalsStats.new_young_count)
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
				makeStat({ species_name: 'Robin', pullus_count: 0 }),
				makeStat({ species_name: 'Wren', pullus_count: 0 })
			];
			render(<SpeciesTotalsTable speciesStats={stats} />);
			expect(
				getColumnHeaders().map((header) => header.textContent)
			).not.toContain('Pullus');
		});

		it('shows the Pullus column when at least one species has a nonzero pullus count, even when another species has none', () => {
			const stats = [
				makeStat({ species_name: 'Robin', pullus_count: 0 }),
				makeStat({ species_name: 'Wren', pullus_count: 2 })
			];
			render(<SpeciesTotalsTable speciesStats={stats} />);
			expect(getColumnHeaders().map((header) => header.textContent)).toContain(
				'Pulli'
			);
		});
	});

	describe('age-block borders', () => {
		it('draws a thicker left border on Pullus when it is shown', () => {
			const stats = [makeStat({ species_name: 'Robin', pullus_count: 1 })];
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
			const stats = [makeStat({ species_name: 'Robin', pullus_count: 0 })];
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
				pullus_count: 1,
				juv_count: 0,
				postjuv_count: 0,
				adult_count: 0,
				unknown_age_count: 0,
				new_young_count: 1,
				...({
					pullus_enc_count: 1,
					juv_enc_count: 0,
					postjuv_enc_count: 0,
					adult_enc_count: 1,
					unknown_age_enc_count: 0
				} as Partial<AggregateStatsResult>)
			})
		];

		function getRowCells(): HTMLTableCellElement[] {
			return Array.from(
				document.querySelector('tbody tr')?.querySelectorAll('td') ?? []
			) as HTMLTableCellElement[];
		}

		it('defaults to bird-based counts and re-renders the standard-block columns from encounter-based data when "Encounter" is clicked', () => {
			render(<SpeciesTotalsTable speciesStats={stats} />);

			// Column order: Species, Sessions, Encounters, Individuals, New,
			// Retrap, Pulli, Juv, Postjuv, Adult, Not aged, New young.
			let cells = getRowCells();
			expect(cells[4].textContent).toBe('3'); // New
			expect(cells[5].textContent).toBe('1'); // Retrap: bird_count - new
			expect(cells[6].textContent).toBe('1'); // Pulli
			expect(cells[9].textContent).toBe('0'); // Adult

			fireEvent.click(screen.getByRole('radio', { name: 'Encounter' }));

			cells = getRowCells();
			expect(cells[4].textContent).toBe('3'); // New (unaffected by toggle)
			expect(cells[5].textContent).toBe('2'); // Retrap: encounter_count - new
			expect(cells[6].textContent).toBe('1'); // Pulli (from pullus_enc_count)
			expect(cells[9].textContent).toBe('1'); // Adult (from adult_enc_count)
		});

		it('leaves the Species/Sessions/Encounters/Individuals columns unaffected by the toggle', () => {
			render(<SpeciesTotalsTable speciesStats={stats} />);
			const cellsBefore = getRowCells();
			const unaffected = [0, 1, 2, 3].map(
				(index) => cellsBefore[index].textContent
			);

			fireEvent.click(screen.getByRole('radio', { name: 'Encounter' }));

			const cellsAfter = getRowCells();
			expect(
				[0, 1, 2, 3].map((index) => cellsAfter[index].textContent)
			).toEqual(unaffected);
		});

		it('recomputes Pullus column visibility when toggling to a variant with a different zero-vs-nonzero pullus count', () => {
			const zeroInBirdModeStats = [
				makeStat({
					species_name: 'Robin',
					pullus_count: 0,
					...({ pullus_enc_count: 2 } as Partial<AggregateStatsResult>)
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
});
