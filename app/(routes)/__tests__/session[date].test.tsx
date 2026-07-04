import { expect, describe, it } from 'vitest';
import { render, screen, getAllByRole } from '@testing-library/react';
import Page from '../../group/[groupId]/session/[date]/page';
import { verifyTableData } from './helpers/verify-table-data';

describe('session page', () => {
	it('should show correct heading', async () => {
		render(
			await Page({
				params: new Promise((resolve) =>
					resolve({ groupId: '1', date: '2023-09-30' })
				)
			})
		);
		const heading = await screen.findByRole('heading', {
			level: 1
		});
		expect(heading.textContent).toBe(
			'Sat 30th September 2023Walthamstow Wetlands'
		);
	});
	it('should show headline stats', async () => {
		render(
			await Page({
				params: new Promise((resolve) =>
					resolve({ groupId: '1', date: '2023-09-30' })
				)
			})
		);

		const headlineStats = await screen.findByTestId('session-stats');
		const statsLineItems = getAllByRole(headlineStats, 'listitem');
		expect(statsLineItems).toHaveLength(7);
		expect(statsLineItems[0].textContent).toBe('10 birds');
		expect(statsLineItems[1].textContent).toBe('4 species');
		expect(statsLineItems[2].textContent).toBe('6 new');
		expect(statsLineItems[3].textContent).toBe('4 retraps');
		expect(statsLineItems[4].textContent).toBe('2 adults');
		expect(statsLineItems[5].textContent).toBe('5 juvs');
		expect(statsLineItems[6].textContent).toBe('3 unknown age');
	});
	it('should show table of every species', async () => {
		render(
			await Page({
				params: new Promise((resolve) =>
					resolve({ groupId: '1', date: '2023-09-30' })
				)
			})
		);
		const speciesTable = await screen.findByTestId('session-table');
		verifyTableData(speciesTable, [
			['Species', 'Total', 'New', 'Retraps', 'Adults', 'Juvs', 'Unknown Age'],
			["Cetti's Warbler", '5', '2', '3', '0', '2', '3'],

			['Robin', '3', '2', '1', '0', '3', '0'],

			['Greenfinch', '1', '1', '0', '1', '0', '0'],

			['Kingfisher', '1', '1', '0', '1', '0', '0']
		]);
	});
});
