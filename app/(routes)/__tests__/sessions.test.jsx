import { expect, describe, it } from 'vitest';
import {
	render,
	screen,
	getByTestId,
	getAllByRole
} from '@testing-library/react';
import Page from '../sessions/page';

describe('session list page', () => {
	it('should show correct heading and subheadings', async () => {
		render(await Page());
		const heading = await screen.findByRole('heading', {
			level: 1
		});
		expect(heading.textContent).toBe('Session history');
		const subheadings = await screen.findAllByRole('heading', {
			level: 2
		});
		subheadings.map((heading, index) => {
			expect(heading.textContent).toMatch(/\d{4}/);
			if (index > 0) {
				expect(heading.textContent).toBe(
					String(Number(subheadings[index - 1].textContent) - 1)
				);
			}
		});
	});
	it('first session list accordion should be expanded by default', async () => {
		render(await Page());
		const accordionGroups = await screen.findAllByTestId('year-accordion-item');
		expect(accordionGroups).toHaveLength(4);
		const firstYearAccordionItem = accordionGroups[0];
		const firstYearAccordionItemButton = getAllByRole(
			firstYearAccordionItem,
			'button'
		)[0];
		expect(firstYearAccordionItemButton.getAttribute('aria-expanded')).toBe(
			'true'
		);
		const secondYearAccordionItem = accordionGroups[1];
		const secondYearAccordionItemButton = getAllByRole(
			secondYearAccordionItem,
			'button'
		)[0];
		expect(secondYearAccordionItemButton.getAttribute('aria-expanded')).toBe(
			'false'
		);
		accordionGroups.map((accordionGroup) => {
			const accordionWrapper = getByTestId(accordionGroup, 'months-of-year');
			expect(accordionWrapper).toBeDefined();
			getAllByRole(accordionWrapper, 'button')
				.filter((button) => {
					const closestListItem = button.closest('li');
					return (
						closestListItem &&
						closestListItem.parentElement === accordionWrapper
					);
				})
				.forEach((button) => {
					expect(button.textContent).toMatch(
						/^[a-z]+: \d+ sessions, \d+ birds$/i
					);
				});
		});
	});
});
