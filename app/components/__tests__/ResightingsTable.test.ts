import { describe, it, expect } from 'vitest';
import { groupResightingsBySpecies } from '@/app/components/ResightingsTable';
import type { ResightingEncounter } from '@/app/models/session';

function makeResighting(id: number, speciesName: string): ResightingEncounter {
	return {
		id,
		record_type: 'C',
		extra_text: null,
		bird: {
			ring_no: `RING${id}`,
			species: { species_name: speciesName }
		},
		session: {
			visit_date: '2024-01-01',
			location: { location_name: 'Test Site' }
		}
	} as unknown as ResightingEncounter;
}

describe('groupResightingsBySpecies', () => {
	it('puts every resighting into the "All" group', () => {
		const resightings = [
			makeResighting(1, 'Blue Tit'),
			makeResighting(2, 'Robin'),
			makeResighting(3, 'Blue Tit')
		];
		const grouped = groupResightingsBySpecies(resightings);
		expect(grouped.All).toEqual(resightings);
	});

	it('creates one group per distinct species name', () => {
		const resightings = [
			makeResighting(1, 'Blue Tit'),
			makeResighting(2, 'Robin'),
			makeResighting(3, 'Blue Tit')
		];
		const grouped = groupResightingsBySpecies(resightings);
		expect(Object.keys(grouped).sort()).toEqual(
			['All', 'Blue Tit', 'Robin'].sort()
		);
		expect(grouped['Blue Tit']).toEqual([resightings[0], resightings[2]]);
		expect(grouped['Robin']).toEqual([resightings[1]]);
	});

	it('keeps the "All" group even when only one species is present', () => {
		const resightings = [makeResighting(1, 'Blue Tit')];
		const grouped = groupResightingsBySpecies(resightings);
		expect(Object.keys(grouped)).toEqual(['All', 'Blue Tit']);
	});

	it('returns just an empty "All" group when there are no resightings', () => {
		const grouped = groupResightingsBySpecies([]);
		expect(grouped).toEqual({ All: [] });
	});
});
