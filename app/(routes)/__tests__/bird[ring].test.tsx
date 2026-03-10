import { expect, describe, it } from 'vitest';
import { render, screen, getAllByRole } from '@testing-library/react';
import Page from '../bird/[ring]/page';
import { verifyTableData } from './helpers/verify-table-data';

describe('bird page', () => {
	it('should show correct heading', async () => {
		render(
			await Page({
				params: new Promise((resolve) => resolve({ ring: 'BVB4138' }))
			})
		);
		const heading = await screen.findByRole('heading', {
			level: 1
		});
		expect(heading.textContent).toBe(" Cetti's Warbler  BVB4138");
	});
	it('should show headline stats', async () => {
		render(
			await Page({
				params: new Promise((resolve) => resolve({ ring: 'BVB4138' }))
			})
		);
		const headlineStats = await screen.findByTestId('bird-stats');
		const statsLineItems = getAllByRole(headlineStats, 'listitem');
		expect(statsLineItems).toHaveLength(5);
		expect(statsLineItems[0].textContent).toBe('6 encounters');
		expect(statsLineItems[1].textContent).toBe('First: 05 October 2024');
		expect(statsLineItems[2].textContent).toBe('Last: 05 March 2026');
		expect(statsLineItems[3].textContent).toBe('Sex: F');
		expect(statsLineItems[4].textContent).toBe('Proven Age: 2');
	});
	it('should show table of every encounter', async () => {
		render(
			await Page({
				params: new Promise((resolve) => resolve({ ring: 'BVB4138' }))
			})
		);
		const encounterTable = await screen.findByTestId('single-bird-table');
		verifyTableData(encounterTable, [
			['Date', 'Time', 'Age', 'Sex', 'Wing', 'Weight'],
			['05 Oct 2024', '07:00:00', '3', 'U', '', ''],
			['12 Oct 2024', '07:30:00', '3', 'U', '54', '11.3'],
			['17 Jan 2025', '08:00:00', '4', 'U', '54', '10.2'],
			['14 Sep 2025', '07:15:00', '4', 'F', '57', '11.5'],
			['12 Oct 2025', '08:30:00', '2', 'F', '55', '11.6'],
			['05 Mar 2026', '09:00:00', '4', 'F', '57', '11.8']
		]);
	});
});
