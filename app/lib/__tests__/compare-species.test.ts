import { describe, it, expect } from 'vitest';
import {
	buildSpeciesComparisonQuery,
	listAvailableSpecies,
	parseSelectedSpeciesParam,
	selectComparisonRows,
	toggleSpeciesSelection
} from '../compare-species';

type StubDatasetRow = { species_name: string; bird_count: number };

function datasetRow(speciesName: string, birdCount: number): StubDatasetRow {
	return { species_name: speciesName, bird_count: birdCount };
}

describe('reading the selection off the URL', () => {
	it('returns an empty selection when no name param is present', () => {
		expect(parseSelectedSpeciesParam(undefined)).toEqual([]);
	});

	it('wraps a single name value in a list', () => {
		expect(parseSelectedSpeciesParam('Robin')).toEqual(['Robin']);
	});

	it('keeps repeated name values in URL order', () => {
		expect(parseSelectedSpeciesParam(['Wren', 'Robin', 'Blue Tit'])).toEqual([
			'Wren',
			'Robin',
			'Blue Tit'
		]);
	});

	it('drops duplicate and empty name values', () => {
		expect(parseSelectedSpeciesParam(['Robin', '', 'Robin', 'Wren'])).toEqual([
			'Robin',
			'Wren'
		]);
	});
});

describe('writing the selection back to the URL', () => {
	it('emits one name param per selected species, in selection order', () => {
		expect(buildSpeciesComparisonQuery(['Wren', 'Robin'])).toBe(
			'name=Wren&name=Robin'
		);
	});

	it('returns an empty string for an empty selection', () => {
		expect(buildSpeciesComparisonQuery([])).toBe('');
	});

	it('round-trips species names containing spaces', () => {
		const selection = ['Blue Tit', 'Reed Warbler'];
		const query = buildSpeciesComparisonQuery(selection);

		expect(
			parseSelectedSpeciesParam(new URLSearchParams(query).getAll('name'))
		).toEqual(selection);
	});
});

describe('toggling a species in and out of the selection', () => {
	it('appends a species that is not yet selected', () => {
		expect(toggleSpeciesSelection(['Robin'], 'Wren')).toEqual([
			'Robin',
			'Wren'
		]);
	});

	it('removes an already-selected species, leaving the rest in order', () => {
		expect(
			toggleSpeciesSelection(['Robin', 'Wren', 'Blue Tit'], 'Wren')
		).toEqual(['Robin', 'Blue Tit']);
	});
});

describe('listing the species available to compare', () => {
	it('lists every species in the core stats rows alphabetically', () => {
		expect(
			listAvailableSpecies([
				datasetRow('Wren', 3),
				datasetRow('Blue Tit', 6),
				datasetRow('Robin', 4)
			])
		).toEqual(['Blue Tit', 'Robin', 'Wren']);
	});

	it('de-duplicates repeated species names', () => {
		expect(
			listAvailableSpecies([datasetRow('Robin', 4), datasetRow('Robin', 9)])
		).toEqual(['Robin']);
	});
});

describe('projecting a dataset onto the selection', () => {
	const datasetRows = [
		datasetRow('Blue Tit', 6),
		datasetRow('Robin', 4),
		datasetRow('Wren', 3)
	];

	it('returns one row per selected species, in selection order', () => {
		expect(selectComparisonRows(datasetRows, ['Wren', 'Blue Tit'])).toEqual([
			datasetRow('Wren', 3),
			datasetRow('Blue Tit', 6)
		]);
	});

	it('substitutes a species-name-only row when the dataset has no row for that species', () => {
		expect(selectComparisonRows(datasetRows, ['Kingfisher'])).toEqual([
			{ species_name: 'Kingfisher' }
		]);
	});

	it('returns nothing for an empty selection', () => {
		expect(selectComparisonRows(datasetRows, [])).toEqual([]);
	});
});
