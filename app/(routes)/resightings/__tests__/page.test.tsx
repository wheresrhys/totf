import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import Page, { fetchResightingsPageContent } from '../page';
import resightingsSnapshot from '@/test-fixtures/snapshots/tables/Encounters/alpha.resightings.json';
import type { ResightingEncounter } from '@/app/models/session';
import { RESIGHTING_RECORD_TYPES } from '@/lib/demon-import';
import { getCellTextByHeading } from '@/app/__tests__/helpers/table';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

function makeEncountersClient(data: unknown) {
	const chain = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		in: vi.fn().mockReturnThis(),
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data, error: null }).then(resolve)
	};
	const client = { from: vi.fn().mockReturnValue(chain) };
	return { client, chain };
}

// Alpha's real seed data has no resighting/recovery record types at all
// (`imported alpha.resightings.json` — the real captured fixture — is `[]`,
// #894), so it can only stand in for the page's real empty-state rendering.
// The rendering tests below need multiple species and record types to
// exercise tab filtering, badges, sorting and the null-value formatters, so
// they use this inline, hand-built dataset instead.
const sampleResightings = [
	{
		id: 1,
		record_type: 'C',
		extra_text: 'Seen at feeder',
		finding_condition: '8',
		finding_circumstances: '2',
		bird: {
			ring_no: 'ARESIGHT01',
			species: { species_name: 'Blue Tit' }
		},
		session: {
			visit_date: '2024-03-01',
			location: { location_name: 'Garden Feeder Station' }
		}
	},
	{
		id: 2,
		record_type: 'F',
		extra_text: null,
		finding_condition: null,
		finding_circumstances: null,
		bird: {
			ring_no: 'ARESIGHT02',
			species: { species_name: 'Robin' }
		},
		session: {
			visit_date: '2024-06-15',
			location: { location_name: 'Garden Feeder Station' }
		}
	},
	{
		id: 3,
		record_type: 'T',
		extra_text: 'Found dead',
		finding_condition: '5',
		finding_circumstances: '1',
		bird: {
			ring_no: 'ARESIGHT03',
			species: { species_name: 'Kingfisher' }
		},
		session: {
			visit_date: '2023-11-20',
			location: { location_name: 'River Bank' }
		}
	},
	{
		id: 4,
		record_type: 'C',
		extra_text: 'Photographed',
		finding_condition: '8',
		finding_circumstances: '2',
		bird: {
			ring_no: 'ARESIGHT04',
			species: { species_name: 'Blue Tit' }
		},
		session: {
			visit_date: '2024-08-02',
			location: { location_name: 'Garden Feeder Station' }
		}
	},
	{
		id: 5,
		record_type: 'F',
		extra_text: null,
		finding_condition: null,
		finding_circumstances: null,
		bird: {
			ring_no: 'ARESIGHT05',
			species: { species_name: 'Robin' }
		},
		session: {
			visit_date: '2022-01-10',
			location: { location_name: 'River Bank' }
		}
	}
] as unknown as ResightingEncounter[];

describe('resightings page', () => {
	beforeEach(() => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(
			makeEncountersClient(sampleResightings).client
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
		expect(rows.length).toBe(sampleResightings.length);
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

	it('renders finding condition and finding circumstances columns', async () => {
		render(await Page());
		const table = await screen.findByRole('table');
		const headers = [...table.querySelectorAll('thead th')].map(
			(th) => th.textContent
		);
		expect(headers).toContain('Finding condition');
		expect(headers).toContain('Finding circumstances');
		const rows = [...table.querySelectorAll('tbody tr')];
		const rowWithValues = rows.find((row) =>
			row.textContent?.includes('ARESIGHT01')
		)!;
		expect(
			getCellTextByHeading(table, 'Finding condition', rowWithValues)
		).toBe('8');
		expect(
			getCellTextByHeading(table, 'Finding circumstances', rowWithValues)
		).toBe('2');
	});

	it('renders empty-value placeholders when finding_condition/finding_circumstances are null', async () => {
		render(await Page());
		const tabList = await screen.findByRole('tablist');
		const robinTab = [...tabList.querySelectorAll('button')].find(
			(button) => button.textContent === 'Robin'
		)!;
		fireEvent.click(robinTab);
		const table = await screen.findByRole('table');
		const rows = [...table.querySelectorAll('tbody tr')];
		const rowWithNoRecoveryDetails = rows.find((row) =>
			row.textContent?.includes('ARESIGHT02')
		)!;
		expect(
			getCellTextByHeading(table, 'Finding condition', rowWithNoRecoveryDetails)
		).toBe('–');
		expect(
			getCellTextByHeading(
				table,
				'Finding circumstances',
				rowWithNoRecoveryDetails
			)
		).toBe('–');
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
		expect(getCellTextByHeading(table, 'Notes', rowWithNoNotes)).toBe('–');
	});

	// The real captured `alpha.resightings.json` fixture (#894) exercises this
	// case for real: Alpha's seed data has no resighting/recovery encounters.
	it('renders empty state gracefully when there are no resightings', async () => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(
			makeEncountersClient(resightingsSnapshot).client
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
		const { client, chain } = makeEncountersClient(sampleResightings);
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
		await fetchResightingsPageContent({}, 42);
		expect(chain.eq).toHaveBeenCalledWith('ringing_group_id', 42);
	});

	it('matches only resighting/recovery record types in the query', async () => {
		const { client, chain } = makeEncountersClient(sampleResightings);
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
		await fetchResightingsPageContent({}, 42);
		expect(chain.in).toHaveBeenCalledWith('record_type', [
			...RESIGHTING_RECORD_TYPES
		]);
	});
});
