import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Page from '../species/page';

describe('species list page', () => {
	it('renders species data table with Species column', async () => {
		render(await Page());
		const table = await screen.findByRole('table');
		expect(table).toBeDefined();
		const headerCells = table.querySelectorAll('thead th');
		expect(headerCells[0].textContent).toMatch(/Species/);
	});
});
