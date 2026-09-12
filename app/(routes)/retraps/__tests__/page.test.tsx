import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';
import retrapsSnapshot from '@/test-fixtures/snapshots/fetchNotableRetraps.alpha.json';
import type { NotableRetrapsResult } from '@/app/models/db';
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

describe('retraps page', () => {
	beforeEach(() => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(
			makeRpcClient(retrapsSnapshot)
		);
	});

	afterEach(() => {
		cleanup();
	});

	it('renders heading', async () => {
		render(await Page());
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('Notable Birds');
	});

	it('renders table with snapshot data', async () => {
		render(await Page());
		const table = await screen.findByRole('table');
		const rows = table.querySelectorAll('tbody tr');
		expect(rows.length).toBe(
			(retrapsSnapshot as NotableRetrapsResult[]).length
		);
		expect(getCellTextByHeading(table, 'Species', 0)).toBe(
			retrapsSnapshot[0].species_name
		);
		expect(getCellTextByHeading(table, 'Ring', 0)).toBe(
			retrapsSnapshot[0].ring_no
		);
	});

	it('renders empty table when no data', async () => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeRpcClient([]));
		render(await Page());
		const table = await screen.findByRole('table');
		const rows = table.querySelectorAll('tbody tr');
		expect(rows.length).toBe(0);
	});
});
