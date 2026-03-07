import { expect, describe, it } from 'vitest';
import { render, screen, getAllByRole } from '@testing-library/react';
import Page from '../session/[...params]/page';
import { verifyTableData } from './helpers/verify-table-data';

describe('session page', () => {
	it('should show correct heading', async () => {
		render(
			await Page({
				params: new Promise((resolve) => resolve({ date: '2025-12-03' }))
			})
		);
		const heading = await screen.findByRole('heading', {
			level: 1
		});
		expect(heading.textContent).toBe('Wed 3rd December 2025');
	});
	it('should show headline stats', async () => {
		render(
			await Page({
				params: new Promise((resolve) => resolve({ date: '2025-12-03' }))
			})
		);

		const headlineStats = await screen.findByTestId('session-stats');
		const statsLineItems = getAllByRole(headlineStats, 'listitem');
		expect(statsLineItems).toHaveLength(6);
		expect(statsLineItems[0].textContent).toBe('40 birds');
		expect(statsLineItems[1].textContent).toBe('11 species');
		expect(statsLineItems[2].textContent).toBe('32 new');
		expect(statsLineItems[3].textContent).toBe('8 retraps');
		expect(statsLineItems[4].textContent).toBe('8 adults');
		expect(statsLineItems[5].textContent).toBe('32 juvs');
	});
	it('should show table of every species', async () => {
		render(
			await Page({
				params: new Promise((resolve) => resolve({ date: '2025-12-03' }))
			})
		);
		const speciesTable = await screen.findByTestId('session-table');
		verifyTableData(speciesTable, [
			['Species', 'Total', 'New', 'Retraps', 'Adults', 'Juvs'],
			['Chiffchaff', '13', '12', '1', '2', '11'],
			['Goldcrest', '6', '6', '0', '1', '5'],
			['Reed Bunting', '5', '4', '1', '3', '2'],
			["Cetti's Warbler", '4', '0', '4', '0', '4'],
			['Robin', '3', '2', '1', '0', '3'],
			['Blue Tit', '2', '2', '0', '1', '1'],
			['Chiffchaff (Siberian - tristis)', '2', '2', '0', '1', '1'],
			['Wren', '2', '1', '1', '0', '2'],
			['Blackcap', '1', '1', '0', '0', '1'],
			['Great Tit', '1', '1', '0', '0', '1'],
			['Long-tailed Tit', '1', '1', '0', '0', '1']
		]);
	});
	// todo fix the async issues
	it.skip('should allow each individual species to be expanded', async () => {});
});
