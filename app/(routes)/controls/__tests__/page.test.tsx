import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';
import controlsSnapshot from '@/test-fixtures/snapshots/fetchRingSequenceControls.alpha.json';
import type { RingSequenceControlRow } from '@/app/actions/ring-sequences';
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

describe('controls page', () => {
	beforeEach(() => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(
			makeRpcClient(controlsSnapshot)
		);
	});

	afterEach(() => {
		cleanup();
	});

	it('renders heading', async () => {
		render(await Page());
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('Controls');
	});

	it('renders table with snapshot data', async () => {
		render(await Page());
		const table = await screen.findByRole('table');
		const rows = table.querySelectorAll('tbody tr');
		expect(rows.length).toBe(
			(controlsSnapshot as RingSequenceControlRow[]).length
		);
		expect(getCellTextByHeading(table, 'Ring', 0)).toBe(
			controlsSnapshot[0].ring_no
		);
		expect(getCellTextByHeading(table, 'Species', 0)).toBe(
			controlsSnapshot[0].species_name
		);
		expect(getCellTextByHeading(table, 'First date', 0)).toBe(
			controlsSnapshot[0].first_date
		);
	});

	it('renders empty state when no data', async () => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeRpcClient([]));
		render(await Page());
		expect(await screen.findByText('No control birds found.')).toBeTruthy();
		expect(screen.queryByRole('table')).toBeNull();
	});
});
