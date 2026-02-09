import { expect, describe, it } from 'vitest';
import { render, screen, getAllByRole } from '@testing-library/react';
import Page from '../bird/[ring]/page';
import { verifyTableData } from './helpers/verify-table-data';

describe('bird page', () => {
	it('should show correct heading', async () => {
		render(
			await Page({
				params: new Promise((resolve) => resolve({ ring: 'BVB4353' }))
			})
		);
		const heading = await screen.findByRole('heading', {
			level: 1
		});
		expect(heading.textContent).toBe(" Cetti's Warbler  BVB4353");
	});
	it('should show headline stats', async () => {
		render(
			await Page({
				params: new Promise((resolve) => resolve({ ring: 'BVB4353' }))
			})
		);
		const headlineStats = await screen.findByTestId('bird-stats');
		const statsLineItems = getAllByRole(headlineStats, 'listitem');
		expect(statsLineItems).toHaveLength(5);
		expect(statsLineItems[0].textContent).toBe('3 encounters');
		expect(statsLineItems[1].textContent).toBe('First: 09 November 2025');
		expect(statsLineItems[2].textContent).toBe('Last: 14 January 2026');
		expect(statsLineItems[3].textContent).toBe('Sex: F');
		expect(statsLineItems[4].textContent).toBe('Proven Age: 1');
	});
	it('should show table of every encounter', async () => {
		render(
			await Page({
				params: new Promise((resolve) => resolve({ ring: 'BVB4353' }))
			})
		);
		const encounterTable = await screen.findByTestId('single-bird-table');
		verifyTableData(encounterTable, [
			['Date', 'Time', 'Age', 'Sex', 'Wing', 'Weight'],
			['09 Nov 2025', '07:20:00', '3', 'U', '55', '11.3'],
			['20 Dec 2025', '08:35:00', '2', 'F', '55', '11.7'],
			['14 Jan 2026', '08:00:00', '4', 'F', '56', '11.1']
		]);
	});
});
