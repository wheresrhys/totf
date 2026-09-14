import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';
import controlsSnapshot from '@/test-fixtures/snapshots/ring_sequence_controls/alpha.controls.json';
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

// Alpha's real seed data has no untracked control birds at all (the real
// captured `alpha.controls.json` fixture, imported above, is `[]` — #894), so
// it can only stand in for the page's real empty-state rendering (already
// covered below). Rendering a populated table needs an inline dataset
// instead.
const sampleControls = [
	{ ring_no: 'A123456', species_name: 'Robin', first_date: '2023-03-15' },
	{ ring_no: 'B789012', species_name: 'Blue Tit', first_date: '2023-05-22' },
	{ ring_no: 'C345678', species_name: 'Blackbird', first_date: '2024-01-10' }
] as RingSequenceControlRow[];

describe('controls page', () => {
	beforeEach(() => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(
			makeRpcClient(sampleControls)
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
		expect(rows.length).toBe(sampleControls.length);
		expect(getCellTextByHeading(table, 'Ring', 0)).toBe(
			sampleControls[0].ring_no
		);
		expect(getCellTextByHeading(table, 'Species', 0)).toBe(
			sampleControls[0].species_name
		);
		expect(getCellTextByHeading(table, 'First date', 0)).toBe(
			sampleControls[0].first_date
		);
	});

	// The real captured `alpha.controls.json` fixture (#894) exercises this
	// case for real: Alpha's seed data has no untracked control birds.
	it('renders empty state when no data', async () => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(
			makeRpcClient(controlsSnapshot)
		);
		render(await Page());
		expect(await screen.findByText('No control birds found.')).toBeTruthy();
		expect(screen.queryByRole('table')).toBeNull();
	});
});
