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

	it('renders empty tab gracefully when no data', async () => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeRpcClient([]));
		render(await Page());
		const tabList = screen.queryByRole('tablist');
		expect(tabList?.querySelectorAll('button').length ?? 0).toBe(0);
	});
});
