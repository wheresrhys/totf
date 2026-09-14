import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import Page, { fetchPulliPageContent } from '../page';
import pulliEncountersSnapshot from '@/test-fixtures/snapshots/tables/Encounters/alpha.pulli-encounters.json';
import type { PulliEncounter } from '@/app/models/session';
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
		// The real captured fixture's only row was ringed 2022-04-30 (#894).
		expect(table.textContent).toContain('30 Apr 2022');
	});

	it('renders ring_no as a link to /bird/[ringNo]', async () => {
		render(await Page());
		const table = await screen.findByRole('table');
		const firstRow = table.querySelectorAll('tbody tr')[0];
		const link = firstRow.querySelector('a');
		expect(link).toBeTruthy();
		expect(link?.getAttribute('href')).toBe('/bird/AR0002');
	});

	it('renders species and location columns', async () => {
		render(await Page());
		const table = await screen.findByRole('table');
		const headers = [...table.querySelectorAll('thead th')].map(
			(th) => th.textContent
		);
		expect(headers).toContain('Species');
		expect(headers).toContain('Location');
		expect(headers).toContain('Notes');
		expect(table.textContent).toContain('Robin');
		expect(table.textContent).toContain('Alpha Site A (CES)');
	});

	// Alpha's real seed data has only one PULLI encounter (#894), which can't
	// demonstrate a re-sort actually reordering rows — a small inline dataset
	// stands in here instead of the generated fixture.
	it('re-sorts rows when a column header is clicked', async () => {
		const twoRowFixture = [
			{
				id: 1,
				extra_text: null,
				bird: { ring_no: 'APULLI01', species: { species_name: 'Blue Tit' } },
				session: {
					visit_date: '2024-03-01',
					location: { location_name: 'Garden Feeder Station' }
				}
			},
			{
				id: 2,
				extra_text: null,
				bird: { ring_no: 'APULLI02', species: { species_name: 'Robin' } },
				session: {
					visit_date: '2024-06-15',
					location: { location_name: 'Garden Feeder Station' }
				}
			}
		] as unknown as PulliEncounter[];
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(
			makeEncountersClient(twoRowFixture).client
		);
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
		expect(getCellTextByHeading(table, 'Notes', 'AR0002')).toBe('–');
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
