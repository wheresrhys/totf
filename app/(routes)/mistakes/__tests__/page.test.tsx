import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	waitFor
} from '@testing-library/react';
import Page from '../page';
import mistakesSnapshot from '@/test-fixtures/snapshots/fetchMistakes.alpha.json';
import birdDataSnapshot from '@/test-fixtures/snapshots/fetchBirdData.ARRETRAP.json';
import { clearCachedBirdEncountersForTesting } from '@/app/components/MistakesTable';
import type { DiscrepenciesResult } from '@/app/models/db';

const { mockGetAuthenticatedSupabaseClient, mockFetchBirdEncounters } =
	vi.hoisted(() => ({
		mockGetAuthenticatedSupabaseClient: vi.fn(),
		mockFetchBirdEncounters: vi.fn()
	}));

vi.mock('@/lib/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

vi.mock('@/app/actions/bird-encounters', () => ({
	fetchBirdEncounters: mockFetchBirdEncounters
}));

function makeRpcClient(data: unknown) {
	const thenable = {
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data, error: null }).then(resolve)
	};
	return { rpc: vi.fn().mockReturnValue(thenable) };
}

describe('mistakes page', () => {
	beforeEach(() => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(
			makeRpcClient(mistakesSnapshot)
		);
		mockFetchBirdEncounters.mockReset();
		mockFetchBirdEncounters.mockResolvedValue(birdDataSnapshot.encounters);
		clearCachedBirdEncountersForTesting();
	});

	afterEach(() => {
		cleanup();
	});

	it('renders heading', async () => {
		render(await Page());
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('Mistakes');
	});

	it('renders a tab for each discrepancy type', async () => {
		render(await Page());
		const tabList = await screen.findByRole('tablist');
		const tabs = tabList.querySelectorAll('button');
		const types = [
			...new Set(
				(mistakesSnapshot as DiscrepenciesResult[]).map(
					(m) => m.discrepency_type
				)
			)
		];
		expect(tabs.length).toBe(types.length);
	});

	it('shows only rows for the active tab', async () => {
		render(await Page());
		const tabList = await screen.findByRole('tablist');
		const firstTab = tabList.querySelectorAll('button')[0];
		const activeType = (mistakesSnapshot as DiscrepenciesResult[])[0]
			.discrepency_type;
		const expectedCount = (mistakesSnapshot as DiscrepenciesResult[]).filter(
			(m) => m.discrepency_type === activeType
		).length;
		expect(firstTab.textContent).toBeTruthy();
		const table = await screen.findByRole('table');
		const rows = table.querySelectorAll('tbody tr');
		expect(rows.length).toBe(expectedCount);
	});

	it('renders ring_no as a link in each row', async () => {
		render(await Page());
		const table = await screen.findByRole('table');
		const firstDataRow = table.querySelectorAll('tbody tr')[0];
		const link = firstDataRow.querySelector('a');
		expect(link).toBeTruthy();
		const firstActiveType = (mistakesSnapshot as DiscrepenciesResult[])[0]
			.discrepency_type;
		const firstOfType = (mistakesSnapshot as DiscrepenciesResult[]).find(
			(m) => m.discrepency_type === firstActiveType
		)!;
		expect(link?.getAttribute('href')).toBe(`/bird/${firstOfType.ring_no}`);
	});

	it('renders a "Last seen" column header', async () => {
		render(await Page());
		const table = await screen.findByRole('table');
		const headers = [...table.querySelectorAll('thead th')].map(
			(th) => th.textContent
		);
		expect(headers).toContain('Species');
		expect(headers).toContain('Last seen');
	});

	it("renders each row's formatted last encounter date", async () => {
		render(await Page());
		const table = await screen.findByRole('table');
		// ARRETRAP (Robin) last seen 2024-05-10, in the 'age' tab
		expect(table.textContent).toContain('10 May 2024');
	});

	it('sorts rows by species ascending on first render', async () => {
		render(await Page());
		const table = await screen.findByRole('table');
		const firstRowSpecies = table
			.querySelectorAll('tbody tr')[0]
			.querySelectorAll('td')[1].textContent;
		// age tab species: Blue Tit, Kingfisher, Robin -> Blue Tit first
		expect(firstRowSpecies).toBe('Blue Tit');
	});

	it('re-sorts by last seen when the column header is clicked', async () => {
		render(await Page());
		const table = await screen.findByRole('table');
		const lastSeenHeader = [...table.querySelectorAll('thead th')].find((th) =>
			th.textContent?.includes('Last seen')
		)!;
		fireEvent.click(lastSeenHeader);
		const rows = table.querySelectorAll('tbody tr');
		// desc: most recent first -> ARRETRAP (Robin) 2024-05-10
		expect(rows[0].textContent).toContain('Robin');
		expect(rows[0].textContent).toContain('10 May 2024');
	});

	it('renders empty tab gracefully when no data', async () => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeRpcClient([]));
		render(await Page());
		const tabList = screen.queryByRole('tablist');
		expect(tabList?.querySelectorAll('button').length ?? 0).toBe(0);
	});

	describe('expanding a row to show bird encounter detail', () => {
		async function renderPageAndAwaitMistakesTable() {
			render(await Page());
			// the BootstrapPageData mock loads data asynchronously
			await screen.findByRole('table');
		}

		function findRowContaining(text: string): HTMLTableRowElement {
			const mistakesTable = screen.getAllByRole('table')[0];
			return [...mistakesTable.querySelectorAll('tbody tr')].find((row) =>
				row.textContent?.includes(text)
			)! as HTMLTableRowElement;
		}

		function clickRowToggle(ringNo: string) {
			fireEvent.click(findRowContaining(ringNo).querySelector('button')!);
		}

		async function findEncounterDetailTable() {
			// SingleBirdTable renders a nested table inside the expanded row
			return waitFor(() => {
				const tables = screen.getAllByRole('table');
				expect(tables.length).toBe(2);
				return tables[1];
			});
		}

		function switchToTab(label: string) {
			const tabList = screen.getByRole('tablist');
			const tab = [...tabList.querySelectorAll('button')].find(
				(button) => button.textContent === label
			)!;
			fireEvent.click(tab);
		}

		it('fetches and renders the bird encounter detail when a row is expanded', async () => {
			await renderPageAndAwaitMistakesTable();
			clickRowToggle('ABTITMIS');
			await findEncounterDetailTable();
			expect(mockFetchBirdEncounters).toHaveBeenCalledTimes(1);
			expect(mockFetchBirdEncounters).toHaveBeenCalledWith('ABTITMIS');
		});

		it('does not refetch when the same row is collapsed and re-expanded', async () => {
			await renderPageAndAwaitMistakesTable();
			clickRowToggle('ABTITMIS');
			await findEncounterDetailTable();
			clickRowToggle('ABTITMIS');
			expect(screen.getAllByRole('table').length).toBe(1);
			clickRowToggle('ABTITMIS');
			await findEncounterDetailTable();
			expect(mockFetchBirdEncounters).toHaveBeenCalledTimes(1);
		});

		it('does not refetch when returning to a tab and re-expanding a previously viewed row', async () => {
			await renderPageAndAwaitMistakesTable();
			clickRowToggle('ABTITMIS');
			await findEncounterDetailTable();
			switchToTab('Sex');
			switchToTab('Age');
			clickRowToggle('ABTITMIS');
			await findEncounterDetailTable();
			expect(mockFetchBirdEncounters).toHaveBeenCalledTimes(1);
		});

		it('shows a loading message while encounter detail is being fetched', async () => {
			mockFetchBirdEncounters.mockImplementation(() => new Promise(() => {}));
			await renderPageAndAwaitMistakesTable();
			clickRowToggle('ABTITMIS');
			expect(screen.getByText('Loading...')).toBeTruthy();
		});

		it('fetches encounter detail separately for each expanded bird', async () => {
			await renderPageAndAwaitMistakesTable();
			clickRowToggle('ABTITMIS');
			await findEncounterDetailTable();
			clickRowToggle('AKINGF001');
			await findEncounterDetailTable();
			expect(mockFetchBirdEncounters).toHaveBeenCalledTimes(2);
			expect(mockFetchBirdEncounters).toHaveBeenCalledWith('ABTITMIS');
			expect(mockFetchBirdEncounters).toHaveBeenCalledWith('AKINGF001');
		});

		it('retries the fetch when re-expanding a row whose fetch failed', async () => {
			mockFetchBirdEncounters.mockRejectedValueOnce(new Error('boom'));
			await renderPageAndAwaitMistakesTable();
			clickRowToggle('ABTITMIS');
			await waitFor(() =>
				expect(mockFetchBirdEncounters).toHaveBeenCalledTimes(1)
			);
			expect(screen.getByText('Loading...')).toBeTruthy();
			clickRowToggle('ABTITMIS');
			clickRowToggle('ABTITMIS');
			await findEncounterDetailTable();
			expect(mockFetchBirdEncounters).toHaveBeenCalledTimes(2);
		});
	});
});
