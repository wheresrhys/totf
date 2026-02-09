import { expect, describe, it, afterEach } from 'vitest';
import {
	render,
	screen,
	getByRole,
	getAllByRole,
	fireEvent,
	waitFor,
	cleanup
} from '@testing-library/react';
import { act } from 'react';
import { verifyTableData } from './helpers/verify-table-data';
import Page from '../species/[speciesName]/page';
import { mockIntersectionObserver } from 'jsdom-testing-mocks';

const io = mockIntersectionObserver();

describe('species page', () => {
	afterEach(() => {
		cleanup();
	});
	it('should show correct heading', async () => {
		render(
			await Page({
				params: new Promise((resolve) =>
					resolve({ speciesName: "Cetti's Warbler" })
				)
			})
		);
		const heading = await screen.findByRole('heading', {
			level: 1
		});
		expect(heading.textContent).toBe("Cetti's Warbler");
	});
	it('should show headline stats', async () => {
		render(
			await Page({
				params: new Promise((resolve) =>
					resolve({ speciesName: "Cetti's Warbler" })
				)
			})
		);
		const headlineStats = await screen.findByTestId('headline-stats');
		const statsLineItems = headlineStats.querySelectorAll(':scope > li');

		expect(statsLineItems).toHaveLength(7);
		expect(statsLineItems[0].textContent).toBe(
			'Totals: 6 birds15 encounters6 sessionsmax haul: 4 birds'
		);
		expect(statsLineItems[1].textContent).toBe(
			'Recoveries: 83 % retrappedmax time span: 66 daysmax proven age: 1 yearsmost seen bird: 3 times'
		);
		expect(statsLineItems[2].textContent).toBe(
			'Weight: max: 15.1 gavg: 13 gmin: 11.1 gmedian: 13.9 g'
		);
		expect(statsLineItems[3].textContent).toBe(
			'Wing: max: 65 mmavg: 59.9 mmmin: 55 mmmedian: 62 mm'
		);

		expect(statsLineItems[4].textContent).toBe('No notably old birds');
		expect(statsLineItems[5].textContent).toBe(
			'Most caught birds: 3 encounters each BVB4353  ADZ0566  BVB4581  BVB4401 '
		);
		expect(statsLineItems[6].textContent).toBe(
			'Top sessions: 4  on  3 Dec 2025 3  on  16 Dec 2025 3  on  9 Nov 2025 2  on  20 Dec 2025 2  on  8 Nov 2025 '
		);
	});
	it('should show table of every individual bird when less than 20 records', async () => {
		render(
			await Page({
				params: new Promise((resolve) =>
					resolve({ speciesName: "Cetti's Warbler" })
				)
			})
		);
		const speciesTable = await screen.findByTestId('species-table');
		verifyTableData(speciesTable, [
			['Ring', 'Count', 'Sex', 'First', 'Last', 'Last aged', 'Proven age'],
			['BVB4353', '3', 'F', '09 Nov 2025', '14 Jan 2026', '4', '1'],
			['ADZ0566', '3', 'U', '08 Nov 2025', '20 Dec 2025', '2', '0'],
			['BVB4420', '2', 'U', '03 Dec 2025', '16 Dec 2025', '2', '0'],
			['BVB4581', '3', 'U', '09 Nov 2025', '16 Dec 2025', '2', '0'],
			['BVB4401', '3', 'U', '08 Nov 2025', '16 Dec 2025', '2', '0'],
			['BVB4138', '1', 'U', '09 Nov 2025', '09 Nov 2025', '2', '0']
		]);
		expect(() => screen.getByTestId('infinite-scroll-loader')).toThrow();
	});

	it('should allow infinite scroll when more than 20 records', async () => {
		render(
			await Page({
				params: new Promise((resolve) => resolve({ speciesName: 'Chiffchaff' }))
			})
		);
		const speciesTable = await screen.findByTestId('species-table');

		expect(speciesTable.querySelectorAll(':scope > tbody > tr')).toHaveLength(
			20
		);
		expect(screen.getByTestId('infinite-scroll-loader')).toBeDefined();
		fireEvent.scroll(window, { target: { scrollY: 1000 } });
		act(() => {
			io.enterNode(screen.getByTestId('infinite-scroll-loader'));
		});
		waitFor(
			() => {
				return expect(
					speciesTable.querySelectorAll(':scope > tbody > tr')
				).toHaveLength(40);
			},
			{
				timeout: 1000
			}
		);
		expect(screen.getByTestId('infinite-scroll-loader')).toBeDefined();
		act(() => {
			io.enterNode(screen.getByTestId('infinite-scroll-loader'));
		});
		waitFor(
			() => {
				return expect(
					speciesTable.querySelectorAll(':scope > tbody > tr')
				).toHaveLength(60);
			},
			{
				timeout: 1000
			}
		);
		expect(screen.getByTestId('infinite-scroll-loader')).toBeDefined();
		act(() => {
			io.enterNode(screen.getByTestId('infinite-scroll-loader'));
		});
		waitFor(
			() => {
				return expect(
					speciesTable.querySelectorAll(':scope > tbody > tr')
				).toHaveLength(65);
			},
			{
				timeout: 1000
			}
		);
		waitFor(
			() => {
				expect(() => screen.getByTestId('infinite-scroll-loader')).toThrow();
			},
			{
				timeout: 1000
			}
		);
	});
	// todo fix the async issues
	it.skip('should allow each individual bird to be expanded', async () => {
		render(
			await Page({
				params: new Promise((resolve) =>
					resolve({ speciesName: "Cetti's Warbler" })
				)
			})
		);
		const speciesTable = await screen.findByTestId('species-table');
		const topLevelBodyEl = speciesTable.querySelector(
			':scope > tbody'
		) as HTMLElement;
		const beforeRowEls = getAllByRole(topLevelBodyEl, 'row');
		const beforeRowCount = beforeRowEls.length;
		const targetRowEl = beforeRowEls[beforeRowCount - 1];
		const expandButton = getByRole(
			getAllByRole(targetRowEl, 'cell')[0],
			'button'
		);
		expect(expandButton).toBeDefined();
		fireEvent.click(expandButton);
		await waitFor(() => {
			const afterRowEls = getAllByRole(topLevelBodyEl, 'row');
			expect(afterRowEls.length).toBeGreaterThan(beforeRowCount);
		});
		const afterRowEls = getAllByRole(topLevelBodyEl, 'row').filter(
			(row) => row.parentElement === topLevelBodyEl
		);
		expect(afterRowEls).toHaveLength(beforeRowCount + 1);
		const expandedRowEl = afterRowEls[afterRowEls.length - 1];
		expect(expandedRowEl.querySelectorAll(':scope > td')).toHaveLength(1);

		verifyTableData(getByRole(expandedRowEl, 'table'), [
			['Date', 'Time', 'Age', 'Sex', 'Wing', 'Weight'],
			['2025-11-09', '07:20:00', '2', 'U', '56', '11.2']
		]);
	});
});
