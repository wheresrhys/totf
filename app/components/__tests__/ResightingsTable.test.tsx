import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
	groupResightingsBySpecies,
	getDistinctFieldValues,
	ResightingsTable
} from '@/app/components/ResightingsTable';
import type { ResightingEncounter } from '@/app/models/session';

afterEach(cleanup);

function makeResighting(
	id: number,
	speciesName: string,
	overrides: {
		finding_condition?: string | null;
		finding_circumstances?: string | null;
	} = {}
): ResightingEncounter {
	return {
		id,
		record_type: 'C',
		extra_text: null,
		finding_condition: overrides.finding_condition ?? null,
		finding_circumstances: overrides.finding_circumstances ?? null,
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

describe('getDistinctFieldValues', () => {
	it('returns the distinct finding_condition values present, sorted, excluding nulls', () => {
		const resightings = [
			makeResighting(1, 'Blue Tit', { finding_condition: '28' }),
			makeResighting(2, 'Robin', { finding_condition: '08' }),
			makeResighting(3, 'Blue Tit', { finding_condition: '28' }),
			makeResighting(4, 'Wren', { finding_condition: null })
		];
		expect(getDistinctFieldValues(resightings, 'finding_condition')).toEqual([
			'08',
			'28'
		]);
	});

	it('returns an empty array when no rows have a finding_circumstances value', () => {
		const resightings = [makeResighting(1, 'Blue Tit')];
		expect(
			getDistinctFieldValues(resightings, 'finding_circumstances')
		).toEqual([]);
	});
});

describe('ResightingsTable', () => {
	function getBodyRows() {
		return screen.getByRole('table').querySelectorAll('tbody tr');
	}

	describe('condition and circumstances filters', () => {
		const resightings = [
			makeResighting(1, 'Blue Tit', {
				finding_condition: '08',
				finding_circumstances: '10'
			}),
			makeResighting(2, 'Robin', {
				finding_condition: '28',
				finding_circumstances: '10'
			}),
			makeResighting(3, 'Blue Tit', {
				finding_condition: null,
				finding_circumstances: null
			})
		];

		it('shows every row when both filters are "All" (default)', () => {
			render(<ResightingsTable resightings={resightings} />);
			expect(getBodyRows().length).toBe(3);
		});

		it('condition select options are exactly the distinct finding_condition values, plus "All"', () => {
			render(<ResightingsTable resightings={resightings} />);
			const select = screen.getByRole('combobox', { name: 'Condition' });
			const options = Array.from(select.querySelectorAll('option')).map(
				(option) => option.value
			);
			expect(options).toEqual(['All', '08', '28']);
		});

		it('circumstances select options are exactly the distinct finding_circumstances values, plus "All"', () => {
			render(<ResightingsTable resightings={resightings} />);
			const select = screen.getByRole('combobox', { name: 'Circumstances' });
			const options = Array.from(select.querySelectorAll('option')).map(
				(option) => option.value
			);
			expect(options).toEqual(['All', '10']);
		});

		it('filtering by a specific condition code shows only rows with that exact finding_condition value', () => {
			render(<ResightingsTable resightings={resightings} />);
			const select = screen.getByRole('combobox', { name: 'Condition' });
			fireEvent.change(select, { target: { value: '08' } });
			const rows = getBodyRows();
			expect(rows.length).toBe(1);
			expect(rows[0].textContent).toContain('RING1');
		});

		it('filtering by a specific circumstances code shows only rows with that exact finding_circumstances value', () => {
			render(<ResightingsTable resightings={resightings} />);
			const select = screen.getByRole('combobox', { name: 'Circumstances' });
			fireEvent.change(select, { target: { value: '10' } });
			const rows = getBodyRows();
			expect(rows.length).toBe(2);
		});

		it('hides a row with a null finding_condition once a specific condition code is selected, and reinstates it when reset to "All"', () => {
			render(<ResightingsTable resightings={resightings} />);
			const select = screen.getByRole('combobox', { name: 'Condition' });

			fireEvent.change(select, { target: { value: '08' } });
			expect(
				Array.from(getBodyRows()).some((row) =>
					row.textContent?.includes('RING3')
				)
			).toBe(false);

			fireEvent.change(select, { target: { value: 'All' } });
			expect(
				Array.from(getBodyRows()).some((row) =>
					row.textContent?.includes('RING3')
				)
			).toBe(true);
		});

		it('hides a row with a null finding_circumstances once a specific circumstances code is selected, and reinstates it when reset to "All"', () => {
			render(<ResightingsTable resightings={resightings} />);
			const select = screen.getByRole('combobox', { name: 'Circumstances' });

			fireEvent.change(select, { target: { value: '10' } });
			expect(
				Array.from(getBodyRows()).some((row) =>
					row.textContent?.includes('RING3')
				)
			).toBe(false);

			fireEvent.change(select, { target: { value: 'All' } });
			expect(
				Array.from(getBodyRows()).some((row) =>
					row.textContent?.includes('RING3')
				)
			).toBe(true);
		});

		it('combines the condition filter, circumstances filter and active species tab with AND semantics', () => {
			render(<ResightingsTable resightings={resightings} />);

			fireEvent.click(screen.getByRole('button', { name: 'Blue Tit' }));
			fireEvent.change(screen.getByRole('combobox', { name: 'Condition' }), {
				target: { value: '08' }
			});
			fireEvent.change(
				screen.getByRole('combobox', { name: 'Circumstances' }),
				{ target: { value: '10' } }
			);

			const rows = getBodyRows();
			expect(rows.length).toBe(1);
			expect(rows[0].textContent).toContain('RING1');
		});
	});

	describe('when no rows have a finding_condition/finding_circumstances value at all', () => {
		const resightings = [
			makeResighting(1, 'Blue Tit'),
			makeResighting(2, 'Robin')
		];

		it('renders only the "All" option for both filters', () => {
			render(<ResightingsTable resightings={resightings} />);
			const conditionOptions = Array.from(
				screen
					.getByRole('combobox', { name: 'Condition' })
					.querySelectorAll('option')
			).map((option) => option.value);
			const circumstancesOptions = Array.from(
				screen
					.getByRole('combobox', { name: 'Circumstances' })
					.querySelectorAll('option')
			).map((option) => option.value);

			expect(conditionOptions).toEqual(['All']);
			expect(circumstancesOptions).toEqual(['All']);
		});

		it('shows every row', () => {
			render(<ResightingsTable resightings={resightings} />);
			expect(getBodyRows().length).toBe(2);
		});
	});
});
