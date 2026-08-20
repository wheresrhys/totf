import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/lib/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

const TEST_DATE = '2024-03-15';
const TEST_GROUP_ID = 1;
const TEST_GROUP_SLUG = 'test-group-slug';

function makeChain(data: unknown) {
	return {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		maybeSingle: vi.fn().mockReturnThis(),
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data, error: null }).then(resolve)
	};
}

function makeGroupSlugOnlyClient() {
	const from = vi.fn((table: string) => {
		if (table === 'RingingGroups') {
			return makeChain({ id: TEST_GROUP_ID });
		}
		throw new Error(`Unexpected table query in session-temp page: ${table}`);
	});
	return { from };
}

function renderPage() {
	return Page({
		params: Promise.resolve({ groupSlug: TEST_GROUP_SLUG, date: TEST_DATE })
	});
}

describe('session-temp detail page', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(() => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(
			makeGroupSlugOnlyClient()
		);
	});

	it('renders the formatted date as a level-1 heading', async () => {
		render(await renderPage());
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toContain('Fri 15th March 2024');
	});

	it('does not query Sessions or Encounters tables', async () => {
		const client = makeGroupSlugOnlyClient();
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(client);
		render(await renderPage());
		await screen.findByRole('heading', { level: 1 });
		const queriedTables = client.from.mock.calls.map(([table]) => table);
		expect(queriedTables).not.toContain('Sessions');
		expect(queriedTables).not.toContain('Encounters');
	});

	it('renders a heading for a date with no matching session in the database', async () => {
		// The stubbed dataFetcher never checks Sessions/Encounters, so a date
		// with no corresponding session row still renders successfully.
		render(await renderPage());
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toContain('15th March 2024');
	});
});
