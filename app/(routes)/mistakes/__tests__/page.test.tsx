import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import Page from '../page';
import mistakesSnapshot from '@/test-fixtures/snapshots/find_discrepencies/alpha.discrepancies.json';
import type { DiscrepenciesResult } from '@/app/models/db';
import { getCellTextByHeading } from '@/app/__tests__/helpers/table';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

function makeRpcClient(data: unknown) {
	const thenable = {
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data, error: null }).then(resolve)
	};
	return { rpc: vi.fn().mockReturnValue(thenable) };
}

// The fixture holds three discrepancy types — `age` (3 rows), `sex` and
// `wing_length` (1 row each) — with `age` first, so it's the page's default
// tab.
const AGE_TAB_ROW_COUNT = 3;

function getTabButtons(): HTMLButtonElement[] {
	return [...screen.getByRole('tablist').querySelectorAll('button')];
}

function getActiveTabLabel(): string | undefined {
	return getTabButtons().find(
		(button) => button.getAttribute('aria-current') === 'true'
	)?.textContent;
}

function getVisibleRowCount(): number {
	// `getByRole` skips the `aria-hidden` panels `ConditionalTabPanel` keeps
	// mounted for already-visited tabs, so this is always the active tab's
	// table.
	return screen.getByRole('table').querySelectorAll('tbody tr').length;
}

beforeEach(() => {
	mockGetAuthenticatedSupabaseClient.mockResolvedValue(
		makeRpcClient(mistakesSnapshot)
	);
});

afterEach(() => {
	cleanup();
});

describe('mistakes page', () => {
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
		// The table's initial sort is by species ascending (see
		// MistakesDiscrepancyTab's initialSortColumn), so the first rendered row
		// is the alphabetically-first species within the active tab, not
		// necessarily the first matching row in the snapshot's raw array order.
		const firstOfType = (mistakesSnapshot as DiscrepenciesResult[])
			.filter((m) => m.discrepency_type === firstActiveType)
			.sort((a, b) => a.species_name.localeCompare(b.species_name))[0];
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
		await screen.findByRole('table');
		const firstRowSpecies = getCellTextByHeading('Species', 0);
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
});

describe('deep-linking the active discrepancy tab', () => {
	async function renderMistakesPage(tabId?: string) {
		render(
			await Page(
				tabId === undefined ? {} : { searchParams: Promise.resolve({ tabId }) }
			)
		);
		await screen.findByRole('tablist');
	}

	it('opens the tab named by ?tabId= when it is a discrepancy type present in the data', async () => {
		await renderMistakesPage('wing_length');
		expect(getActiveTabLabel()).toBe('Wing length');
		expect(getVisibleRowCount()).toBe(1);
		expect(screen.getByRole('table').textContent).toContain('Robin');
	});

	it('falls back to the first discrepancy type when ?tabId= names an unknown value', async () => {
		await renderMistakesPage('not-a-discrepancy-type');
		expect(getActiveTabLabel()).toBe('Age');
		expect(getVisibleRowCount()).toBe(AGE_TAB_ROW_COUNT);
	});

	it('falls back to the first discrepancy type when no ?tabId= is given', async () => {
		await renderMistakesPage();
		expect(getActiveTabLabel()).toBe('Age');
		expect(getVisibleRowCount()).toBe(AGE_TAB_ROW_COUNT);
	});
});

describe('tab content preservation across switches', () => {
	it("does not remount a discrepancy type's table when switching away and back", async () => {
		render(await Page());
		const ageTable = await screen.findByRole('table');
		// Re-sort by last seen (descending) — state owned by the tab's own
		// `SortableTable`, so it only survives if that table is never remounted.
		fireEvent.click(
			[...ageTable.querySelectorAll('thead th')].find((th) =>
				th.textContent?.includes('Last seen')
			)!
		);
		expect(getCellTextByHeading('Species', 0)).toBe('Robin');

		const [ageTab, sexTab] = getTabButtons();
		fireEvent.click(sexTab);
		fireEvent.click(ageTab);

		expect(screen.getByRole('table')).toBe(ageTable);
		expect(getCellTextByHeading('Species', 0)).toBe('Robin');
	});
});
