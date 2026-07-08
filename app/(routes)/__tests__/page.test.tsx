import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';
import recentSessionsSnapshot from '@/test-fixtures/snapshots/fetchRecentSessions.alpha.json';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/lib/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

vi.mock('@/app/actions/top-performers', () => ({
	getTopStats: vi.fn().mockResolvedValue([])
}));

function makeChainClient(data: unknown) {
	const thenable = {
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data, error: null }).then(resolve)
	};
	const chain = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		limit: vi.fn().mockReturnThis(),
		...thenable
	};
	return { from: vi.fn().mockReturnValue(chain) };
}

describe('home page', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(() => {
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(
			makeChainClient(recentSessionsSnapshot)
		);
	});

	it('renders Recent Sessions heading', async () => {
		render(await Page());
		const heading = await screen.findByRole('heading', {
			name: 'Recent Sessions'
		});
		expect(heading).toBeDefined();
	});

	it('renders stats accordion', async () => {
		render(await Page());
		const accordions = await screen.findAllByTestId('stats-accordion-group');
		expect(accordions.length).toBeGreaterThan(0);
	});

	it('renders session links from fixture', async () => {
		render(await Page());
		const heading = await screen.findByRole('heading', {
			name: 'Recent Sessions'
		});
		const sessionLinks =
			heading.nextElementSibling?.querySelectorAll('a') ?? [];
		expect(sessionLinks.length).toBe(recentSessionsSnapshot.length);
	});

	describe('with no recent sessions', () => {
		it('renders empty session list', async () => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(makeChainClient([]));
			render(await Page());
			const heading = await screen.findByRole('heading', {
				name: 'Recent Sessions'
			});
			const sessionLinks =
				heading.nextElementSibling?.querySelectorAll('a') ?? [];
			expect(sessionLinks.length).toBe(0);
		});
	});
});
