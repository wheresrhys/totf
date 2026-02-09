import { expect, describe, it, beforeEach } from 'vitest';
import {
	render,
	screen,
	getByRole,
	getAllByRole,
	fireEvent
} from '@testing-library/react';
import { mockPush } from '../../../vitest.setup';
import Page from '../page';

describe('home page', () => {
	beforeEach(() => {
		// Clear mock calls before each test
		mockPush.mockClear();
	});
	// it('should have an actionable ring search form', async () => {
	// 	render(await Page());
	// 	const ringSearchForm = await screen.findByRole('form');
	// 	const ringSearchInput = getByRole(ringSearchForm, 'textbox', {
	// 		name: 'ring number'
	// 	});
	// 	expect(ringSearchInput).toBeDefined();
	// 	const ringSearchButton = getByRole(ringSearchForm, 'button', {
	// 		name: 'Search'
	// 	});
	// 	expect(ringSearchButton).toBeDefined();
	// 	fireEvent.change(ringSearchInput, { target: { value: 'R12345' } });
	// 	fireEvent.click(ringSearchButton);
	// 	expect(ringSearchInput.value).toBe('R12345');
	// 	expect(ringSearchButton.textContent).toBe('Search');
	// 	expect(mockPush).toHaveBeenCalledWith('/bird/R12345');
	// });
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
					expect(button.textContent).toMatch(/^[a-z ]+: [0-9]+ [a-z]+$/i);
				});
		});
	});
});
