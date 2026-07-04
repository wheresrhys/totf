import { expect, describe, it } from 'vitest';
import {
	render,
	screen,
	getByRole,
	getAllByRole
} from '@testing-library/react';
import Page from '../page';

describe('home page', () => {
	it('should show stats accordions', async () => {
		render(await Page());
		const accordionGroups = await screen.findAllByTestId(
			'stats-accordion-group'
		);
		accordionGroups.map((accordionGroup) => {
			const heading = getByRole(accordionGroup, 'heading', {
				level: 2
			});
			expect(heading.textContent).toMatch(/[a-z ]+:/i);
			const accordionWrapper = accordionGroup.querySelector(
				':scope > ul, :scope > ol'
			);

			getAllByRole(accordionGroup, 'button')
				.filter((button) => {
					const closestListItem = button.closest('li');
					return (
						closestListItem &&
						closestListItem.parentElement === accordionWrapper
					);
				})
				.forEach((button) => {
					expect(button.textContent).toMatch(
						/^[a-z ]+: (No data available|[0-9]+ [a-z]+)$/i
					);
				});
		});
	});
});
