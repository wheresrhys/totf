import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import Page, { fetchPulliPageContent } from '../page';
import pulliEncountersSnapshot from '@/test-fixtures/snapshots/fetchPulliEncounters.alpha.json';
import type { PulliEncounter } from '@/app/models/session';

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
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data, error: null }).then(resolve)
	};
	const client = { from: vi.fn().mockReturnValue(chain) };
	return { client, chain };
}

describe('pulli page', () => {
	beforeEach(() => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(
			makeEncountersClient(pulliEncountersSnapshot).client
		);
	});

	afterEach(() => {
		cleanup();
	});

	it('renders heading', async () => {
		render(await Page());
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('Pulli');
	});

	it('shows every fixture row in the table', async () => {
		render(await Page());
		const table = await screen.findByRole('table');
		const rows = table.querySelectorAll('tbody tr');
		expect(rows.length).toBe(
			(pulliEncountersSnapshot as PulliEncounter[]).length
		);
	});

	it("renders each row's formatted visit date", async () => {
		render(await Page());
		const table = await screen.findByRole('table');
		expect(table.textContent).toContain('01 Mar 2024');
	});

	it('renders ring_no as a link to /bird/[ringNo]', async () => {
		render(await Page());
		const table = await screen.findByRole('table');
		const firstRow = table.querySelectorAll('tbody tr')[0];
		const link = firstRow.querySelector('a');
		expect(link).toBeTruthy();
		expect(link?.getAttribute('href')).toBe('/bird/APULLI02');
	});

	it('renders species, location, and notes columns', async () => {
		render(await Page());
		const table = await screen.findByRole('table');
		const headers = [...table.querySelectorAll('thead th')].map(
			(th) => th.textContent
		);
		expect(headers).toContain('Species');
		expect(headers).toContain('Location');
		expect(headers).toContain('Notes');
		expect(table.textContent).toContain('Blue Tit');
		expect(table.textContent).toContain('Garden Feeder Station');
		expect(table.textContent).toContain('Nest box 3');
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
			row.textContent?.includes('APULLI02')
		)!;
		const notesCell = rowWithNoNotes.querySelectorAll('td')[4];
		expect(notesCell.textContent).toBe('–');
	});

	it('renders empty state gracefully when there are no pulli encounters', async () => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(
			makeEncountersClient([]).client
		);
		render(await Page());
		const table = await screen.findByRole('table');
		const rows = table.querySelectorAll('tbody tr');
		expect(rows.length).toBe(0);
	});
});

describe('fetchPulliPageContent query building', () => {
	afterEach(() => {
		cleanup();
	});

	it('filters encounters to the viewed group', async () => {
		const { client, chain } = makeEncountersClient(pulliEncountersSnapshot);
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
		await fetchPulliPageContent({}, 42);
		expect(chain.eq).toHaveBeenCalledWith('ringing_group_id', 42);
	});

	it('filters to session.session_type = PULLI via the embedded-join filter', async () => {
		const { client, chain } = makeEncountersClient(pulliEncountersSnapshot);
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
		await fetchPulliPageContent({}, 42);
		expect(chain.eq).toHaveBeenCalledWith('session.session_type', 'PULLI');
	});
});
