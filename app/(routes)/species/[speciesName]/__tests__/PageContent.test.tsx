import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { SpeciesHeading, buildSpeciesHeadingText } from '../PageContent';

describe('SpeciesHeading', () => {
	afterEach(() => {
		cleanup();
	});

	describe('Usual: no period', () => {
		it('renders the bare species name with no "All time" link', () => {
			render(<SpeciesHeading speciesName="Robin" />);
			const heading = screen.getByRole('heading', { level: 1 });
			expect(heading.textContent).toBe('Robin');
			expect(screen.queryByRole('link', { name: 'All time' })).toBeNull();
		});
	});

	describe('Structure: year only', () => {
		it('renders "{species} {year}" plus an "All time" link', () => {
			render(<SpeciesHeading speciesName="Robin" year={2026} />);
			const heading = screen.getByRole('heading', { level: 1 });
			expect(heading.textContent).toContain('Robin 2026');
			const link = within(heading).getByRole('link', { name: 'All time' });
			expect(link.getAttribute('href')).toBe('/species/Robin');
		});
	});

	describe('Structure: year + month', () => {
		it('renders "{species} {long month} {year}" plus an "All time" link', () => {
			render(<SpeciesHeading speciesName="Robin" year={2026} month={8} />);
			const heading = screen.getByRole('heading', { level: 1 });
			expect(heading.textContent).toContain('Robin August 2026');
			const link = within(heading).getByRole('link', { name: 'All time' });
			expect(link.getAttribute('href')).toBe('/species/Robin');
		});
	});

	describe('Edge: link href', () => {
		it('always points at the unscoped /species/{name} regardless of period depth', () => {
			const { rerender } = render(
				<SpeciesHeading speciesName="Lesser Redpoll" year={2026} />
			);
			expect(
				screen.getByRole('link', { name: 'All time' }).getAttribute('href')
			).toBe('/species/Lesser Redpoll');
			rerender(
				<SpeciesHeading speciesName="Lesser Redpoll" year={2026} month={3} />
			);
			expect(
				screen.getByRole('link', { name: 'All time' }).getAttribute('href')
			).toBe('/species/Lesser Redpoll');
		});
	});

	describe('buildSpeciesHeadingText', () => {
		it('returns just the name with no period', () => {
			expect(buildSpeciesHeadingText('Robin')).toBe('Robin');
		});
		it('appends the year when only a year is given', () => {
			expect(buildSpeciesHeadingText('Robin', 2026)).toBe('Robin 2026');
		});
		it('appends the long month name and year when both are given', () => {
			expect(buildSpeciesHeadingText('Robin', 2026, 8)).toBe(
				'Robin August 2026'
			);
		});
	});
});
