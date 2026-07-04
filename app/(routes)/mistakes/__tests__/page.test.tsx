import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';
import mistakesSnapshot from '@/test-fixtures/snapshots/fetchMistakes.alpha.json';
import type { DiscrepenciesResult } from '@/app/models/db';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/lib/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
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
	});

	afterEach(() => {
		cleanup();
	});

	it('renders heading', async () => {
		render(await Page());
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('Mistakes');
	});

	it('renders table with snapshot data', async () => {
		render(await Page());
		const table = await screen.findByRole('table');
		const rows = table.querySelectorAll('tbody tr');
		expect(rows.length).toBe(
			(mistakesSnapshot as DiscrepenciesResult[]).length
		);
		const firstRow = rows[0];
		const cells = firstRow.querySelectorAll('td');
		expect(cells[0].textContent?.trim()).toBe(mistakesSnapshot[0].ring_no);
		expect(cells[1].textContent).toBe(mistakesSnapshot[0].species_name);
		expect(cells[2].textContent).toBe(mistakesSnapshot[0].discrepency_type);
	});

	it('renders empty state when no data', async () => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeRpcClient([]));
		render(await Page());
		const table = await screen.findByRole('table');
		const rows = table.querySelectorAll('tbody tr');
		expect(rows.length).toBe(0);
	});
});
