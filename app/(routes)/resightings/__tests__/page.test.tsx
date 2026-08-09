import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import Page, { fetchResightings } from '../page';
import resightingsSnapshot from '@/test-fixtures/snapshots/fetchResightings.alpha.json';
import type { ResightingEncounter } from '@/app/models/session';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/lib/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

function makeEncountersClient(data: unknown) {
	const chain = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		not: vi.fn().mockReturnThis(),
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data, error: null }).then(resolve)
	};
	const client = { from: vi.fn().mockReturnValue(chain) };
	return { client, chain };
}

describe('resightings page', () => {
	beforeEach(() => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(
			makeEncountersClient(resightingsSnapshot).client
		);
	});

	afterEach(() => {
		cleanup();
	});

	it('renders heading', async () => {
		render(await Page());
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('Resightings');
	});

	it('shows all rows on the "All" tab by default', async () => {
		render(await Page());
		const table = await screen.findByRole('table');
		const rows = table.querySelectorAll('tbody tr');
		expect(rows.length).toBe(
			(resightingsSnapshot as ResightingEncounter[]).length
		);
	});

	it("renders each row's formatted visit date", async () => {
		render(await Page());
		const table = await screen.findByRole('table');
		expect(table.textContent).toContain('01 Mar 2024');
	});

	it('renders an "All" tab plus one tab per distinct species', async () => {
		render(await Page());
		const tabList = await screen.findByRole('tablist');
		const tabs = [...tabList.querySelectorAll('button')].map(
			(button) => button.textContent
		);
		expect(tabs).toEqual(['All', 'Blue Tit', 'Robin', 'Kingfisher']);
	});

	it('shows only rows for the active species tab when a tab is clicked', async () => {
		render(await Page());
		const tabList = await screen.findByRole('tablist');
		const blueTitTab = [...tabList.querySelectorAll('button')].find(
			(button) => button.textContent === 'Blue Tit'
		)!;
		fireEvent.click(blueTitTab);
		const table = await screen.findByRole('table');
		const rows = table.querySelectorAll('tbody tr');
		expect(rows.length).toBe(2);
		expect(table.textContent).toContain('Blue Tit');
		expect(table.textContent).not.toContain('Robin');
	});

	it('renders ring_no as a link to /bird/[ringNo]', async () => {
		render(await Page());
		const table = await screen.findByRole('table');
		const firstRow = table.querySelectorAll('tbody tr')[0];
		const link = firstRow.querySelector('a');
		expect(link).toBeTruthy();
		expect(link?.getAttribute('href')).toBe('/bird/ARESIGHT04');
	});

	it('renders a record-type badge', async () => {
		render(await Page());
		const table = await screen.findByRole('table');
		const badge = table.querySelector('.badge');
		expect(badge).toBeTruthy();
		expect(['C', 'F', 'T']).toContain(badge?.textContent?.trim());
	});

	it('renders location and notes columns', async () => {
		render(await Page());
		const table = await screen.findByRole('table');
		const headers = [...table.querySelectorAll('thead th')].map(
			(th) => th.textContent
		);
		expect(headers).toContain('Location');
		expect(headers).toContain('Notes');
		expect(table.textContent).toContain('Garden Feeder Station');
		expect(table.textContent).toContain('Photographed');
	});

	it('re-sorts rows when a column header is clicked', async () => {
		render(await Page());
		const table = await screen.findByRole('table');
		const firstRowBefore = table.querySelectorAll('tbody tr')[0].textContent;
		const ringHeader = [...table.querySelectorAll('thead th')].find((th) =>
			th.textContent?.includes('Ring')
		)!;
		fireEvent.click(ringHeader);
		const firstRowAfter = table.querySelectorAll('tbody tr')[0].textContent;
		expect(firstRowAfter).not.toBe(firstRowBefore);
	});

	it('renders a null notes cell gracefully when extra_text is null', async () => {
		render(await Page());
		const tabList = await screen.findByRole('tablist');
		const robinTab = [...tabList.querySelectorAll('button')].find(
			(button) => button.textContent === 'Robin'
		)!;
		fireEvent.click(robinTab);
		const table = await screen.findByRole('table');
		const rows = [...table.querySelectorAll('tbody tr')];
		const rowWithNoNotes = rows.find((row) =>
			row.textContent?.includes('ARESIGHT02')
		)!;
		const notesCell = rowWithNoNotes.querySelectorAll('td')[5];
		expect(notesCell.textContent).toBe('–');
	});

	it('renders empty state gracefully when there are no resightings', async () => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(
			makeEncountersClient([]).client
		);
		render(await Page());
		const table = await screen.findByRole('table');
		const rows = table.querySelectorAll('tbody tr');
		expect(rows.length).toBe(0);
	});
});

describe('fetchResightings query building', () => {
	afterEach(() => {
		cleanup();
	});

	it('filters encounters to the viewed group', async () => {
		const { client, chain } = makeEncountersClient(resightingsSnapshot);
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
		await fetchResightings({}, 42);
		expect(chain.eq).toHaveBeenCalledWith('ringing_group_id', 42);
	});

	it('excludes N and S record types from the query', async () => {
		const { client, chain } = makeEncountersClient(resightingsSnapshot);
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
		await fetchResightings({}, 42);
		expect(chain.not).toHaveBeenCalledWith('record_type', 'in', '(N,S)');
	});
});
