import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

function makeClient(publicAreas: string[]) {
	const chain = {
		eq: vi.fn(() => chain),
		single: vi.fn(() => chain),
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({
				data: { public_areas: publicAreas },
				error: null
			}).then(resolve)
	};
	return { from: vi.fn(() => ({ select: vi.fn(() => chain) })) };
}

describe('settings page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it('renders heading', async () => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeClient([]));
		render(await Page());
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('Settings');
	});

	it('reflects the toggle on when summary is in public_areas', async () => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(
			makeClient(['summary'])
		);
		render(await Page());
		const checkbox = (await screen.findByRole('checkbox', {
			name: 'Make my summary pages public'
		})) as HTMLInputElement;
		expect(checkbox.checked).toBe(true);
	});

	it('reflects the toggle off when summary is not in public_areas', async () => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeClient([]));
		render(await Page());
		const checkbox = (await screen.findByRole('checkbox', {
			name: 'Make my summary pages public'
		})) as HTMLInputElement;
		expect(checkbox.checked).toBe(false);
	});
});
