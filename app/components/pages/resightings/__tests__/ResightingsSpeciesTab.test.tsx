import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ResightingsSpeciesTab } from '../ResightingsSpeciesTab';
import { ALL_RESIGHTINGS_TAB_ID } from '@/app/lib/resightings';
import type { ResightingEncounter } from '@/app/models/session';

function makeResighting(
	ringNo: string,
	speciesName: string
): ResightingEncounter {
	return {
		id: Number(ringNo.replace(/\D/g, '')),
		record_type: 'U',
		extra_text: null,
		finding_condition: null,
		finding_circumstances: null,
		bird: {
			ring_no: ringNo,
			species: { species_name: speciesName }
		},
		visit_date: '2024-01-01',
		location: { location_name: 'Test Site' }
	} as ResightingEncounter;
}

const resightings = [
	makeResighting('RING1', 'Blue Tit'),
	makeResighting('RING2', 'Robin'),
	makeResighting('RING3', 'Blue Tit')
];

function getRingCellTexts(): string[] {
	return [...screen.getByRole('table').querySelectorAll('tbody tr')].map(
		(row) => row.querySelector('td')!.textContent!.trim()
	);
}

describe('ResightingsSpeciesTab', () => {
	afterEach(() => {
		cleanup();
	});

	describe('speciesId is a real species', () => {
		it("renders the resightings table filtered to only that species' resightings", () => {
			render(
				<ResightingsSpeciesTab speciesId="Blue Tit" resightings={resightings} />
			);
			expect(getRingCellTexts().sort()).toEqual(['RING1', 'RING3']);
		});
	});

	describe('speciesId is "All"', () => {
		it('renders the resightings table with the full, unfiltered data', () => {
			render(
				<ResightingsSpeciesTab
					speciesId={ALL_RESIGHTINGS_TAB_ID}
					resightings={resightings}
				/>
			);
			expect(getRingCellTexts().sort()).toEqual(['RING1', 'RING2', 'RING3']);
		});
	});
});
