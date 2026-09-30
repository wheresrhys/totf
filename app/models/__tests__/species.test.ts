import { describe, it, expect } from 'vitest';
import { groupSpeciesByFirstLetter } from '../species';

describe('groupSpeciesByFirstLetter', () => {
	it('returns no groups for an empty species list', () => {
		expect(groupSpeciesByFirstLetter([])).toEqual([]);
	});

	it('groups species sharing a first letter into one entry', () => {
		const groups = groupSpeciesByFirstLetter([
			{ species_name: 'Robin' },
			{ species_name: 'Raven' }
		]);
		expect(groups).toHaveLength(1);
		expect(groups[0].letter).toBe('R');
		expect(groups[0].species.map((s) => s.species_name)).toEqual([
			'Raven',
			'Robin'
		]);
	});

	it('sorts groups alphabetically by letter regardless of input order', () => {
		const groups = groupSpeciesByFirstLetter([
			{ species_name: 'Wren' },
			{ species_name: 'Avocet' },
			{ species_name: 'Moorhen' }
		]);
		expect(groups.map((g) => g.letter)).toEqual(['A', 'M', 'W']);
	});

	it('sorts species within a group alphabetically regardless of input order', () => {
		const groups = groupSpeciesByFirstLetter([
			{ species_name: 'Willow Warbler' },
			{ species_name: 'Wren' },
			{ species_name: 'Whitethroat' }
		]);
		expect(groups[0].species.map((s) => s.species_name)).toEqual([
			'Whitethroat',
			'Willow Warbler',
			'Wren'
		]);
	});

	it('uppercases a lowercase-first-letter species name for grouping', () => {
		const groups = groupSpeciesByFirstLetter([{ species_name: 'robin' }]);
		expect(groups[0].letter).toBe('R');
	});

	it('preserves extra fields on each species row', () => {
		const groups = groupSpeciesByFirstLetter([
			{ id: 7, species_name: 'Robin' }
		]);
		expect(groups[0].species[0]).toEqual({ id: 7, species_name: 'Robin' });
	});
});
