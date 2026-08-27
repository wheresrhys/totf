import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SpeciesTotalsTable } from '../SpeciesTotalsTable';
import speciesDataSnapshot from '@/test-fixtures/snapshots/fetchSpeciesData.alpha.json';
import type { AggregateStatsResult } from '@/app/models/db';

const speciesStats = speciesDataSnapshot as unknown as AggregateStatsResult[];

function makeStat(
	overrides: Partial<AggregateStatsResult> & { species_name: string }
): AggregateStatsResult {
	return {
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
		it('renders eleven column headers in the expected order', () => {
			render(<SpeciesTotalsTable speciesStats={speciesStats} />);
			const headers = screen.getAllByRole('columnheader');
			expect(headers.map((header) => header.textContent)).toEqual([
				'Species',
				'Encounters',
				'Individuals',
				'New',
				'Retraps',
				'Pullus',
				'Juvs',
				'Postjuv',
				'Adults',
				'Unknown age',
				'New young'
			]);
		});
	});

	describe('rows', () => {
		it('renders one row per species with all eleven columns in the correct order', () => {
			render(<SpeciesTotalsTable speciesStats={speciesStats} />);
			const rows = document.querySelectorAll('tbody tr');
			expect(rows.length).toBe(speciesStats.length);

			const firstStat = speciesStats[0];
			const firstRowCells = rows[0].querySelectorAll('td');
			expect(
				Array.from(firstRowCells).map((cell) => cell.textContent?.trim())
			).toEqual([
				firstStat.species_name,
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

	describe('column styling', () => {
		it('applies a distinct background colour to each of the New/Retraps/Pullus/Juvs/Postjuv/Adults/Unknown age columns, on header and cells alike', () => {
			const stats = [makeStat({ species_name: 'Robin', pullus_count: 1 })];
			render(<SpeciesTotalsTable speciesStats={stats} />);
			const headers = screen.getAllByRole('columnheader');
			const cells = screen.getAllByRole('cell');

			const columnStyle = (label: string) => {
				const index = headers.findIndex(
					(header) => header.textContent === label
				);
				return { header: headers[index], cell: cells[index] };
			};

			const expectations: [string, string][] = [
				['New', 'bg-green-50'],
				['Retraps', 'bg-amber-50'],
				['Pullus', 'bg-cyan-50'],
				['Juvs', 'bg-sky-50'],
				['Postjuv', 'bg-blue-50'],
				['Adults', 'bg-purple-50'],
				['Unknown age', 'bg-taupe-50']
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

	describe('Pullus column visibility', () => {
		it('omits the Pullus column when no species in the dataset has a nonzero pullus count', () => {
			const stats = [
				makeStat({ species_name: 'Robin', pullus_count: 0 }),
				makeStat({ species_name: 'Wren', pullus_count: 0 })
			];
			render(<SpeciesTotalsTable speciesStats={stats} />);
			expect(
				screen.getAllByRole('columnheader').map((header) => header.textContent)
			).not.toContain('Pullus');
		});

		it('shows the Pullus column when at least one species has a nonzero pullus count, even when another species has none', () => {
			const stats = [
				makeStat({ species_name: 'Robin', pullus_count: 0 }),
				makeStat({ species_name: 'Wren', pullus_count: 2 })
			];
			render(<SpeciesTotalsTable speciesStats={stats} />);
			expect(
				screen.getAllByRole('columnheader').map((header) => header.textContent)
			).toContain('Pullus');
		});
	});

	describe('age-block borders', () => {
		it('draws a thicker left border on Pullus when it is shown', () => {
			const stats = [makeStat({ species_name: 'Robin', pullus_count: 1 })];
			render(<SpeciesTotalsTable speciesStats={stats} />);
			const headers = screen.getAllByRole('columnheader');
			const pullusHeader = headers.find(
				(header) => header.textContent === 'Pullus'
			);
			const juvsHeader = headers.find(
				(header) => header.textContent === 'Juvs'
			);
			expect(pullusHeader?.className).toContain('border-l-4');
			expect(juvsHeader?.className).not.toContain('border-l-4');
		});

		it('shifts the thicker left border onto Juvs when Pullus is hidden', () => {
			const stats = [makeStat({ species_name: 'Robin', pullus_count: 0 })];
			render(<SpeciesTotalsTable speciesStats={stats} />);
			const headers = screen.getAllByRole('columnheader');
			const juvsHeader = headers.find(
				(header) => header.textContent === 'Juvs'
			);
			expect(juvsHeader?.className).toContain('border-l-4');
		});

		it('draws a thicker right border on the Unknown age column', () => {
			const stats = [makeStat({ species_name: 'Robin' })];
			render(<SpeciesTotalsTable speciesStats={stats} />);
			const headers = screen.getAllByRole('columnheader');
			const unknownAgeHeader = headers.find(
				(header) => header.textContent === 'Unknown age'
			);
			expect(unknownAgeHeader?.className).toContain('border-r-4');
		});
	});
});
