import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';
import type { GroupTicksResult } from '@/app/models/db';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/lib/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

const ticksSnapshot: GroupTicksResult[] = [
	{ species_name: 'Carrion Crow', first_encounter_date: '2026-05-02' },
	{ species_name: 'Robin', first_encounter_date: '2025-11-20' },
	{ species_name: 'Blue Tit', first_encounter_date: '2024-03-01' }
];

function makeRpcClient(data: unknown) {
	const thenable = {
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data, error: null }).then(resolve)
	};
	return { rpc: vi.fn().mockReturnValue(thenable) };
}

describe('ticks page', () => {
	beforeEach(() => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(
			makeRpcClient(ticksSnapshot)
		);
	});

	afterEach(() => {
		cleanup();
	});

	it('renders heading', async () => {
		render(await Page());
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('Ticks');
	});

	it('renders one entry per tick, formatted as "{species} on {date}"', async () => {
		render(await Page());
		const list = await screen.findByRole('list');
		const items = list.querySelectorAll('li');
		expect(items.length).toBe(ticksSnapshot.length);
		expect(items[0].textContent).toBe('Carrion Crow on 2nd May 2026');
		expect(items[1].textContent).toBe('Robin on 20th November 2025');
		expect(items[2].textContent).toBe('Blue Tit on 1st March 2024');
	});

	it('renders ticks in the order returned by the server (most recent first)', async () => {
		render(await Page());
		const list = await screen.findByRole('list');
		const items = [...list.querySelectorAll('li')].map(
			(item) => item.textContent
		);
		expect(items).toEqual([
			'Carrion Crow on 2nd May 2026',
			'Robin on 20th November 2025',
			'Blue Tit on 1st March 2024'
		]);
	});

	describe('with no ticks yet', () => {
		it('renders a friendly empty state instead of a list', async () => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeRpcClient([]));
			render(await Page());
			await screen.findByRole('heading', { level: 1 });
			expect(screen.queryByRole('list')).toBeNull();
			expect(screen.getByText('No ticks yet.')).toBeDefined();
		});
	});
});
