import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import Page, { fetchResightingsPageContent } from '../page';
import resightingsSnapshot from '@/test-fixtures/snapshots/tables/Encounters/alpha.resightings.json';
import type { ResightingEncounter } from '@/app/models/session';
import { RESIGHTING_RECORD_TYPES } from '@/lib/demon-import';
import { getCellTextByHeading } from '@/app/__tests__/helpers/table';
import { makeSupabaseTableClient } from '@/app/__tests__/helpers/supabase-client';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

function makeEncountersClient(data: unknown) {
	return makeSupabaseTableClient(data, ['select', 'eq', 'in']);
}

// Alpha's real seed data now has two resighting/recovery records (#902 review
// on #894): a Kingfisher found dead (record_type F) and a Wren controlled by
// another ringer (record_type U), both at the same site on consecutive days.
const resightings = resightingsSnapshot as ResightingEncounter[];

describe('resightings page', () => {
	beforeEach(() => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(
			makeEncountersClient(resightings).client
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
		expect(rows.length).toBe(resightings.length);
	});

	it("renders each row's formatted visit date", async () => {
		render(await Page());
		const table = await screen.findByRole('table');
		expect(table.textContent).toContain('10 May 2023');
		expect(table.textContent).toContain('12 May 2023');
	});

	it('renders an "All" tab plus one tab per distinct species', async () => {
		render(await Page());
		const tabList = await screen.findByRole('tablist');
		const tabs = [...tabList.querySelectorAll('button')].map(
			(button) => button.textContent
		);
		expect(tabs).toEqual(['All', 'Kingfisher', 'Wren']);
	});

	it('shows only rows for the active species tab when a tab is clicked', async () => {
		render(await Page());
		const tabList = await screen.findByRole('tablist');
		const kingfisherTab = [...tabList.querySelectorAll('button')].find(
			(button) => button.textContent === 'Kingfisher'
		)!;
		fireEvent.click(kingfisherTab);
		const table = await screen.findByRole('table');
		const rows = table.querySelectorAll('tbody tr');
		expect(rows.length).toBe(1);
		expect(table.textContent).toContain('Kingfisher');
		expect(table.textContent).not.toContain('Wren');
	});

	it('renders ring_no as a link to /bird/[ringNo]', async () => {
		render(await Page());
		const table = await screen.findByRole('table');
		const firstRow = table.querySelectorAll('tbody tr')[0];
		const link = firstRow.querySelector('a');
		expect(link).toBeTruthy();
		// Sorted by visit date descending by default, so the Wren (12 May) leads.
		expect(link?.getAttribute('href')).toBe('/bird/ZWREN9001');
	});

	it('renders a record-type badge', async () => {
		render(await Page());
		const table = await screen.findByRole('table');
		const badges = [...table.querySelectorAll('.badge')].map((badge) =>
			badge.textContent?.trim()
		);
		expect(badges).toEqual(
			expect.arrayContaining([
				...new Set(resightings.map((r) => r.record_type))
			])
		);
	});

	it('renders location and notes columns', async () => {
		render(await Page());
		const table = await screen.findByRole('table');
		const headers = [...table.querySelectorAll('thead th')].map(
			(th) => th.textContent
		);
		expect(headers).toContain('Location');
		expect(headers).toContain('Notes');
		expect(table.textContent).toContain('Alpha Site A (CES)');
	});

	it('renders finding condition and finding circumstances columns', async () => {
		render(await Page());
		const table = await screen.findByRole('table');
		const headers = [...table.querySelectorAll('thead th')].map(
			(th) => th.textContent
		);
		expect(headers).toContain('Finding condition');
		expect(headers).toContain('Finding circumstances');
		const rows = [...table.querySelectorAll('tbody tr')];
		const kingfisherRow = rows.find((row) =>
			row.textContent?.includes('AKINGF9001')
		)!;
		expect(
			getCellTextByHeading(table, 'Finding condition', kingfisherRow)
		).toBe('8');
		expect(
			getCellTextByHeading(table, 'Finding circumstances', kingfisherRow)
		).toBe('2');
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
		const table = await screen.findByRole('table');
		const rows = [...table.querySelectorAll('tbody tr')];
		const rowWithNoNotes = rows.find((row) =>
			row.textContent?.includes('ZWREN9001')
		)!;
		expect(getCellTextByHeading(table, 'Notes', rowWithNoNotes)).toBe('–');
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

describe('fetchResightingsPageContent query building', () => {
	afterEach(() => {
		cleanup();
	});

	it('filters encounters to the viewed group', async () => {
		const { client, chain } = makeEncountersClient(resightings);
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
		await fetchResightingsPageContent({}, 42);
		expect(chain.eq).toHaveBeenCalledWith('ringing_group_id', 42);
	});

	it('matches only resighting/recovery record types in the query', async () => {
		const { client, chain } = makeEncountersClient(resightings);
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
		await fetchResightingsPageContent({}, 42);
		expect(chain.in).toHaveBeenCalledWith('record_type', [
			...RESIGHTING_RECORD_TYPES
		]);
	});
});
