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

		expect(statsLineItems).toHaveLength(4);
		expect(statsLineItems[0].textContent).toBe(
			'Totals: 98 birds187 encounters52 sessionsmax haul: 12 birds'
		);

		// expect(statsLineItems[1].textContent).toBe(
		// 	'Recoveries: 42 % retrappedmax time span: 567 daysmax proven age: 2 yearsmost seen bird: 6 times'
		// );
		expect(statsLineItems[1].textContent).toBe(
			'Weight: max: 17.2 gavg: 13.3 gmin: 10.2 gmedian: 13.6 g'
		);
		expect(statsLineItems[2].textContent).toBe(
			'Wing: max: 68 mmavg: 59.7 mmmin: 49 mmmedian: 61 mm'
		);
		// expect(statsLineItems[4].textContent).toBe(
		// 	'Oldest birds: 2 years old: BVB4138 '
		// );

		// expect(statsLineItems[5].textContent).toBe(
		// 	'Most caught bird: 6 encounters each BVB4138 '
		// );
		expect(statsLineItems[3].textContent).toBe(
			'Top sessions: 12  on  12 Jul 2025 11  on  14 Sep 2025 10  on  8 Oct 2023 9  on  14 Sep 2024 8  on  26 Nov 2023 '
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
		verifyTableData(
			speciesTable,
			[
				['Ring', 'Count', 'Sex', 'First', 'Last', 'Last aged', 'Proven age'],
				['BVB4138', '6', 'F', '05 Oct 2024', '05 Mar 2026', '4', '2'],
				['BVB4927', '1', 'U', '17 Oct 2025', '17 Oct 2025', '3', '0'],
				['BVB4401', '5', 'M?', '12 Jul 2025', '12 Oct 2025', '2', '0'],
				['BVB4173', '5', 'U', '29 Sep 2024', '12 Oct 2025', '4', '1'],
				['BVB4924', '1', 'U', '12 Oct 2025', '12 Oct 2025', '3', '0'],
				['BVB4913', '1', 'M', '10 Oct 2025', '10 Oct 2025', '2', '0'],
				['BVB4904', '1', 'U', '09 Oct 2025', '09 Oct 2025', '2', '0'],
				['BVB4344', '4', 'U', '28 Jun 2025', '09 Oct 2025', '2', '0'],
				['BVB4905', '1', 'M', '09 Oct 2025', '09 Oct 2025', '2', '0']
			],
			{ isPartial: true }
		);
	});

	it('should not have infinite scroll loader when less than 20 records', async () => {
		render(
			await Page({
				params: new Promise((resolve) => resolve({ speciesName: 'Kingfisher' }))
			})
		);
		expect(() => screen.getByTestId('infinite-scroll-loader')).toThrow();
	});
	it('should allow infinite scroll when more than 20 records', async () => {
		render(
			await Page({
				params: new Promise((resolve) =>
					resolve({ speciesName: "Cetti's Warbler" })
				)
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
