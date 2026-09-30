import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SpeciesAlphabetNav } from '../SpeciesAlphabetNav';
import type { SpeciesWithBirdsCount } from '@/app/models/species';

const species: SpeciesWithBirdsCount[] = [
	{ id: 1, species_name: 'Robin', birds: [{ count: 3 }] },
	{ id: 2, species_name: 'Raven', birds: [{ count: 1 }] },
	{ id: 3, species_name: 'Wren', birds: [{ count: 2 }] }
];

describe('SpeciesAlphabetNav', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders one letter button per unique first letter among the species', () => {
		render(<SpeciesAlphabetNav species={species} />);
		expect(
			screen.getByRole('button', { name: 'Show species starting with R' })
		).toBeDefined();
		expect(
			screen.getByRole('button', { name: 'Show species starting with W' })
		).toBeDefined();
		expect(screen.getAllByRole('button')).toHaveLength(2);
	});

	describe('with no species', () => {
		it('renders no letter buttons', () => {
			render(<SpeciesAlphabetNav species={[]} />);
			expect(screen.queryAllByRole('button')).toHaveLength(0);
		});
	});

	it('shows no species links before any letter is tapped', () => {
		render(<SpeciesAlphabetNav species={species} />);
		expect(screen.queryByRole('region')).toBeNull();
		expect(screen.queryByRole('link')).toBeNull();
	});

	describe('after tapping a letter button', () => {
		it('shows a link to each species page starting with that letter, sorted alphabetically', () => {
			render(<SpeciesAlphabetNav species={species} />);
			fireEvent.click(
				screen.getByRole('button', { name: 'Show species starting with R' })
			);
			const region = screen.getByRole('region', {
				name: 'Species starting with R'
			});
			const links = screen.getAllByRole('link');
			expect(links.map((link) => link.textContent?.trim())).toEqual([
				'Raven',
				'Robin'
			]);
			expect(links[0].getAttribute('href')).toBe('/species/Raven');
			expect(region.contains(links[0])).toBe(true);
		});

		it('does not show species starting with a different letter', () => {
			render(<SpeciesAlphabetNav species={species} />);
			fireEvent.click(
				screen.getByRole('button', { name: 'Show species starting with R' })
			);
			expect(screen.queryByText('Wren')).toBeNull();
		});

		it('marks the tapped button as expanded', () => {
			render(<SpeciesAlphabetNav species={species} />);
			const button = screen.getByRole('button', {
				name: 'Show species starting with R'
			});
			fireEvent.click(button);
			expect(button.getAttribute('aria-expanded')).toBe('true');
		});
	});

	describe('tapping the same letter button again', () => {
		it('collapses the panel', () => {
			render(<SpeciesAlphabetNav species={species} />);
			const button = screen.getByRole('button', {
				name: 'Show species starting with R'
			});
			fireEvent.click(button);
			fireEvent.click(button);
			expect(screen.queryByRole('region')).toBeNull();
			expect(button.getAttribute('aria-expanded')).toBe('false');
		});
	});

	describe('tapping a different letter button while one is expanded', () => {
		it('switches the panel to the newly tapped letter', () => {
			render(<SpeciesAlphabetNav species={species} />);
			fireEvent.click(
				screen.getByRole('button', { name: 'Show species starting with R' })
			);
			fireEvent.click(
				screen.getByRole('button', { name: 'Show species starting with W' })
			);
			const links = screen.getAllByRole('link');
			expect(links.map((link) => link.textContent?.trim())).toEqual(['Wren']);
		});
	});
});
