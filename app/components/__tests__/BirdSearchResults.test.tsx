import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { BirdSearchResults } from '../BirdSearchResults';
import type { SearchResult } from '../BirdSearchResults';

afterEach(cleanup);

const singleSpeciesResults: SearchResult[] = [
	{ ring_no: 'ABC123', species_name: 'Robin', closeness_score: 0.9 },
	{ ring_no: 'ABC456', species_name: 'Robin', closeness_score: 0.7 }
];

const multiSpeciesResults: SearchResult[] = [
	{ ring_no: 'ABC123', species_name: 'Robin', closeness_score: 0.9 },
	{ ring_no: 'ABC456', species_name: 'Blue Tit', closeness_score: 0.7 },
	{ ring_no: 'ABC789', species_name: 'Robin', closeness_score: 0.6 }
];

describe('BirdSearchResults', () => {
	describe('with single species results', () => {
		it('does not render species filter select', () => {
			render(
				<BirdSearchResults params={{ q: 'ABC' }} data={singleSpeciesResults} />
			);
			expect(
				screen.queryByRole('combobox', { name: /filter by species/i })
			).toBeNull();
		});

		it('renders all results', () => {
			render(
				<BirdSearchResults params={{ q: 'ABC' }} data={singleSpeciesResults} />
			);
			const list = screen.getByRole('list');
			expect(list.querySelectorAll('li').length).toBe(2);
		});
	});

	describe('with multiple species results', () => {
		it('renders species filter select with "All species" and one option per species', () => {
			render(
				<BirdSearchResults params={{ q: 'ABC' }} data={multiSpeciesResults} />
			);
			const select = screen.getByRole('combobox', {
				name: /filter by species/i
			});
			const options = Array.from(select.querySelectorAll('option'));
			expect(options.map((o) => o.value)).toEqual(['all', 'Blue Tit', 'Robin']);
		});

		it('shows all results when "All species" selected (default)', () => {
			render(
				<BirdSearchResults params={{ q: 'ABC' }} data={multiSpeciesResults} />
			);
			const list = screen.getByRole('list');
			expect(list.querySelectorAll('li').length).toBe(3);
		});

		it('filters results when a species is selected', () => {
			render(
				<BirdSearchResults params={{ q: 'ABC' }} data={multiSpeciesResults} />
			);
			const select = screen.getByRole('combobox', {
				name: /filter by species/i
			});
			fireEvent.change(select, { target: { value: 'Blue Tit' } });
			const list = screen.getByRole('list');
			const items = list.querySelectorAll('li');
			expect(items.length).toBe(1);
			expect(items[0].textContent).toContain('ABC456');
		});
	});
});
