import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SpeciesTotalsTable } from '../SpeciesTotalsTable';
import speciesDataSnapshot from '@/test-fixtures/snapshots/fetchSpeciesData.alpha.json';
import type { AggregateStatsResult } from '@/app/models/db';

const speciesStats = speciesDataSnapshot as unknown as AggregateStatsResult[];

describe('SpeciesTotalsTable', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders one row per species with all eleven columns in the correct order', () => {
		render(<SpeciesTotalsTable speciesStats={speciesStats} />);
		const rows = document.querySelectorAll('tbody tr');
		expect(rows.length).toBe(speciesStats.length);

		const firstStat = speciesStats[0];
		const firstRowCells = rows[0].querySelectorAll('td');
		expect(Array.from(firstRowCells).map((cell) => cell.textContent)).toEqual([
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

	it('renders column headers: Species, Encounters, Individuals, New, Retraps, Pullus, Juvs, Postjuv, Adults, Unknown age, New young', () => {
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

	it('renders without crashing and shows no data rows when speciesStats is empty', () => {
		render(<SpeciesTotalsTable speciesStats={[]} />);
		expect(document.querySelectorAll('tbody tr').length).toBe(0);
	});
});
